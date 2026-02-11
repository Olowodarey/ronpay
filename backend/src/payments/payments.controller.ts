import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NaturalLanguagePaymentDto } from './dto/natural-language-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private transactionsService: TransactionsService,
  ) {}

  /**
   * Process natural language payment request
   * POST /payments/natural-language
   */
  @Post('natural-language')
  @HttpCode(HttpStatus.OK)
  async processNaturalLanguagePayment(@Body() dto: NaturalLanguagePaymentDto) {
    return this.paymentsService.processNaturalLanguagePayment(dto);
  }

  /**
   * Get wallet balance
   * GET /payments/balance/:address
   */
  @Get('balance/:address')
  async getBalance(@Param('address') address: string) {
    return this.paymentsService.getBalance(address);
  }

  /**
   * Get transaction history for an address
   * GET /payments/history/:address
   */
  @Get('history/:address')
  async getTransactionHistory(@Param('address') address: string) {
    const transactions = await this.transactionsService.findByAddress(address);
    const stats = await this.transactionsService.getStats(address);

    return {
      address,
      stats,
      transactions,
    };
  }

  /**
   * Get specific transaction by hash
   * GET /payments/transaction/:txHash
   */
  @Get('transaction/:txHash')
  async getTransaction(@Param('txHash') txHash: string) {
    return this.transactionsService.findByTxHash(txHash);
  }

  /**
   * Health check endpoint
   * GET /payments/health
   */
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'RonPay Payments API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
