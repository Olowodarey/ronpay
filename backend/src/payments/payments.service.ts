import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { CeloService } from '../blockchain/celo.service';
import { ClaudeService } from '../ai/claude.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NaturalLanguagePaymentDto } from './dto/natural-language-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private celoService: CeloService,
    private claudeService: ClaudeService,
    private transactionsService: TransactionsService,
  ) {}

  async processNaturalLanguagePayment(dto: NaturalLanguagePaymentDto) {
    // 1. Parse intent with Claude AI
    const intent = await this.claudeService.parsePaymentIntent(dto.message);

    console.log('Parsed intent:', intent);

    // 2. Validate intent
    if (intent.action !== 'send_payment') {
      throw new BadRequestException(
        `Action "${intent.action}" not supported. Only send_payment is available in MVP.`,
      );
    }

    if (!intent.recipient) {
      throw new BadRequestException('Could not determine payment recipient from message');
    }

    if (!intent.amount || intent.amount <= 0) {
      throw new BadRequestException('Could not determine valid payment amount from message');
    }

    if (intent.confidence && intent.confidence < 0.5) {
      throw new BadRequestException(
        'Unable to understand payment request with sufficient confidence. Please be more specific.',
      );
    }

    // 3. Validate recipient address
    if (!this.celoService.isValidAddress(intent.recipient)) {
      throw new BadRequestException(`Invalid recipient address: ${intent.recipient}`);
    }

    try {
      // 4. Send payment via Celo
      const currency = intent.currency || 'cUSD';
      const txHash = await this.celoService.sendPayment(
        intent.recipient as `0x${string}`,
        intent.amount.toString(),
        currency as any,
      );

      // 5. Save transaction to database
      const transaction = await this.transactionsService.create({
        fromAddress: dto.senderAddress.toLowerCase(),
        toAddress: intent.recipient.toLowerCase(),
        amount: intent.amount,
        currency,
        txHash,
        status: 'pending',
        intent: dto.message,
        memo: intent.memo || '',
      });

      // 6. Generate confirmation message
      const confirmation = await this.claudeService.generatePaymentConfirmation(
        intent.amount,
        currency,
        intent.recipient,
        txHash,
      );

      // 7. Wait for transaction and update status (non-blocking in real app)
      this.celoService.waitForTransaction(txHash as `0x${string}`)
        .then((receipt) => {
          const status = receipt.status === 'success' ? 'success' : 'failed';
          this.transactionsService.updateStatus(txHash, status);
        })
        .catch((error) => {
          console.error('Transaction confirmation error:', error);
          this.transactionsService.updateStatus(txHash, 'failed');
        });

      return {
        transaction,
        txHash,
        confirmation,
        intent,
      };
    } catch (error) {
      console.error('Payment error:', error);
      throw new InternalServerErrorException(
        `Payment failed: ${error.message || 'Unknown error'}`,
      );
    }
  }

  async getBalance(address: string) {
    if (!this.celoService.isValidAddress(address)) {
      throw new BadRequestException(`Invalid address: ${address}`);
    }

    const [cUSD, CELO, cKES] = await Promise.all([
      this.celoService.getBalance(address as `0x${string}`, 'cUSD'),
      this.celoService.getBalance(address as `0x${string}`, 'CELO'),
      this.celoService.getBalance(address as `0x${string}`, 'cKES'),
    ]);

    return {
      address,
      balances: {
        cUSD: parseFloat(cUSD),
        CELO: parseFloat(CELO),
        cKES: parseFloat(cKES),
      },
    };
  }
}
