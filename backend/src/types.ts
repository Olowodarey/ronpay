export interface PaymentIntent {
  action: 'send_payment' | 'check_balance' | 'pay_bill' | 'buy_airtime' | 'buy_data' | 'unknown';
  recipient?: string;
  amount?: number;
  currency?: string;        // Destination currency (what recipient gets)
  sourceCurrency?: string;  // Source currency (what sender pays) — for cross-currency
  provider?: string;
  memo?: string;
  confidence?: number;
  biller?: string;
  package?: string;
}