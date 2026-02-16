"use client";

import { TokenSendForm } from "@/components/payment/TokenSendForm";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";

export default function TestSendPage() {
  const handleSuccess = (txHash: string) => {
    console.log("✅ Token send successful!", txHash);
  };

  const handleError = (error: string) => {
    console.error("❌ Token send failed:", error);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-orange-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">
              Direct Token Send
            </h1>
            <p className="text-xs text-gray-600">Test page - No AI required</p>
          </div>
          <Send className="h-6 w-6 text-yellow-500" />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <h3 className="font-semibold text-blue-900 mb-2">
            🧪 Test Mode Active
          </h3>
          <p className="text-sm text-blue-800">
            This page allows you to send tokens directly without AI interaction.
            Simply fill in the form below and confirm the transaction in your
            MiniPay wallet.
          </p>
        </div>

        {/* Token Send Form */}
        <TokenSendForm onSuccess={handleSuccess} onError={handleError} />

        {/* Instructions */}
        <div className="mt-8 p-4 bg-gray-50 rounded-xl">
          <h3 className="font-semibold text-gray-900 mb-3">How it works:</h3>
          <ol className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2">
              <span className="font-bold text-yellow-600">1.</span>
              <span>Enter the recipient's wallet address (0x...)</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-yellow-600">2.</span>
              <span>Enter the amount you want to send</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-yellow-600">3.</span>
              <span>Select the currency (cUSD, cEUR, USDT, USDC)</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-yellow-600">4.</span>
              <span>Optionally add a memo/note for the transaction</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-yellow-600">5.</span>
              <span>Click "Send" and sign the transaction in MiniPay</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-yellow-600">6.</span>
              <span>
                Wait for confirmation - tokens will be sent instantly!
              </span>
            </li>
          </ol>
        </div>

        {/* Supported Currencies */}
        <div className="mt-6 p-4 bg-white rounded-xl border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">
            Supported Currencies:
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-900">cUSD</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-900">cEUR</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-900">USDT</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg">
              <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-900">USDC</span>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <h3 className="font-semibold text-yellow-900 mb-2">
            ⚠️ Security Notice
          </h3>
          <ul className="space-y-1 text-sm text-yellow-800">
            <li>• Always verify the recipient address before sending</li>
            <li>• Double-check the amount and currency</li>
            <li>• Transactions on blockchain are irreversible</li>
            <li>• Keep your wallet secure and never share your private keys</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
