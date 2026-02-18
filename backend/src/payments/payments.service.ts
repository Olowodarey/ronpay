import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AGENT_CONFIG } from '../agent/agent-config';
import { CeloService, CELO_TOKENS } from '../blockchain/celo.service';
import { MentoService } from '../blockchain/mento.service';
import { IdentityService } from '../blockchain/identity.service';
import { RouteOptimizerService } from '../blockchain/route-optimizer.service';
import { AiService } from '../ai/ai.service';
import { ClaudeService } from '../ai/claude.service';
import { GeminiService } from '../ai/gemini.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NellobytesService } from '../nellobytes/nellobytes.service';
import { ConversationService } from '../transactions/conversation.service';
import {
  NaturalLanguagePaymentDto,
  ExecutePaymentDto,
} from './dto/natural-language-payment.dto';
import { Address } from 'viem';
import { PaymentIntent } from '../types';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private celoService: CeloService,
    private aiService: AiService,
    private transactionsService: TransactionsService,
    private mentoService: MentoService,
    private identityService: IdentityService,
    private nellobytesService: NellobytesService,
    private claudeService: ClaudeService,
    private geminiService: GeminiService,
    private routeOptimizer: RouteOptimizerService,
    private conversationService: ConversationService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // Shared: Recipient Resolution
  // ────────────────────────────────────────────────────────────

  /**
   * Resolve a recipient string to a valid Celo address.
   * If it's already a valid 0x address, return it directly.
   * Otherwise, try ODIS phone number resolution.
   */
  private async resolveRecipient(rawRecipient: string): Promise<Address> {
    if (this.celoService.isValidAddress(rawRecipient)) {
      return rawRecipient as Address;
    }

    // Try phone number / alias resolution via ODIS
    const resolved =
      await this.identityService.resolvePhoneNumber(rawRecipient);
    if (resolved) {
      this.logger.log(`Resolved ${rawRecipient} → ${resolved}`);
      return resolved as Address;
    }

    throw new BadRequestException(
      `Unable to resolve recipient: ${rawRecipient}. Please use a valid Celo address or registered phone number.`,
    );
  }

  // ────────────────────────────────────────────────────────────
  // Parse Intent (AI-powered)
  // ────────────────────────────────────────────────────────────

  /**
   * Parse natural language and return transaction data for client-side signing
   * MiniPay-compatible: Returns unsigned transaction
   */
  async parsePaymentIntent(dto: NaturalLanguagePaymentDto) {
    // 1. Select AI Service
    let aiService = this.aiService;
    if (dto.aiProvider === 'claude') {
      aiService = this.claudeService;
    } else if (dto.aiProvider === 'gemini') {
      aiService = this.geminiService;
    }

    // 2. Get or create conversation session for context
    const sessionId = await this.conversationService.getOrCreateSession(
      dto.senderAddress,
    );

    // 3. Store user message in conversation
    await this.conversationService.addMessage(
      dto.senderAddress,
      sessionId,
      'user',
      dto.message,
    );

    // 4. Build contextual message with conversation history
    const history = await this.conversationService.getSessionHistory(sessionId);
    const context = this.conversationService.formatContextForAI(
      history.slice(0, -1),
    ); // exclude current
    const contextualMessage = context
      ? `${dto.message}\n${context}`
      : dto.message;

    // 5. Parse intent with selected AI (with context)
    const intent = await aiService.parsePaymentIntent(
      contextualMessage,
      dto.language,
    );
    this.logger.log(`Parsed intent: ${JSON.stringify(intent)}`);

    // 6. Validate confidence
    if (!intent || (intent.confidence && intent.confidence < 0.5)) {
      throw new BadRequestException(
        'Unable to understand payment request with sufficient confidence. Please be more specific.',
      );
    }

    // 7. Store assistant response in conversation
    await this.conversationService.addMessage(
      dto.senderAddress,
      sessionId,
      'assistant',
      `Parsed: ${intent.action} ${intent.amount || ''} ${intent.currency || ''}`,
      intent,
    );

    // Airtime Flow
    if (['buy_airtime'].includes(intent.action)) {
      return { sessionId, ...(await this.handleAirtimeIntent(intent)) };
    }

    // Standard Crypto Transfer Flow
    if (intent.action === 'send_payment') {
      return { sessionId, ...(await this.buildTransferResponse(intent)) };
    }

    throw new BadRequestException(
      `Action "${intent.action}" not supported yet.`,
    );
  }

  // ────────────────────────────────────────────────────────────
  // Parse Intent (Direct — bypasses AI)
  // ────────────────────────────────────────────────────────────

  /**
   * Parse payment intent directly (bypasses AI — for development/testing)
   * Useful for saving AI tokens during development
   */
  async parsePaymentIntentDirect(intent: PaymentIntent, senderAddress: string) {
    this.logger.log(
      `Direct intent parsing (bypassing AI): ${JSON.stringify(intent)}`,
    );

    if (!intent || (intent.confidence && intent.confidence < 0.5)) {
      throw new BadRequestException(
        'Invalid payment intent. Please provide all required fields.',
      );
    }

    // Airtime Flow
    if (['buy_airtime'].includes(intent.action)) {
      return this.handleAirtimeIntent(intent);
    }

    // Standard Crypto Transfer Flow
    if (intent.action === 'send_payment') {
      return this.buildTransferResponse(intent, senderAddress);
    }

    throw new BadRequestException(
      `Action "${intent.action}" not supported yet.`,
    );
  }

  // ────────────────────────────────────────────────────────────
  // Shared: Build transfer response
  // ────────────────────────────────────────────────────────────

  /**
   * Validate intent fields, resolve recipient, and build the unsigned transaction.
   * Shared by both parsePaymentIntent() and parsePaymentIntentDirect().
   *
   * Cross-currency logic:
   * - If sourceCurrency != currency, get Mento quote and build tx in sourceCurrency
   * - The recipient gets sourceCurrency tokens (they can swap later)
   * - Exchange rate info is included in the response
   */
  private async buildTransferResponse(
    intent: PaymentIntent,
    senderAddress?: string,
  ) {
    if (!intent.recipient) {
      throw new BadRequestException(
        'Could not determine payment recipient from message',
      );
    }
    if (!intent.amount || intent.amount <= 0) {
      throw new BadRequestException(
        'Could not determine valid payment amount from message',
      );
    }

    // Spending limit enforcement
    if (intent.amount > AGENT_CONFIG.maxTransactionAmount) {
      throw new BadRequestException(
        `Transaction amount $${intent.amount} exceeds the maximum limit of $${AGENT_CONFIG.maxTransactionAmount}. Please reduce the amount.`,
      );
    }

    const recipientAddress = await this.resolveRecipient(intent.recipient);
    const destinationCurrency = intent.currency || 'USDm';
    const sourceCurrency = intent.sourceCurrency || destinationCurrency;

    let sendAmount = intent.amount.toString();
    let exchangeRate: any = null;
    let transactionData: any = null;
    let actionRequired: string | null = null;

    // Cross-currency: get Mento quote and build tx in source token
    if (sourceCurrency !== destinationCurrency) {
      try {
        // 1. Get exact amount of source token needed for the destination amount (Fixed Output)
        const quote = await this.mentoService.getAmountInQuote(
          sourceCurrency as keyof typeof CELO_TOKENS,
          destinationCurrency as keyof typeof CELO_TOKENS,
          intent.amount.toString(),
        );
        sendAmount = quote.amountIn;

        exchangeRate = {
          from: sourceCurrency,
          to: destinationCurrency,
          rate: quote.price,
          debitAmount: sendAmount,
          receiveAmount: intent.amount.toString(),
          source: quote.source,
        };

        this.logger.log(
          `Cross-currency (Swap): Need ${sendAmount} ${sourceCurrency} to get ${intent.amount} ${destinationCurrency}`,
        );

        // 2. Check allowance for the Broker
        if (senderAddress) {
          const brokerAddress = this.celoService.getBrokerAddress();
          const allowance = await this.celoService.getAllowance(
            sourceCurrency as keyof typeof CELO_TOKENS,
            senderAddress as Address,
            brokerAddress,
          );

          if (parseFloat(allowance) < parseFloat(sendAmount)) {
            this.logger.log(
              `Insufficient allowance for Broker. Required: ${sendAmount}, Current: ${allowance}`,
            );

            // Build approval transaction instead of swap
            transactionData = await this.celoService.buildApproveTransaction(
              sourceCurrency as keyof typeof CELO_TOKENS,
              brokerAddress,
              '1000000.0', // Large approval for convenience
            );

            actionRequired = 'APPROVE_REQUIRED';

            return {
              intent,
              transaction: transactionData,
              actionRequired,
              parsedCommand: {
                recipient: recipientAddress,
                amount: intent.amount,
                currency: destinationCurrency,
                sourceCurrency,
                sendAmount,
              },
              exchangeRate,
              summary: `You need to approve the Mento Broker to spend your ${sourceCurrency} before swapping.`,
            };
          }
        }

        // 3. Build the Swap transaction data
        const swapTx = await this.mentoService.buildSwapTransaction(
          sourceCurrency as keyof typeof CELO_TOKENS,
          destinationCurrency as keyof typeof CELO_TOKENS,
          intent.amount.toString(),
          (parseFloat(sendAmount) * 1.01).toFixed(6), // 1% slippage margin
        );

        this.logger.log(
          `Swap transaction built: ${JSON.stringify(swapTx, null, 2)}`,
        );

        // Update the transaction data to be the swap transaction
        transactionData = {
          to: swapTx.to as Address,
          value: swapTx.value,
          data: swapTx.data as `0x${string}`,
          feeCurrency: (this.celoService.getTokenMap() as any).USDm,
        };

        // 4. Check if this is a transfer to a third party (Swap AND Send)
        if (
          senderAddress &&
          recipientAddress.toLowerCase() !== senderAddress.toLowerCase()
        ) {
          this.logger.log(
            `Third-party transfer detected: ${senderAddress} -> ${recipientAddress}. Preparing SWAP_THEN_SEND.`,
          );

          // Build the second transaction (Transfer)
          const transferTx = await this.celoService.buildPaymentTransaction(
            recipientAddress,
            intent.amount.toString(),
            destinationCurrency as keyof typeof CELO_TOKENS,
          );

          actionRequired = 'SWAP_THEN_SEND';

          // Return immediately with the special action
          return {
            intent,
            transaction: transactionData, // Step 1: Swap
            nextTransaction: transferTx,  // Step 2: Send
            actionRequired,
            parsedCommand: {
              recipient: recipientAddress,
              amount: intent.amount,
              currency: destinationCurrency,
              sourceCurrency,
              sendAmount, // Amount of source currency to spend
              memo: intent.memo,
            },
            exchangeRate,
            summary: `Step 1: Swap ${sourceCurrency} to ${destinationCurrency}. Step 2: Send to ${intent.recipient}.`,
          };
        }

        this.logger.log(
          `Swap transaction data: ${JSON.stringify(transactionData, null, 2)}`,
        );
      } catch (error) {
        this.logger.error(`Mento swap building failed: ${error.message}`);
        throw new BadRequestException(
          `Cannot build swap for ${sourceCurrency} → ${destinationCurrency}: ${error.message}`,
        );
      }
    } else {
      // Standard same-currency transfer
      transactionData = await this.celoService.buildPaymentTransaction(
        recipientAddress,
        sendAmount,
        sourceCurrency as any,
      );
    }

    // Confirmation flag for amounts above threshold
    const requiresConfirmation =
      intent.amount > AGENT_CONFIG.confirmationThreshold;

    return {
      intent,
      transaction: transactionData,
      requiresConfirmation,
      ...(requiresConfirmation && {
        confirmationMessage: `This transaction of $${intent.amount} exceeds $${AGENT_CONFIG.confirmationThreshold}. Please confirm to proceed.`,
      }),
      parsedCommand: {
        recipient: recipientAddress,
        originalRecipient: intent.recipient,
        amount: intent.amount,
        currency: destinationCurrency,
        sourceCurrency,
        sendAmount,
        memo: intent.memo,
      },
      ...(exchangeRate && { exchangeRate }),
    };
  }

  // ────────────────────────────────────────────────────────────
  // Airtime Flow
  // ────────────────────────────────────────────────────────────

  /**
   * Handle Airtime intents
   * Flow: User pays USDm to Treasury → Backend detects tx → Backend triggers Nellobytes
   */
  private async handleAirtimeIntent(intent: PaymentIntent) {
    const amountInNgn = intent.amount;
    const phoneNumber = intent.recipient;

    if (!amountInNgn) {
      throw new BadRequestException('amount field is required');
    }

    if (!phoneNumber) {
      throw new BadRequestException(
        'recipient (phone number) field is required for airtime',
      );
    }

    // Spending limit enforcement (approximate USD conversion)
    const estimatedUsd = amountInNgn / 1500; // rough NGN→USD for limit check
    if (estimatedUsd > AGENT_CONFIG.maxTransactionAmount) {
      throw new BadRequestException(
        `Estimated transaction value ~$${estimatedUsd.toFixed(0)} exceeds the maximum limit of $${AGENT_CONFIG.maxTransactionAmount}.`,
      );
    }

    // Detect network from phone number
    const detectedNetwork = this.nellobytesService.detectNetwork(phoneNumber);
    this.logger.log(
      `Airtime intent: Detected network "${detectedNetwork}" from phone ${phoneNumber}`,
    );

    let exchangeRate = 1500; // Fallback
    let amountInUsdm = '0.07';
    let routeUsed = 'fallback';

    try {
      // Try optimized multi-corridor routing first
      const bestRoute = await this.routeOptimizer.findBestRoute(
        'NGNm',
        'USDm',
        amountInNgn.toString(),
      );

      amountInUsdm = parseFloat(bestRoute.bestRoute.amountOut).toFixed(2);
      exchangeRate = 1 / bestRoute.bestRoute.price;
      routeUsed = bestRoute.bestRoute.source;

      this.logger.log(
        `Route optimizer: ${bestRoute.bestRoute.path.join(' → ')} = ${amountInUsdm} USDm (${routeUsed})`,
      );
    } catch (routeError) {
      this.logger.warn(
        `Route optimizer failed, falling back to direct Mento: ${routeError.message}`,
      );

      try {
        const quote = await this.mentoService.getSwapQuote(
          'NGNm',
          'USDm',
          amountInNgn.toString(),
        );
        amountInUsdm = parseFloat(quote.amountOut).toFixed(2);
        exchangeRate = 1 / quote.price;
        routeUsed = 'mento-direct-fallback';
      } catch (mentoError) {
        this.logger.error(
          'All routing failed, using static fallback',
          mentoError.stack,
        );
        amountInUsdm = (amountInNgn / 1500).toFixed(2);
        routeUsed = 'static-fallback';
      }
    }

    // Get Treasury Address
    const treasuryAddress = process.env.RONPAY_TREASURY_ADDRESS;
    if (!treasuryAddress) {
      throw new InternalServerErrorException('Treasury address not configured');
    }

    // Build Transaction: User → Treasury
    const transactionData = await this.celoService.buildPaymentTransaction(
      treasuryAddress as Address,
      amountInUsdm,
      'USDm',
    );

    this.logger.log(`Airtime tx built: ${amountInUsdm} USDm → treasury`);

    const provider = 'NELLOBYTES';

    return {
      intent,
      transaction: transactionData,
      routing: {
        routeUsed,
        exchangeRate,
      },
      meta: {
        serviceType: intent.action,
        provider: provider,
        biller: intent.biller || intent.provider || detectedNetwork || '', // Store detected network
        recipient: intent.recipient,
        detectedNetwork: detectedNetwork || 'AUTO_DETECT', // Explicitly store for clarity
        originalAmountNgn: amountInNgn,
        exchangeRate,
        variation_code: intent.package,
      },
      parsedCommand: {
        recipient: 'RonPay Treasury',
        amount: parseFloat(amountInUsdm),
        currency: 'USDm',
        memo: `Payment for ${intent.biller || 'Service'} ${intent.package || ''}`,
      },
    };
  }

  // ────────────────────────────────────────────────────────────
  // Record Transaction (post-signing)
  // ────────────────────────────────────────────────────────────

  /**
   * Record a transaction that was executed client-side (by MiniPay)
   * For VTPASS: If we see a successful payment to Treasury with VTPASS metadata, trigger the service.
   */
  async recordTransaction(dto: ExecutePaymentDto) {
    console.log('dto.metadata', dto);

    if (!/^0x[a-fA-F0-9]{64}$/.test(dto.txHash)) {
      throw new BadRequestException('Invalid transaction hash format');
    }

    const transaction = await this.transactionsService.create({
      fromAddress: dto.fromAddress.toLowerCase(),
      toAddress: dto.toAddress.toLowerCase(),
      amount: dto.amount,
      currency: dto.currency,
      txHash: dto.txHash,
      status: 'pending',
      intent: dto.intent || '',
      memo: dto.memo || '',
      type:
        dto.type ||
        (dto.intent?.includes('buy') || dto.intent?.includes('pay')
          ? 'bill_payment'
          : 'transfer'),
      serviceId: dto.serviceId,
      metadata: dto.metadata,
    });

    // Monitor transaction confirmation in background
    this.celoService
      .waitForTransaction(dto.txHash as `0x${string}`)
      .then(async (receipt) => {
        if (receipt.status === 'success') {
          await this.transactionsService.updateStatus(dto.txHash, 'success');

          const treasuryAddress = process.env.RONPAY_TREASURY_ADDRESS;
          const isToTreasury =
            dto.toAddress.toLowerCase() === treasuryAddress?.toLowerCase();

          this.logger.debug('dto.metadata', dto.metadata);

          if (
            isToTreasury &&
            dto.metadata &&
            dto.metadata.provider === 'NELLOBYTES'
          ) {
            this.logger.log(
              `Verifying token receipt for treasury: ${dto.txHash}`,
            );

            const isVerified = await this.celoService.verifyERC20Transfer(
              dto.txHash as `0x${string}`,
              treasuryAddress as Address,
              dto.amount.toString(),
              dto.currency as any,
            );

            if (!isVerified) {
              this.logger.error(
                `Token transfer verification failed: ${dto.txHash}`,
              );
              await this.transactionsService.updateStatus(
                dto.txHash,
                'failed_verification',
              );
              return;
            }

            this.logger.log(
              `Token receipt verified. Triggering Provider: ${dto.metadata.provider} for ${dto.txHash}`,
            );
            try {
              // Use detected network if available, otherwise fallback to auto-detect
              const networkToUse =
                dto.metadata.detectedNetwork ||
                dto.metadata.biller ||
                dto.metadata.recipient ||
                '';

              this.logger.log(
                `Airtime purchase: Using network='${networkToUse}', phone='${dto.metadata.recipient}'`,
              );

              await this.nellobytesService.buyAirtime({
                mobile_network: networkToUse,
                amount: dto.metadata.originalAmountNgn || 100,
                mobile_number: dto.metadata.recipient,
                request_id: dto.txHash,
              });

              await this.transactionsService.updateStatus(
                dto.txHash,
                'success_delivered',
              );
            } catch (err) {
              this.logger.error(
                `Service execution failed after payment: ${err.message}`,
                err.stack,
              );
              await this.transactionsService.updateStatus(
                dto.txHash,
                'failed_service_error',
              );
            }
          }
        } else {
          await this.transactionsService.updateStatus(dto.txHash, 'failed');
        }
      })
      .catch((error) => {
        this.logger.error(
          `Transaction confirmation error: ${error.message}`,
          error.stack,
        );
        this.transactionsService.updateStatus(dto.txHash, 'failed');
      });

    return {
      success: true,
      transaction,
      message: 'Transaction recorded and being monitored',
    };
  }

  // ────────────────────────────────────────────────────────────
  // Balance & Token Queries
  // ────────────────────────────────────────────────────────────

  async getBalance(address: string) {
    if (!this.celoService.isValidAddress(address)) {
      throw new BadRequestException(`Invalid address: ${address}`);
    }

    const balances = await this.celoService.getAllBalances(address as Address);

    return {
      address,
      balances,
      timestamp: new Date().toISOString(),
    };
  }

  getSupportedTokens() {
    return {
      tokens: this.celoService.getSupportedTokens(),
      addresses: CELO_TOKENS,
    };
  }

  /**
   * Get a Mento swap quote for cross-currency transfers
   * e.g. "How much USDm do I need to send 1000 NGNm?"
   */
  async getSwapQuote(
    from: string,
    to: string,
    amount: string,
    mode: 'fixedInput' | 'fixedOutput' = 'fixedInput',
  ) {
    if (!from || !to || !amount) {
      throw new BadRequestException('from, to, and amount are required');
    }

    if (from === to) {
      return {
        from,
        to,
        amountIn: amount,
        amountOut: amount,
        rate: 1,
        source: 'direct',
      };
    }

    if (mode === 'fixedOutput') {
      // Fixed Output: specify amount recipient gets, calculate what sender pays (amountIn)
      const quote = await this.mentoService.getAmountInQuote(
        from as keyof typeof CELO_TOKENS,
        to as keyof typeof CELO_TOKENS,
        amount,
      );

      return {
        from,
        to,
        sendAmount: amount, // Amount recipient gets (fixed)
        debitAmount: quote.amountIn, // Amount debited from sender (calculated)
        rate: quote.price,
        source: quote.source,
        summary: `Sending ${amount} ${to} will cost ${parseFloat(quote.amountIn).toFixed(4)} ${from}`,
      };
    }

    // Fixed Input (Existing): specify amount sender pays, calculate what recipient gets (amountOut)
    const quote = await this.mentoService.getSwapQuote(
      from as keyof typeof CELO_TOKENS,
      to as keyof typeof CELO_TOKENS,
      amount,
    );

    return {
      from,
      to,
      sendAmount: quote.amountOut, // Amount recipient gets (calculated)
      debitAmount: amount, // Amount debited from sender (fixed)
      rate: quote.price,
      source: quote.source,
      summary: `Sending ${amount} ${from} will result in ${parseFloat(quote.amountOut).toFixed(4)} ${to}`,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Airtime Purchase (dedicated endpoint)
  // ────────────────────────────────────────────────────────────

  /**
   * Complete Airtime purchase flow
   * Called after user pays treasury on blockchain
   *
   * Flow:
   * 1. Verify blockchain transaction
   * 2. Trigger Nellobytes API to purchase airtime
   * 3. Track transaction in local database
   */
  async purchaseAirtime(dto: {
    txHash: string;
    phoneNumber: string;
    amount: number;
    provider?: string;
    walletAddress?: string;
    memo?: string;
    skipVerification?: boolean;
  }) {
    this.logger.log(
      `Processing airtime purchase: ${JSON.stringify({
        txHash: dto.txHash,
        phoneNumber: dto.phoneNumber,
        amount: dto.amount,
        provider: dto.provider,
        providerFallback: 'AUTO_DETECT',
      })}`,
    );

    // 1. Validate parameters
    if (!dto.phoneNumber || !dto.amount) {
      throw new BadRequestException(
        'Missing required fields: phoneNumber, amount',
      );
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const skipVerification = isDev && (dto as any).skipVerification === true;

    if (!skipVerification) {
      const treasuryAddress = process.env.RONPAY_TREASURY_ADDRESS;
      if (!treasuryAddress) {
        throw new InternalServerErrorException(
          'Treasury address not configured',
        );
      }

      // Dynamically calculate expected USDm amount from Mento
      let expectedUsdm = '0.07'; // fallback
      try {
        const quote = await this.mentoService.getSwapQuote(
          'NGNm',
          'USDm',
          dto.amount.toString(),
        );
        expectedUsdm = parseFloat(quote.amountOut).toFixed(2);
        this.logger.log(
          `Dynamic verification amount: ${expectedUsdm} USDm for ${dto.amount} NGN`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to get Mento quote for verification, using fallback: ${error.message}`,
        );
        expectedUsdm = (dto.amount / 1500).toFixed(2);
      }

      this.logger.log(`Verifying token receipt for treasury: ${dto.txHash}`);
      const isVerified = await this.celoService.verifyERC20Transfer(
        dto.txHash as `0x${string}`,
        treasuryAddress as Address,
        expectedUsdm,
        'USDm',
      );

      if (!isVerified) {
        this.logger.error(`Token transfer verification failed: ${dto.txHash}`);
        throw new BadRequestException(
          'Transaction verification failed. Please ensure you have paid the correct amount to the treasury.',
        );
      }
    } else {
      this.logger.log('Skipping verification for direct test call');
    }

    // 2. Call Service to purchase airtime
    try {
      // Use Nellobytes for airtime
      const response = await this.nellobytesService.buyAirtime({
        mobile_network: dto.provider || '', // Pass empty string to trigger auto-detection if provider is missing
        amount: dto.amount,
        mobile_number: dto.phoneNumber,
        request_id: dto.txHash,
      });

      const transactionStatus =
        response.status === 'ORDER_COMPLETED' ||
        response.status === 'ORDER_RECEIVED'
          ? 'delivered'
          : 'pending';

      return {
        success: transactionStatus === 'delivered',
        message: response.status || 'Airtime purchase processing',
        vtpassTransactionId: response.orderid, // Mapping Nellobytes orderid to this field for compatibility
        localTxHash: dto.txHash,
        blockchainTxHash: dto.txHash,
        phoneNumber: dto.phoneNumber,
        provider: dto.provider || response.mobilenetwork || 'AUTO_DETECT',
        amount: dto.amount,
        currency: 'NGN',
        status: transactionStatus,
        transactionDate: new Date(),
        estimatedDeliveryTime:
          transactionStatus === 'delivered'
            ? 'Airtime delivered successfully'
            : 'Airtime will be delivered in 2-3 minutes',
        fullResponse: response,
      };
    } catch (error) {
      this.logger.error(
        `Airtime purchase failed: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to process airtime purchase: ${error.message}`,
      );
    }
  }
}
