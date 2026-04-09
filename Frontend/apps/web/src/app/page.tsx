"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useMiniPayWallet } from "@/hooks/useMiniPayWallet";
import { useRouter } from "next/navigation";
import { AirtimeBuySection } from "@/components/website/AirtimeBuySection";

export default function WebsitePage() {
  const { isMiniPay } = useMiniPayWallet();
  const { isConnected } = useAccount();
  const router = useRouter();

  React.useEffect(() => {
    if (isMiniPay) router.replace("/app");
  }, [isMiniPay, router]);

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo1.png" alt="RonPay" width={32} height={32} />
            <span className="font-bold text-xl">RonPay</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="#buy-airtime"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors hidden sm:block"
            >
              Buy Airtime
            </a>
            <Link
              href="/app"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors hidden sm:block"
            >
              MiniPay App
            </Link>
            <ConnectButton />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-b from-yellow-50 to-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-yellow-100 border border-yellow-200 rounded-full px-4 py-1.5 text-sm text-yellow-700 mb-6">
            ⚡ Powered by Celo · Instant delivery
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4">
            Buy airtime with <span className="text-yellow-500">crypto</span>
          </h1>
          <p className="text-lg text-gray-500 mb-8">
            Top up any Nigerian number instantly. Pay with USDm stablecoins on
            Celo — no bank needed.
          </p>
          <a
            href="#buy-airtime"
            className="inline-block px-8 py-3 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold rounded-xl transition-colors"
          >
            Buy Airtime Now
          </a>
        </div>
      </section>

      {/* Airtime Purchase Form */}
      <section id="buy-airtime" className="py-16 px-6 bg-gray-50 flex-1">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Purchase Airtime</h2>
            <p className="text-gray-500 text-sm">
              {isConnected
                ? "Fill in the details below to top up any Nigerian number."
                : "Connect your wallet to get started."}
            </p>
          </div>
          <AirtimeBuySection />
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-10">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Connect wallet",
                desc: "Use MetaMask, Valora, or any Celo-compatible wallet.",
              },
              {
                step: "2",
                title: "Enter details",
                desc: "Pick a network, enter the phone number and NGN amount.",
              },
              {
                step: "3",
                title: "Confirm & done",
                desc: "Sign the transaction. Airtime arrives in seconds.",
              },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-400 text-gray-900 font-bold flex items-center justify-center">
                  {s.step}
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-gray-500 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 text-center text-sm text-gray-400">
        <p>
          Built for the Celo Ecosystem ·{" "}
          <Link href="/app" className="underline hover:text-gray-600">
            Open MiniPay App
          </Link>
        </p>
      </footer>
    </div>
  );
}
