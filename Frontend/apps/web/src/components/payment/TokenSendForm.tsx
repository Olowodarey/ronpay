"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Wallet,
  DollarSign,
  CheckCircle2,
  XCircle,
  Send,
  ArrowRightLeft,
} from "lucide-react";
import { useSendTransaction } from "wagmi";
import { api } from "@/lib/api";
import { useMiniPayWallet } from "@/hooks/useMiniPayWallet";

interface TokenSendFormProps {
  onSuccess?: (txHash: string) => void;
  onError?: (error: string) => void;
}

export function TokenSendForm({ onSuccess, onError }: TokenSendFormProps) {
  const { address, isConnected } = useMiniPayWallet();
  const { sendTransaction } = useSendTransaction();

  // Dynamic token list from backend
  const [supportedTokens, setSupportedTokens] = useState<string[]>([
    "USDm",
    "EURm",
    "NGNm",
    "KESm",
  ]);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USDm"); // Destination: what recipient gets
  const [sourceCurrency, setSourceCurrency] = useState("USDm"); // Source: what you pay with
  const [memo, setMemo] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{
    type: "idle" | "parsing" | "signing" | "confirming" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  // Swap quote state
  const [swapQuote, setSwapQuote] = useState<{
    debitAmount: string;
    rate: number;
    summary: string;
  } | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  const isCrossCurrency = sourceCurrency !== currency;

  // Fetch supported tokens on mount
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const { tokens } = await api.getSupportedTokens();
        setSupportedTokens(tokens);
        if (!tokens.includes(currency)) {
          setCurrency(tokens[0] || "USDm");
        }
        if (!tokens.includes(sourceCurrency)) {
          setSourceCurrency(tokens[0] || "USDm");
        }
      } catch (error) {
        console.error("Failed to fetch tokens:", error);
      }
    };
    fetchTokens();
  }, []);

  // Fetch swap quote when cross-currency params change
  const fetchQuote = useCallback(async () => {
    if (!isCrossCurrency || !amount || parseFloat(amount) <= 0) {
      setSwapQuote(null);
      return;
    }

    setIsLoadingQuote(true);
    try {
      // Use fixedOutput mode: we want the recipient to get exactly `amount` (e.g. 1000 NGNm)
      // and we want to know how much `sourceCurrency` (e.g. USDm) we need to pay.
      const quote = await api.getSwapQuote(sourceCurrency, currency, amount, "fixedOutput");
      setSwapQuote({
        debitAmount: quote.debitAmount,
        rate: quote.rate,
        summary: quote.summary,
      });
    } catch (error) {
      console.error("Quote failed:", error);
      setSwapQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [sourceCurrency, currency, amount, isCrossCurrency]);

  useEffect(() => {
    const timer = setTimeout(fetchQuote, 500); // Debounce
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  const validateAddress = (addr: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      setStatus({
        type: "error",
        message: "Please connect your MiniPay wallet first",
      });
      onError?.("Wallet not connected");
      return;
    }

    if (!validateAddress(recipientAddress)) {
      setStatus({
        type: "error",
        message:
          "Invalid recipient address. Must be a valid Ethereum address (0x...)",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setStatus({
        type: "error",
        message: "Amount must be greater than 0",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Parse intent with cross-currency support
      setStatus({ type: "parsing", message: "Preparing transaction..." });

      const parseResponse = await api.parseIntentDirect(
        {
          action: "send_payment",
          recipient: recipientAddress,
          amount: amountNum,
          currency: currency,
          sourceCurrency: isCrossCurrency ? sourceCurrency : undefined,
          memo: memo || undefined,
          confidence: 1.0,
        },
        address,
      );

      const isApproveRequired = parseResponse.actionRequired === "APPROVE_REQUIRED";
      const isSwapThenSend = parseResponse.actionRequired === "SWAP_THEN_SEND";

      // Step 2: Determine message and start first transaction
      let statusMessage = "Please sign the transaction in MiniPay...";
      if (isApproveRequired) {
        statusMessage = `Please approve the Mento Broker to spend your ${sourceCurrency}...`;
      } else if (isSwapThenSend) {
        statusMessage = `Step 1/2: Validating Swap (${sourceCurrency} → ${currency})...`;
      } else if (isCrossCurrency) {
        statusMessage = `Please sign your ${sourceCurrency} → ${amountNum} ${currency} swap...`;
      }

      setStatus({
        type: "signing",
        message: statusMessage,
      });

      // Helper to handle final success
      const handleFinalSuccess = async (hash: string) => {
        try {
          setStatus({
            type: "confirming",
            message: "Recording transaction...",
          });

          await api.executePayment({
            txHash: hash,
            fromAddress: address,
            toAddress: recipientAddress,
            amount: amountNum,
            currency: currency,
          });

          const successMsg = isCrossCurrency
            ? `✅ Sent ${amountNum} ${currency} (debited ${swapQuote?.debitAmount || "?"} ${sourceCurrency})`
            : `✅ Sent ${amountNum} ${currency}`;

          setStatus({
            type: "success",
            message: `${successMsg} to ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`,
          });

          onSuccess?.(hash);
          setIsProcessing(false);

          setTimeout(() => {
            setRecipientAddress("");
            setAmount("");
            setMemo("");
            setSwapQuote(null);
            setStatus({ type: "idle", message: "" });
          }, 3000);
        } catch (error) {
          const errorMsg =
            error instanceof Error
              ? error.message
              : "Failed to record transaction";
          setStatus({ type: "error", message: errorMsg });
          onError?.(errorMsg);
          setIsProcessing(false);
        }
      };

      // Execute first transaction
      sendTransaction(
        {
          to: parseResponse.transaction.to as `0x${string}`,
          value: BigInt(parseResponse.transaction.value),
          data: parseResponse.transaction.data,
        },
        {
          onSuccess: async (hash) => {
            if (isApproveRequired) {
              setStatus({
                type: "success",
                message: `✅ Approval successful! Now click "Send" again to complete your ${amountNum} ${currency} transfer.`,
              });
              setIsProcessing(false);
              return;
            }

            if (isSwapThenSend && parseResponse.nextTransaction) {
              // Now trigger the second transaction
              setStatus({
                type: "signing",
                message: `Step 2/2: Swap complete! Now sign the transfer to ${recipientAddress.slice(0, 6)}...`,
              });

              // Small delay for UI update
              setTimeout(() => {
                sendTransaction(
                  {
                    to: parseResponse.nextTransaction!.to as `0x${string}`,
                    value: BigInt(parseResponse.nextTransaction!.value),
                    data: parseResponse.nextTransaction!.data,
                  },
                  {
                    onSuccess: handleFinalSuccess,
                    onError: (error) => {
                      const errorMsg = error.message || "Second transaction failed";
                      setStatus({ type: "error", message: `Step 2 Failed: ${errorMsg}` });
                      onError?.(`Step 2 Failed: ${errorMsg}`);
                      setIsProcessing(false);
                    }
                  }
                );
              }, 1000);
              return;
            }

            // Standard single transaction success
            await handleFinalSuccess(hash);
          },
          onError: (error) => {
            const errorMsg = error.message || "Transaction failed";
            setStatus({ type: "error", message: errorMsg });
            onError?.(errorMsg);
            setIsProcessing(false);
          },
        },
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Failed to prepare transaction";
      setStatus({ type: "error", message: errorMsg });
      onError?.(errorMsg);
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Send Tokens
      </h2>

      {/* Wallet Status */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-xs text-gray-600 mb-1">Connected Wallet</div>
        <div className="font-mono text-sm text-gray-900">
          {isConnected && address
            ? `${address.slice(0, 6)}...${address.slice(-4)}`
            : "Not connected"}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Recipient Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Wallet className="inline h-4 w-4 mr-1" />
            Recipient Address
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none font-mono text-sm"
            disabled={isProcessing}
            required
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <DollarSign className="inline h-4 w-4 mr-1" />
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
            disabled={isProcessing}
            required
          />
        </div>

        {/* Pay With (Source Currency) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            💳 Pay With
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {supportedTokens.map((c) => (
              <button
                key={`src-${c}`}
                type="button"
                onClick={() => setSourceCurrency(c)}
                disabled={isProcessing}
                className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${sourceCurrency === c
                  ? "bg-blue-500 text-white shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Swap Arrow (only if cross-currency) */}
        {isCrossCurrency && (
          <div className="flex justify-center">
            <ArrowRightLeft className="h-5 w-5 text-blue-500 animate-pulse" />
          </div>
        )}

        {/* Send As (Destination Currency) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            📤 Recipient Gets
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {supportedTokens.map((c) => (
              <button
                key={`dst-${c}`}
                type="button"
                onClick={() => setCurrency(c)}
                disabled={isProcessing}
                className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                  currency === c
                    ? "bg-yellow-400 text-gray-900 shadow-md"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Swap Quote Display */}
        {isCrossCurrency && (
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
            {isLoadingQuote ? (
              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Getting exchange rate...
              </div>
            ) : swapQuote ? (
              <div className="text-sm">
                <div className="font-medium text-blue-900">
                  {swapQuote.summary}
                </div>
                <div className="text-blue-600 text-xs mt-1">
                  Rate: 1 {currency} ≈ {swapQuote.rate.toFixed(4)} {sourceCurrency}
                </div>
              </div>
            ) : amount ? (
              <div className="text-sm text-blue-600">
                Enter amount to see exchange rate
              </div>
            ) : null}
          </div>
        )}

        {/* Memo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Memo (Optional)
          </label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Payment for..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
            disabled={isProcessing}
          />
        </div>

        {/* Status Display */}
        {status.type !== "idle" && (
          <div
            className={`p-4 rounded-xl flex items-start gap-3 ${
              status.type === "success"
                ? "bg-green-50 text-green-800"
                : status.type === "error"
                ? "bg-red-50 text-red-800"
                : "bg-blue-50 text-blue-800"
            }`}
          >
            {status.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
            ) : status.type === "error" ? (
              <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            ) : (
              <Loader2 className="h-5 w-5 flex-shrink-0 mt-0.5 animate-spin" />
            )}
            <div className="text-sm">{status.message}</div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isProcessing || !isConnected}
          className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-gray-900 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Send className="h-5 w-5" />
                {isCrossCurrency
                  ? `Send ${amount || "0"} ${currency} (pay ${swapQuote?.debitAmount || "?"} ${sourceCurrency})`
                  : `Send ${amount || "0"} ${currency}`}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
