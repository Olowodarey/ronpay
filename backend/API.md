# RonPay Backend API Documentation

Base URL: `http://localhost:3001`

## Payments API

### Health Check
`GET /payments/health`
Checks if the payment service is running and MiniPay compatible.

### Parse Payment Intent (AI)
`POST /payments/parse-intent`
Parses natural language input into a structured payment intent.
```json
{
  "message": "Send 5 cUSD to 0x123... or +23480...",
  "senderAddress": "0xSenderAddress"
}
```

### Execute Payment
`POST /payments/execute`
Records a transaction after it has been signed and broadcasted by the frontend/MiniPay.
```json
{
  "txHash": "0x...",
  "fromAddress": "0x...",
  "toAddress": "0x...",
  "amount": 10,
  "currency": "cUSD",
  "intent": "optional intent string",
  "metadata": {
      "provider": "VTPASS",
      "recipient": "080...",
      "variation_code": "data-plan-id"
  }
}
```

### Get Balance
`GET /payments/balance/:address`
Returns Celo ecosystem token balances (cUSD, cEUR, cKES, etc.).

### Transaction History
`GET /payments/history/:address`
Returns transaction history for a wallet.

---

## VTPASS API (Bills & Airtime)

### Get Service Categories
`GET /vtpass/services?identifier=airtime`
Returns available services (e.g. MTN Airtime, DSTV).

### Get Variations (Data Plans)
`GET /vtpass/variations?serviceID=mtn-data`
Returns available data plans or variations for a service.

### Verify Merchant/Biller
`POST /vtpass/verify`
Verifies a smartcard number or meter number before payment.
```json
{
  "serviceID": "dstv",
  "billersCode": "1234567890"
}
```

### Purchase Product (Direct)
`POST /vtpass/purchase`
Directly purchases a product (usually called by backend automation, but exposed for testing).

---

## Scheduler API

### Schedule Recurring Payment
`POST /scheduler/payment`
Schedules a recurring crypto transfer.
```json
{
  "cron": "0 0 * * *",
  "recipient": "0x...",
  "amount": 10,
  "token": "cUSD"
}
```

### Schedule Recurring Bill
`POST /scheduler/bill`
Schedules a recurring bill payment.
```json
{
  "cron": "0 0 1 * *",
  "serviceID": "gotv",
  "billersCode": "1234567890",
  "amount": 3000
}
```
