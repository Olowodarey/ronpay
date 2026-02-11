export interface PaymentIntent {
  action: 'send_payment' | 'check_balance' | 'pay_bill' | 'buy_airtime' | 'buy_data' | 'unknown';
  recipient?: string;
  amount?: number;
  currency?: string;
  provider?: string;
  memo?: string;
  confidence?: number;
}