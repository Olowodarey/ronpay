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
import { AiService } from '../ai/ai.service';
import { ClaudeService } from '../ai/claude.service';
import { GeminiService } from '../ai/gemini.service';
import { TransactionsService } from '../transactions/transactions.service';
import { VtpassService } from '../vtpass/vtpass.service';
import {
  NaturalLanguagePaymentDto,
  ExecutePaymentDto,
} from './dto/natural-language-payment.dto';
import { Address } from 'viem';
import { PaymentIntent } from '../types';
import { PurchaseAirtimeDto } from '../vtpass/dto/vtpass-airtime.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private celoService: CeloService,
    private aiService: AiService,
    private transactionsService: TransactionsService,
    private mentoService: MentoService,
    private identityService: IdentityService,
    private vtpassService: VtpassService,
    private claudeService: ClaudeService,
    private geminiService: GeminiService,
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
    const resolved = await this.identityService.resolvePhoneNumber(rawRecipient);
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

    // 2. Parse intent with selected AI
    const intent = await aiService.parsePaymentIntent(dto.message, dto.language);
    this.logger.log(`Parsed intent: ${JSON.stringify(intent)}`);

    // 3. Validate confidence
    if (!intent || (intent.confidence && intent.confidence < 0.5)) {
      throw new BadRequestException(
        'Unable to understand payment request with sufficient confidence. Please be more specific.',
      );
    }

    // VTPASS Flows (Airtime, Data, Bills)
    if (['buy_airtime', 'buy_data', 'pay_bill'].includes(intent.action)) {
      return this.handleVtpassIntent(intent);
    }

    // Standard Crypto Transfer Flow
    if (intent.action === 'send_payment') {
      return this.buildTransferResponse(intent);
    }

    throw new BadRequestException(`Action "${intent.action}" not supported yet.`);
  }

  // ────────────────────────────────────────────────────────────
  // Parse Intent (Direct — bypasses AI)
  // ────────────────────────────────────────────────────────────

  /**
   * Parse payment intent directly (bypasses AI — for development/testing)
   * Useful for saving AI tokens during development
   */
  async parsePaymentIntentDirect(intent: PaymentIntent, senderAddress: string) {
    this.logger.log(`Direct intent parsing (bypassing AI): ${JSON.stringify(intent)}`);

    if (!intent || (intent.confidence && intent.confidence < 0.5)) {
      throw new BadRequestException(
        'Invalid payment intent. Please provide all required fields.',
      );
    }

    // VTPASS Flows
    if (['buy_airtime', 'buy_data', 'pay_bill'].includes(intent.action)) {
      return this.handleVtpassIntent(intent);
    }

    // Standard Crypto Transfer Flow
    if (intent.action === 'send_payment') {
      return this.buildTransferResponse(intent);
    }

    throw new BadRequestException(`Action "${intent.action}" not supported yet.`);
  }

  // ────────────────────────────────────────────────────────────
  // Shared: Build transfer response
  // ────────────────────────────────────────────────────────────

  /**
   * Validate intent fields, resolve recipient, and build the unsigned transaction.
   * Shared by both parsePaymentIntent() and parsePaymentIntentDirect().
   */
  private async buildTransferResponse(intent: PaymentIntent) {
    if (!intent.recipient) {
      throw new BadRequestException('Could not determine payment recipient from message');
    }
    if (!intent.amount || intent.amount <= 0) {
      throw new BadRequestException('Could not determine valid payment amount from message');
    }

    // Spending limit enforcement
    if (intent.amount > AGENT_CONFIG.maxTransactionAmount) {
      throw new BadRequestException(
        `Transaction amount $${intent.amount} exceeds the maximum limit of $${AGENT_CONFIG.maxTransactionAmount}. Please reduce the amount.`,
      );
    }

    const recipientAddress = await this.resolveRecipient(intent.recipient);
    const currency = intent.currency || 'USDm';

    const transactionData = await this.celoService.buildPaymentTransaction(
      recipientAddress,
      intent.amount.toString(),
      currency as any,
    );

    // Confirmation flag for amounts above threshold
    const requiresConfirmation = intent.amount > AGENT_CONFIG.confirmationThreshold;

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
        currency,
        memo: intent.memo,
      },
    };
  }

  // ────────────────────────────────────────────────────────────
  // VTPASS Flows (Airtime, Bills)
  // ────────────────────────────────────────────────────────────

  /**
   * Handle VTPASS intents (Airtime, Bills)
   * Flow: User pays USDm to Treasury → Backend detects tx → Backend triggers VTPASS
   */
  private async handleVtpassIntent(intent: PaymentIntent) {
    const amountInNgn = intent.amount;

    if (!amountInNgn) {
      throw new BadRequestException('amount field is required');
    }

    // Spending limit enforcement (approximate USD conversion)
    const estimatedUsd = amountInNgn / 1500; // rough NGN→USD for limit check
    if (estimatedUsd > AGENT_CONFIG.maxTransactionAmount) {
      throw new BadRequestException(
        `Estimated transaction value ~$${estimatedUsd.toFixed(0)} exceeds the maximum limit of $${AGENT_CONFIG.maxTransactionAmount}.`,
      );
    }

    let exchangeRate = 1500; // Fallback
    let amountInUsdm = '0.07';

    try {
      const quote = await this.mentoService.getSwapQuote(
        'NGNm',
        'USDm',
        amountInNgn.toString(),
      );

      this.logger.log(`Mento quote: ${JSON.stringify(quote)}`);
      amountInUsdm = parseFloat(quote.amountOut).toFixed(2);
      exchangeRate = 1 / quote.price;
    } catch (error) {
      this.logger.error('Failed to get Mento rate for VTPASS, using fallback', error.stack);
      amountInUsdm = (amountInNgn / 1500).toFixed(2);
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

    this.logger.log(`VTPASS tx built: ${amountInUsdm} USDm → treasury`);

    return {
      intent,
      transaction: transactionData,
      meta: {
        serviceType: intent.action,
        provider: intent.biller || intent.provider || 'VTPASS',
        recipient: intent.recipient,
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

          if (
            isToTreasury &&
            dto.metadata &&
            dto.metadata.provider === 'VTPASS'
          ) {
            this.logger.log(`Verifying token receipt for treasury: ${dto.txHash}`);

            const isVerified = await this.celoService.verifyERC20Transfer(
              dto.txHash as `0x${string}`,
              treasuryAddress as Address,
              dto.amount.toString(),
              dto.currency as any,
            );

            if (!isVerified) {
              this.logger.error(`Token transfer verification failed: ${dto.txHash}`);
              await this.transactionsService.updateStatus(dto.txHash, 'failed_verification');
              return;
            }

            this.logger.log(`Token receipt verified. Triggering VTPASS: ${dto.txHash}`);
            try {
              await this.vtpassService.purchaseProduct({
                serviceID: dto.serviceId || 'airtime',
                billersCode: dto.metadata.recipient,
                variation_code: dto.metadata.variation_code,
                amount: dto.metadata.originalAmountNgn || 100,
                phone: dto.metadata.recipient,
                walletAddress: dto.fromAddress,
                request_id: dto.txHash,
              });
              await this.transactionsService.updateStatus(dto.txHash, 'success_delivered');
            } catch (err) {
              this.logger.error(`VTPASS execution failed after payment: ${err.message}`, err.stack);
              await this.transactionsService.updateStatus(dto.txHash, 'failed_service_error');
            }
          }
        } else {
          await this.transactionsService.updateStatus(dto.txHash, 'failed');
        }
      })
      .catch((error) => {
        this.logger.error(`Transaction confirmation error: ${error.message}`, error.stack);
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

  // ────────────────────────────────────────────────────────────
  // Airtime Purchase (dedicated endpoint)
  // ────────────────────────────────────────────────────────────

  /**
   * Complete VTPASS airtime purchase flow
   * Called after user pays treasury on blockchain
   *
   * Flow:
   * 1. Verify blockchain transaction
   * 2. Validate airtime parameters
   * 3. Trigger VTPASS API to purchase airtime
   * 4. Track transaction in local database
   */
  async purchaseAirtime(dto: {
    txHash: string;
    phoneNumber: string;
    amount: number;
    provider: string;
    walletAddress: string;
    memo?: string;
    skipVerification?: boolean;
  }) {
    this.logger.log(`Processing airtime purchase: ${JSON.stringify({
      txHash: dto.txHash,
      phoneNumber: dto.phoneNumber,
      amount: dto.amount,
      provider: dto.provider,
    })}`);

    // 1. Validate parameters
    const { phone, serviceID, amount } = this.vtpassService.validateAirtimeFlow({
      recipient: dto.phoneNumber,
      amount: dto.amount,
      biller: dto.provider,
    });

    const isDev = process.env.NODE_ENV !== 'production';
    const skipVerification = isDev && (dto as any).skipVerification === true;

    if (!skipVerification) {
      const treasuryAddress = process.env.RONPAY_TREASURY_ADDRESS;
      if (!treasuryAddress) {
        throw new InternalServerErrorException('Treasury address not configured');
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
        this.logger.log(`Dynamic verification amount: ${expectedUsdm} USDm for ${dto.amount} NGN`);
      } catch (error) {
        this.logger.warn(`Failed to get Mento quote for verification, using fallback: ${error.message}`);
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

    // 2. Call VTPASS to purchase airtime
    try {
      const response = await this.vtpassService.purchaseProduct({
        serviceID,
        billersCode: phone,
        amount,
        phone,
        walletAddress: dto.walletAddress,
      });

      const transactionStatus =
        response.content?.transactions?.status || 'pending';

      return {
        success: transactionStatus === 'delivered',
        message: response.response_description || 'Airtime purchase processing',
        vtpassTransactionId:
          response.content?.transactions?.transactionId || response.requestId,
        localTxHash: response.localTxHash,
        blockchainTxHash: dto.txHash,
        phoneNumber: phone,
        provider: dto.provider,
        amount,
        currency: 'NGN',
        status: transactionStatus,
        transactionDate: new Date(response.transaction_date || Date.now()),
        estimatedDeliveryTime:
          transactionStatus === 'delivered'
            ? 'Airtime delivered successfully'
            : 'Airtime will be delivered in 2-3 minutes',
        fullResponse: response,
      };
    } catch (error) {
      this.logger.error(`Airtime purchase failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to process airtime purchase: ${error.message}`,
      );
    }
  }
}
