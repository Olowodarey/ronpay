import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { WalletProvider } from "@/components/wallet-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RonPay - AI Payment Assistant",
  description:
    "AI-powered payment agent for buying airtime, data, and paying bills on Celo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
