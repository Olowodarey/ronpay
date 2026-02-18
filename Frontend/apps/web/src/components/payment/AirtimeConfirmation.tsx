"use client";

import { useState } from "react";
import { Phone, Loader2, CheckCircle2, Wifi } from "lucide-react";
import { useSendTransaction } from "wagmi";
import type { ParseIntentResponse } from "@/types/payment";
import { api } from "@/lib/api";

interface AirtimeConfirmationProps {
  intentResponse: ParseIntentResponse;
  senderAddress: string;
  onSuccess: (txHash: string) => void;
  onCancel: () => void;
}

export function AirtimeConfirmation({
  intentResponse,
  senderAddress,
  onSuccess,
  onCancel,
}: AirtimeConfirmationProps) {
  const [status, setStatus] = useState<{
    type: "idle" | "signing" | "recording" | "purchasing" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  const { sendTransaction } = useSendTransaction();

  const { intent, transaction, parsedCommand, meta } = intentResponse;

  const phoneNumber = meta?.recipient || intent.recipient || "";
  const amountNgn = meta?.originalAmountNgn || intent.amount || 0;
  const detectedNetwork = meta?.detectedNetwork || intent.biller || "Auto";
  const amountUsdm = parsedCommand.amount;

  const handleConfirm = async () => {
    setStatus({
      type: "signing",
      message: "Please sign the transaction in MiniPay...",
    });

    try {
      sendTransaction(
        {
          to: transaction.to as `0x${string}`,
          value: BigInt(transaction.value),
          data: transaction.data,
        },
        {
          onSuccess: async (hash) => {
            // Record tx with metadata so backend auto-triggers Nellobytes
            setStatus({
              type: "recording",
              message: "Recording transaction...",
            });

            try {
              await api.executePayment({
                fromAddress: senderAddress,
                toAddress: transaction.to,
                amount: amountUsdm,
                currency: "USDm",
                txHash: hash,
                intent: "buy_airtime",
                memo: `Airtime ${amountNgn} NGN to ${phoneNumber}`,
                type: "bill_payment",
                metadata: meta,
              });

              setStatus({
                type: "purchasing",
                message: "Processing airtime purchase...",
              });

              // Also call purchase-airtime explicitly as a safety net
              try {
                await api.purchaseAirtime({
                  txHash: hash,
                  phoneNumber,
                  amount: amountNgn,
                  provider:
                    detectedNetwork === "AUTO_DETECT"
                      ? undefined
                      : detectedNetwork,
                  walletAddress: senderAddress,
                  memo: `Airtime ${amountNgn} NGN`,
                });
              } catch {
                // Backend may reject duplicate — that's OK since auto-trigger path handles it
                console.log(
                  "Explicit purchase-airtime call skipped (auto-trigger active)",
                );
              }

              setStatus({
                type: "success",
                message: `✅ Airtime purchase initiated! ₦${amountNgn.toLocaleString()} ${detectedNetwork} airtime to ${phoneNumber}`,
              });

              onSuccess(hash);
            } catch (error) {
              console.error("Failed to record transaction:", error);
              // Still call success since blockchain tx went through
              onSuccess(hash);
            }
          },
          onError: (error) => {
            console.error("Transaction failed:", error);
            setStatus({
              type: "error",
              message: error.message || "Transaction signing failed",
            });
          },
        },
      );
    } catch (error) {
      console.error("Payment confirmation error:", error);
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Transaction failed",
      });
    }
  };

  const isProcessing = ["signing", "recording", "purchasing"].includes(
    status.type,
  );

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Phone className="h-5 w-5 text-green-500" />
        <span className="text-sm font-medium text-green-700">
          CONFIRM AIRTIME PURCHASE
        </span>
      </div>

      {/* Airtime Details */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Phone:</span>
          <span className="font-mono font-medium text-gray-900">
            {phoneNumber}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Airtime:</span>
          <span className="font-semibold text-green-600">
            ₦{amountNgn.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Network:</span>
          <span className="flex items-center gap-1 font-medium text-gray-900">
            <Wifi className="h-3.5 w-3.5" />
            {detectedNetwork}
          </span>
        </div>
        <div className="border-t border-gray-100 pt-2 flex justify-between text-sm">
          <span className="text-gray-600">You pay:</span>
          <span className="font-semibold text-blue-600">{amountUsdm} USDm</span>
        </div>
        {intentResponse.routing && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Exchange rate:</span>
            <span>
              1 USDm ≈ ₦
              {Math.round(intentResponse.routing.exchangeRate).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Status Display */}
      {status.type !== "idle" && (
        <div
          className={`mb-4 p-3 rounded-xl flex items-start gap-2 text-sm ${
            status.type === "success"
              ? "bg-green-50 text-green-800"
              : status.type === "error"
              ? "bg-red-50 text-red-800"
              : "bg-blue-50 text-blue-800"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : status.type === "error" ? null : (
            <Loader2 className="h-4 w-4 flex-shrink-0 mt-0.5 animate-spin" />
          )}
          <span>{status.message}</span>
        </div>
      )}

      {/* Confirm Button */}
      {status.type !== "success" && (
        <>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-gray-900 font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              `Buy ₦${amountNgn.toLocaleString()} Airtime`
            )}
          </button>

          {/* Cancel Button */}
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="w-full mt-2 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-400 transition-colors"
          >
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
