"use client";

import * as React from "react";
import { useAccount, useBalance } from "wagmi";
import { formatUnits } from "viem";

interface TokenBalanceProps {
  token: string;
}

const tokenAddresses = {
  usdt: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as `0x${string}`, // USDT on Celo
  cusd: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`, // cUSD on Celo
  celo: undefined, // Native CELO
};

export function TokenBalance({ token }: TokenBalanceProps) {
  const { address } = useAccount();
  const tokenAddress = tokenAddresses[token as keyof typeof tokenAddresses];

  const { data: balance, isLoading } = useBalance({
    address: address,
    token: tokenAddress,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-xs text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 bg-gray-300 rounded-full" />
        <span className="text-xs text-gray-500">--</span>
      </div>
    );
  }

  const formattedBalance = parseFloat(
    formatUnits(balance.value, balance.decimals),
  ).toFixed(2);

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-2 bg-green-500 rounded-full" />
      <span className="text-xs font-medium text-gray-700">
        {formattedBalance} {balance.symbol}
      </span>
    </div>
  );
}
