"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useSendTransaction } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Loader2, Phone, CheckCircle2, XCircle, Wifi } from "lucide-react";
import { api } from "@/lib/api";

const NETWORKS = ["Auto-detect", "MTN", "Airtel", "Glo", "9mobile"] as const;
type Network = (typeof NETWORKS)[number];

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

type Status =
  | { type: "idle" }
  | { type: "parsing" }
  | { type: "signing" }
  | { type: "purchasing" }
  | {
      type: "success";
      txHash: string;
      amountNgn: number;
      phone: string;
      network: string;
    }
  | { type: "error"; message: string };

export function AirtimeBuySection() {
  const { address, isConnected } = useAccount();
  const { sendTransaction } = useSendTransaction();

  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState<Network>("Auto-detect");
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const isProcessing =
    status.type === "parsing" ||
    status.type === "signing" ||
    status.type === "purchasing";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;

    const cleaned = phone.replace(/\D/g, "");
    const isValidPhone =
      (cleaned.length === 11 && cleaned.startsWith("0")) ||
      (cleaned.length === 13 && cleaned.startsWith("234"));

    if (!isValidPhone) {
      setStatus({
        type: "error",
        message: "Enter a valid Nigerian number (e.g. 08012345678)",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum < 50) {
      setStatus({ type: "error", message: "Minimum amount is ₦50" });
      return;
    }
    if (amountNum > 200000) {
      setStatus({ type: "error", message: "Maximum amount is ₦200,000" });
      return;
    }

    setStatus({ type: "parsing" });

    try {
      const parseResponse = await api.parseIntentDirect(
        {
          action: "buy_airtime",
          recipient: phone,
          amount: amountNum,
          currency: "NGN",
          biller: network === "Auto-detect" ? undefined : network,
          confidence: 1.0,
        },
        address,
      );

      setStatus({ type: "signing" });

      sendTransaction(
        {
          to: parseResponse.transaction.to as `0x${string}`,
          value: BigInt(parseResponse.transaction.value),
          data: parseResponse.transaction.data,
        },
        {
          onSuccess: async (hash) => {
            setStatus({ type: "purchasing" });

            const meta = parseResponse.meta;
            const detectedNetwork = meta?.detectedNetwork || network;
            const amountNgn = meta?.originalAmountNgn || amountNum;

            try {
              await api.executePayment({
                fromAddress: address,
                toAddress: parseResponse.transaction.to,
                amount: parseResponse.parsedCommand.amount,
                currency: "USDm",
                txHash: hash,
                intent: "buy_airtime",
                memo: `Airtime ${amountNgn} NGN to ${phone}`,
                type: "bill_payment",
                metadata: meta,
              });

              try {
                await api.purchaseAirtime({
                  txHash: hash,
                  phoneNumber: phone,
                  amount: amountNgn,
                  provider:
                    detectedNetwork === "AUTO_DETECT"
                      ? undefined
                      : detectedNetwork,
                  walletAddress: address,
                });
              } catch {
                // auto-trigger path handles it — safe to ignore duplicate
              }

              setStatus({
                type: "success",
                txHash: hash,
                amountNgn,
                phone,
                network: detectedNetwork,
              });

              // reset form
              setPhone("");
              setAmount("");
              setNetwork("Auto-detect");
            } catch (err) {
              // tx went through, airtime may still deliver via auto-trigger
              setStatus({
                type: "success",
                txHash: hash,
                amountNgn,
                phone,
                network: detectedNetwork,
              });
            }
          },
          onError: (err) => {
            setStatus({
              type: "error",
              message: err.message || "Transaction rejected",
            });
          },
        },
      );
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  };

  if (!isConnected) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
        <div className="text-4xl mb-4">📱</div>
        <h3 className="font-semibold text-lg mb-2">Connect your wallet</h3>
        <p className="text-gray-500 text-sm mb-6">
          You need a Celo-compatible wallet to pay with USDm stablecoins.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (status.type === "success") {
    return (
      <div className="bg-white rounded-2xl border border-green-200 p-8 text-center shadow-sm">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="font-bold text-xl mb-2">Airtime Purchased!</h3>
        <p className="text-gray-600 mb-1">
          <span className="font-semibold">
            ₦{status.amountNgn.toLocaleString()}
          </span>{" "}
          {status.network} airtime sent to
        </p>
        <p className="font-mono text-gray-900 font-semibold mb-4">
          {status.phone}
        </p>
        <a
          href={`https://celoscan.io/tx/${status.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline block mb-6"
        >
          View on Celoscan ↗
        </a>
        <button
          onClick={() => setStatus({ type: "idle" })}
          className="px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold rounded-xl transition-colors"
        >
          Buy More
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      {/* Wallet badge */}
      <div className="flex items-center justify-between mb-6 p-3 bg-gray-50 rounded-xl">
        <span className="text-xs text-gray-500">Connected wallet</span>
        <span className="font-mono text-sm text-gray-800">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Network selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Wifi className="inline h-4 w-4 mr-1" />
            Network
          </label>
          <div className="grid grid-cols-5 gap-2">
            {NETWORKS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNetwork(n)}
                disabled={isProcessing}
                className={`py-2 px-1 rounded-xl text-xs font-medium transition-all ${
                  network === n
                    ? "bg-yellow-400 text-gray-900 shadow"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                } disabled:opacity-50`}
              >
                {n === "Auto-detect" ? "Auto" : n}
              </button>
            ))}
          </div>
        </div>

        {/* Phone number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Phone className="inline h-4 w-4 mr-1" />
            Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08012345678"
            disabled={isProcessing}
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none text-gray-900 placeholder-gray-400"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount (₦ NGN)
          </label>
          {/* Quick amounts */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(String(a))}
                disabled={isProcessing}
                className={`py-2 rounded-xl text-sm font-medium transition-all ${
                  amount === String(a)
                    ? "bg-yellow-400 text-gray-900 shadow"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                } disabled:opacity-50`}
              >
                ₦{a.toLocaleString()}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Or enter custom amount"
            min="50"
            max="200000"
            disabled={isProcessing}
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none text-gray-900 placeholder-gray-400"
          />
        </div>

        {/* Status */}
        {(status.type === "error" || isProcessing) && (
          <div
            className={`p-3 rounded-xl flex items-start gap-2 text-sm ${
              status.type === "error"
                ? "bg-red-50 text-red-700"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            {status.type === "error" ? (
              <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            ) : (
              <Loader2 className="h-4 w-4 flex-shrink-0 mt-0.5 animate-spin" />
            )}
            <span>
              {status.type === "error"
                ? status.message
                : status.type === "parsing"
                ? "Preparing transaction..."
                : status.type === "signing"
                ? "Waiting for wallet signature..."
                : "Processing airtime purchase..."}
            </span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isProcessing}
          className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-200 disabled:cursor-not-allowed text-gray-900 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : (
            `Buy ${amount ? `₦${Number(amount).toLocaleString()}` : "Airtime"}`
          )}
        </button>
      </form>
    </div>
  );
}
