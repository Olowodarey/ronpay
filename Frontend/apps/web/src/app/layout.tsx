import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { WalletProvider } from "@/components/wallet-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RonPay - AI Payment Assistant",
  description:
    "AI-powered payment agent for buying airtime, data, and paying bills on Celo",
  other: {
    "talentapp:project_verification":
      "c3b2f8f3be0c80e403817d6a25dc67553f8fea5aa23e861902e342e0a0b665ba8759d092123ed922fa9778e7b11de4d299a2b0f7c95697704eada0aad414c7d0",
  },
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
