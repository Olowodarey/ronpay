"use client";

import * as React from "react";
import { useAccount, useBalance } from "wagmi";
import { formatUnits } from "viem";
import { api } from "@/lib/api";

interface TokenBalanceProps {
  token: string;
}

export function TokenBalance({ token }: TokenBalanceProps) {
  const { address } = useAccount();
  const [tokenAddress, setTokenAddress] = React.useState<
    `0x${string}` | undefined
  >(undefined);
  const [isLoadingAddress, setIsLoadingAddress] = React.useState(true);

  React.useEffect(() => {
    async function fetchTokenAddress() {
      try {
        setIsLoadingAddress(true);
        const data = await api.getSupportedTokens();
        const addr = data.addresses[token];
        // If token is native (CELO), set to undefined
        setTokenAddress(
          addr === "native" ? undefined : (addr as `0x${string}`),
        );
      } catch (err) {
        console.error("Error fetching token address:", err);
      } finally {
        setIsLoadingAddress(false);
      }
    }

    fetchTokenAddress();
  }, [token]);

  const { data: balance, isLoading } = useBalance({
    address: address,
    token: tokenAddress,
  });

  if (isLoading || isLoadingAddress) {
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
