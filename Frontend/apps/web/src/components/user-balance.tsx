"use client";

import { useAccount, useBalance } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";

interface SupportedTokens {
  tokens: string[];
  addresses: Record<string, string>;
}

function BalanceDisplay({
  address,
  token,
  symbol,
}: {
  address: `0x${string}`;
  token?: `0x${string}`;
  symbol: string;
}) {
  const { data, isLoading } = useBalance({
    address,
    token,
  });

  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{symbol}</span>
      <span className="font-medium">
        {isLoading
          ? "Loading..."
          : `${parseFloat(data?.formatted || "0").toFixed(4)}`}
      </span>
    </div>
  );
}

export function UserBalance() {
  const { address, isConnected } = useAccount();
  const [supportedTokens, setSupportedTokens] =
    useState<SupportedTokens | null>(null);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSupportedTokens() {
      try {
        setIsLoadingTokens(true);
        const response = await fetch("http://localhost:3001/payments/tokens");

        if (!response.ok) {
          throw new Error("Failed to fetch supported tokens");
        }

        const data = await response.json();
        setSupportedTokens(data);
        setError(null);
      } catch (err) {
        console.error("Error fetching supported tokens:", err);
        setError("Failed to load supported tokens");
      } finally {
        setIsLoadingTokens(false);
      }
    }

    fetchSupportedTokens();
  }, []);

  if (!isConnected || !address) {
    return null;
  }

  return (
    <Card className="w-full max-w-md mx-auto mb-8">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Connected Wallet</CardTitle>
        <p className="text-sm text-muted-foreground truncate pt-1">{address}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingTokens ? (
          <div className="text-center text-muted-foreground py-4">
            Loading supported tokens...
          </div>
        ) : error ? (
          <div className="text-center text-destructive py-4">{error}</div>
        ) : supportedTokens ? (
          <div className="space-y-2 pt-2 border-t">
            {supportedTokens.tokens.map((tokenSymbol) => {
              const tokenAddress = supportedTokens.addresses[tokenSymbol];
              const isNativeToken =
                tokenSymbol === "CELO" || tokenAddress === "native";

              return (
                <BalanceDisplay
                  key={tokenSymbol}
                  address={address}
                  symbol={tokenSymbol}
                  token={
                    isNativeToken ? undefined : (tokenAddress as `0x${string}`)
                  }
                />
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
