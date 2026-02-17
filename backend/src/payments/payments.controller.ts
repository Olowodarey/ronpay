import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { PaymentsService } from './payments.service';
import { TransactionsService } from '../transactions/transactions.service';
import { ReceiptsService } from '../transactions/receipts.service';
import {
  NaturalLanguagePaymentDto,
  ExecutePaymentDto,
} from './dto/natural-language-payment.dto';
import { PaymentIntent } from '../types';

export class PurchaseAirtimeDto {
  @IsString()
  txHash: string;

  @IsString()
  phoneNumber: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsBoolean()
  skipVerification?: boolean;
}

export class QueryAirtimeTransactionDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsString()
  mobileNumber?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private transactionsService: TransactionsService,
    private receiptsService: ReceiptsService,
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
   * Get a Mento swap quote for cross-currency transfers
   * GET /payments/swap-quote?from=USDm&to=NGNm&amount=1000
   *
   * Returns how much source token is needed to send X of destination token
   */
  @Get('swap-quote')
  async getSwapQuote(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: string,
    @Query('mode') mode: 'fixedInput' | 'fixedOutput' = 'fixedInput',
  ) {
    return this.paymentsService.getSwapQuote(from, to, amount, mode);
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
   * 5. Backend triggers Nellobytes airtime purchase
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
   * Get formatted transaction receipt
   * GET /payments/receipt/:txHash?lang=en
   *
   * Returns multi-language formatted receipt with:
   * - Transaction details
   * - Savings vs traditional remittance
   * - Celo explorer link
   */
  @Get('receipt/:txHash')
  async getReceipt(
    @Param('txHash') txHash: string,
    @Query('lang') lang?: 'en' | 'es' | 'pt' | 'fr',
  ) {
    return this.receiptsService.generateReceipt(txHash, lang);
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
   * Nellobytes Webhook Callback Handler
   * POST /payments/nellobytes-callback
   *
   * Receives real-time transaction status updates from Nellobytes API.
   * Called by Nellobytes after airtime purchase completion.
   *
   * Payload includes:
   * - orderid: Transaction order ID from Nellobytes
   * - requestid: Request ID we sent to Nellobytes (maps to txHash)
   * - statuscode: HTTP status code
   * - orderstatus: ORDER_COMPLETED, FAILED, PENDING, etc.
   * - amountcharged: Actual amount debited
   * - mobilenumber: Phone number that received airtime
   * - mobilenetwork: Network provider (AirTel, GLO, MTN, 9Mobile)
   */
  @Post('nellobytes-callback')
  @HttpCode(HttpStatus.OK)
  async handleNellobytesCallback(@Body() payload: Record<string, unknown>) {
    const requestId =
      (payload.requestid as string) || (payload.RequestID as string);

    // The requestId should match our txHash
    if (!requestId) {
      return {
        received: true,
        warning: 'No request ID in callback payload',
      };
    }

    try {
      // Find transaction by txHash (which we sent as RequestID to Nellobytes)
      const transaction =
        await this.transactionsService.findByTxHash(requestId);

      if (!transaction) {
        return {
          received: true,
          warning: `Transaction not found for requestId: ${requestId}`,
        };
      }

      // Map Nellobytes status codes to our status
      let status = 'pending';
      const statusCode = payload.statuscode as string;
      const orderStatus = payload.orderstatus as string;

      if (statusCode === '200' || orderStatus === 'ORDER_COMPLETED') {
        status = 'success';
      } else if (statusCode === '100' || orderStatus === 'ORDER_RECEIVED') {
        status = 'pending'; // Still processing
      } else if (
        orderStatus?.includes('FAILED') ||
        orderStatus?.includes('CANCELLED')
      ) {
        status = 'failed';
      }

      // Update transaction with airtime delivery confirmation and store callback data
      await this.transactionsService.updateAirtimeCallback(
        requestId,
        status,
        payload,
      );

      return {
        received: true,
        status,
        orderId: payload.orderid,
        message: 'Airtime transaction status recorded',
      };
    } catch (error) {
      // Log but don't fail - Nellobytes expects 200 OK response
      console.error('Error processing Nellobytes callback:', error);
      return {
        received: true,
        warning: 'Error processing callback, but status recorded',
      };
    }
  }

  /**
   * Query Nellobytes airtime transaction status
   * GET /payments/airtime-query?orderId=6706050171&mobileNumber=09046144400
   *
   * Query an airtime purchase transaction from Nellobytes.
   * Can query by OrderID (received from purchase) or RequestID (custom tracking ID).
   * Including MobileNumber improves query success rate with Nellobytes API.
   *
   * Returns transaction status including:
   * - status: ORDER_COMPLETED, ORDER_RECEIVED, FAILED, etc.
   * - mobilenetwork: The provider (AirTel, GLO, MTN, etc.)
   * - amountcharged: Amount debited from wallet
   * - remark: Human-readable status message
   */
  @Get('airtime-query')
  async queryAirtimeTransaction(@Query() query: QueryAirtimeTransactionDto) {
    if (!query.orderId && !query.requestId) {
      throw new Error('Either orderId or requestId is required');
    }

    const nellobytesService = this.paymentsService['nellobytesService'];
    if (!nellobytesService) {
      throw new Error('Nellobytes service not available');
    }

    return nellobytesService.queryTransaction({
      orderId: query.orderId,
      requestId: query.requestId,
      mobileNumber: query.mobileNumber,
    });
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
