# Airtime Purchase Flow

This document outlines the end-to-end process of purchasing airtime using RonPay.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant MiniPay as MiniPay (Client)
    participant Backend as RonPay Backend
    participant Blockchain as Celo Blockchain
    participant Mento as Mento Protocol
    participant VTPass as VTPass API

    User->>Backend: "Buy 100 NGN airtime for MTN 08123456789"
    Backend->>Mento: getSwapQuote(NGNm, USDm, 100)
    Mento-->>Backend: 0.07 USDm (Quote)
    Backend-->>User: Unsigned Tx (Pay 0.07 USDm to Treasury) + Metadata

    User->>MiniPay: Sign and Send Transaction
    MiniPay->>Blockchain: transfer(Treasury, 0.07 USDm)
    Blockchain-->>MiniPay: txHash

    MiniPay->>Backend: recordTransaction(txHash, metadata)
    
    rect rgb(200, 230, 255)
        Note over Backend, Blockchain: Background Process
        Backend->>Blockchain: waitForTransaction(txHash)
        Blockchain-->>Backend: receipt (Success)
        Backend->>Blockchain: verifyERC20Transfer(txHash, Treasury, 0.07, USDm)
        Blockchain-->>Backend: isVerified (True)
    end

    Backend->>VTPass: purchaseProduct(mtn, 08123456789, 100)
    VTPass-->>Backend: code: 000 (Success)
    Backend->>User: Airtime Delivered Successfully
```

## Function-by-Function Breakdown

### 1. Intent Parsing
- **`PaymentsService.parsePaymentIntent`**: Entry point for natural language.
- **`PaymentsService.handleVtpassIntent`**:
    - Converts NGN amount to USDm using `MentoService`.
    - Builds the treasury payment transaction using `CeloService`.
    - Returns metadata (provider, recipient, NGN amount) to the client.

### 2. Transaction Recording & Monitoring
- **`PaymentsService.recordTransaction`**:
    - Stores the transaction in the database (status: `pending`).
    - Starts background monitoring of the `txHash`.

### 3. Verification & Fulfillment
- **`CeloService.verifyERC20Transfer`**:
    - Scans transaction logs to confirm tokens were received at the treasury.
- **`VtpassService.purchaseProduct`**:
    - Sends the final order to VTPass API.
    - **Mapped Service IDs**: MTN (`mtn`), Airtel (`airtel`), Glo (`glo`), 9mobile (`etisalat`).
    - **Payload**: Ensures `variation_code` is omitted for airtime to avoid errors.
