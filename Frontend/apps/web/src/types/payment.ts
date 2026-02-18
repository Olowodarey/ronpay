/**
 * Payment Intent Types
 * Matches backend API response structure
 */

export type PaymentAction =
  | "send_payment"
  | "check_balance"
  | "pay_bill"
  | "buy_airtime"
  | "buy_data"
  | "unknown";

export interface PaymentIntent {
  action: PaymentAction;
  recipient?: string;
  amount?: number;
  currency?: string;
  sourceCurrency?: string;
  memo?: string;
  confidence?: number;
  biller?: string;
  provider?: string;
  package?: string;
}

export interface TransactionData {
  to: string;
  value: string;
  data: `0x${string}`;
  feeCurrency: string;
}

export interface ParsedCommand {
  recipient: string;
  amount: number;
  currency: string;
  memo?: string;
}

export interface AirtimeMeta {
  serviceType: string;
  provider: string;
  biller: string;
  recipient: string;
  detectedNetwork: string;
  originalAmountNgn: number;
  exchangeRate: number;
  variation_code?: string;
}

export interface ParseIntentResponse {
  intent: PaymentIntent;
  transaction: TransactionData;
  parsedCommand: ParsedCommand;
  sessionId?: string;
  actionRequired?: string;
  exchangeRate?: {
    from: string;
    to: string;
    rate: number;
    debitAmount: string;
    receiveAmount: string;
    source: string;
  };
  nextTransaction?: TransactionData;
  routing?: {
    routeUsed: string;
    exchangeRate: number;
  };
  meta?: AirtimeMeta;
}

export interface ExecutePaymentRequest {
  fromAddress: string;
  toAddress: string;
  amount: number;
  currency: string;
  txHash: string;
  intent?: string;
  memo?: string;
  type?: string;
  serviceId?: string;
  metadata?: AirtimeMeta;
}

export interface TokenBalance {
  cUSD: number;
  CELO: number;
  cKES: number;
  cEUR: number;
  cREAL: number;
}

export interface BalanceResponse {
  address: string;
  balances: TokenBalance;
  timestamp: string;
}

export interface ApiError {
  message: string;
  statusCode?: number;
  error?: string;
}

export interface PurchaseAirtimeRequest {
  txHash: string;
  phoneNumber: string;
  amount: number;
  provider: string;
  walletAddress: string;
  memo?: string;
}

export interface AirtimePurchaseResponse {
  success: boolean;
  message: string;
  vtpassTransactionId?: string;
  localTxHash?: string;
  blockchainTxHash?: string;
  phoneNumber?: string;
  provider?: string;
  amount?: number;
  currency?: string;
  status?: "initiated" | "pending" | "delivered" | "failed";
  transactionDate?: string;
}
