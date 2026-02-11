"use client";

import * as React from "react";
import { useAccount } from "wagmi";

interface MiniPayWalletProps {
  children: (
    address: string | undefined,
    isConnected: boolean,
  ) => React.ReactNode;
}

/**
 * Hook to get MiniPay wallet information
 * Automatically connects to MiniPay's injected wallet
 */
export function useMiniPayWallet() {
  const { address, isConnected } = useAccount();
  const [isMiniPay, setIsMiniPay] = React.useState(false);

  React.useEffect(() => {
    // Check if running in MiniPay
    if (typeof window !== "undefined" && window.ethereum?.isMiniPay) {
      setIsMiniPay(true);
    }
  }, []);

  return {
    address,
    isConnected,
    isMiniPay,
  };
}

/**
 * Component to access MiniPay wallet via render props
 */
export function MiniPayWallet({ children }: MiniPayWalletProps) {
  const { address, isConnected } = useMiniPayWallet();
  return <>{children(address, isConnected)}</>;
}
