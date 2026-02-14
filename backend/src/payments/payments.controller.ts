import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { TransactionsService } from '../transactions/transactions.service';
import { VtpassService } from '../vtpass/vtpass.service';
import {
  NaturalLanguagePaymentDto,
  ExecutePaymentDto,
} from './dto/natural-language-payment.dto';
import { PaymentIntent } from '../types';
import { PurchaseAirtimeDto } from '../vtpass/dto/vtpass-airtime.dto';

@Controller('payments')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private transactionsService: TransactionsService,
    private vtpassService: VtpassService,
  ) {}

  /**
   * Parse natural language payment request and return unsigned transaction
   * POST /payments/parse-intent
   *
   * MiniPay Flow:
   * 1. Frontend sends natural language message
   * 2. Backend parses intent with Claude AI
   * 3. Returns transaction data for MiniPay to sign
   */
  @Post('parse-intent')
  @HttpCode(HttpStatus.OK)
  async parsePaymentIntent(@Body() dto: NaturalLanguagePaymentDto) {
    return this.paymentsService.parsePaymentIntent(dto);
  }

  /**
   * Parse payment intent directly (bypasses AI - for development/testing)
   * POST /payments/parse-intent-direct
   *
   * Development Flow:
   * 1. Frontend sends complete payment intent object
   * 2. Backend skips AI parsing
   * 3. Returns transaction data for MiniPay to sign
   *
   * Useful for saving Claude tokens during development
   */
  @Post('parse-intent-direct')
  @HttpCode(HttpStatus.OK)
  async parsePaymentIntentDirect(
    @Body() body: { intent: PaymentIntent; senderAddress: string },
  ) {
    return this.paymentsService.parsePaymentIntentDirect(
      body.intent,
      body.senderAddress,
    );
  }

  /**
   * Record a transaction that was signed and broadcasted by MiniPay
   * POST /payments/execute
   *
   * MiniPay Flow:
   * 1. MiniPay signs transaction client-side
   * 2. User broadcasts transaction
   * 3. Frontend sends txHash to backend
   * 4. Backend records transaction and monitors confirmation
   */
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async executePayment(@Body() dto: ExecutePaymentDto) {
    return this.paymentsService.recordTransaction(dto);
  }

  /**
   * Purchase airtime after paying to treasury
   * POST /payments/purchase-airtime
   *
   * Complete Airtime Flow:
   * 1. User calls parse-intent-direct with buy_airtime action
   * 2. Gets unsigned transaction to pay treasury in stablecoin
   * 3. MiniPay signs and broadcasts transaction to Celo
   * 4. Frontend gets txHash and calls this endpoint
   * 5. Backend triggers VTPASS airtime purchase
   * 6. Airtime delivered to phone number
   */
  @Post('purchase-airtime')
  @HttpCode(HttpStatus.OK)
  async purchaseAirtime(@Body() dto: PurchaseAirtimeDto) {
    return this.paymentsService.purchaseAirtime(dto);
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
   * Get supported tokens and their addresses
   * GET /payments/tokens
   */
  @Get('tokens')
  getSupportedTokens() {
    return this.paymentsService.getSupportedTokens();
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
      minipayCompatible: true,
      timestamp: new Date().toISOString(),
    };
  }
}
