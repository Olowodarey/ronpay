"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  Wallet,
  DollarSign,
  CheckCircle2,
  XCircle,
  Send,
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
  const [currency, setCurrency] = useState("USDm");
  const [memo, setMemo] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{
    type: "idle" | "parsing" | "signing" | "confirming" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  // Fetch supported tokens on mount
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const { tokens } = await api.getSupportedTokens();
        setSupportedTokens(tokens);
        // Set first token as default if current currency not in list
        if (!tokens.includes(currency)) {
          setCurrency(tokens[0] || "USDm");
        }
      } catch (error) {
        console.error("Failed to fetch tokens:", error);
        // Keep fallback tokens
      }
    };
    fetchTokens();
  }, []);

  const validateAddress = (addr: string): boolean => {
    // Ethereum address validation
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
      // Step 1: Parse intent directly (bypass AI)
      setStatus({ type: "parsing", message: "Preparing transaction..." });

      const parseResponse = await api.parseIntentDirect(
        {
          action: "send_payment",
          recipient: recipientAddress,
          amount: amountNum,
          currency: currency,
          memo: memo || undefined,
          confidence: 1.0,
        },
        address,
      );

      // Step 2: Sign and send transaction via MiniPay
      setStatus({
        type: "signing",
        message: "Please sign the transaction in MiniPay...",
      });

      sendTransaction(
        {
          to: parseResponse.transaction.to as `0x${string}`,
          value: BigInt(parseResponse.transaction.value),
          data: parseResponse.transaction.data,
        },
        {
          onSuccess: async (hash) => {
            try {
              // Step 3: Record transaction
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

              setStatus({
                type: "success",
                message: `✅ Successfully sent ${amountNum} ${currency} to ${recipientAddress.slice(
                  0,
                  6,
                )}...${recipientAddress.slice(-4)}`,
              });

              onSuccess?.(hash);
              setIsProcessing(false);

              // Reset form after 3 seconds
              setTimeout(() => {
                setRecipientAddress("");
                setAmount("");
                setMemo("");
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
        Send Tokens (Direct)
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
        {/* Recipient Address Input */}
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

        {/* Amount Input */}
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

        {/* Currency Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Currency
          </label>
          <div className="grid grid-cols-2 gap-2">
            {supportedTokens.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                disabled={isProcessing}
                className={`py-3 px-4 rounded-xl font-medium transition-all ${
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

        {/* Memo Input (Optional) */}
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
              Send {amount || "0"} {currency}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
