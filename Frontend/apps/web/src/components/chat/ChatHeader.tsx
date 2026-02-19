"use client";

import { Avatar } from "@/components/ui/avatar";
import { Dropdown } from "@/components/ui/dropdown";
import { MoreVertical } from "lucide-react";
import { useMiniPayWallet } from "@/hooks/useMiniPayWallet";
import { TokenBalance } from "@/components/chat/TokenBalance";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ChatHeaderProps {
  country: string;
  token: string;
  onCountryChange: (country: string) => void;
  onTokenChange: (token: string) => void;
}

const countries = [
  { value: "nigeria", label: "Nigeria", icon: "🇳🇬" },
  { value: "ghana", label: "Ghana", icon: "🇬🇭" },
  { value: "kenya", label: "Kenya", icon: "🇰🇪" },
];

export function ChatHeader({
  country,
  token,
  onCountryChange,
  onTokenChange,
}: ChatHeaderProps) {
  const { address, isConnected } = useMiniPayWallet();
  const [tokens, setTokens] = useState([
    { value: "USDm", label: "USDm" },
    { value: "CELO", label: "CELO" },
  ]);

  useEffect(() => {
    async function fetchSupportedTokens() {
      try {
        const data = await api.getSupportedTokens();
        const tokenOptions = data.tokens.map((tokenSymbol: string) => ({
          value: tokenSymbol,
          label: tokenSymbol,
        }));
        setTokens(tokenOptions);
      } catch (err) {
        console.error("Error fetching supported tokens:", err);
        // Keep default tokens on error
      }
    }

    fetchSupportedTokens();
  }, []);

  // Format address for display
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-5 py-3">
      <div className="flex items-center justify-between">
        {/* Profile Section */}
        <div className="flex items-center gap-3">
          <Avatar
            src="/logo1.png"
            alt="RonPay Assistant"
            fallback="R"
            className="h-11 w-11"
          />
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              RonPay Assistant
            </h1>
            <p className="text-xs text-gray-500">
              {isConnected && address
                ? formatAddress(address)
                : "Always Helpful • Powered by AI"}
            </p>
          </div>
        </div>

        {/* Token Balance */}
        <TokenBalance token={token} />

        {/* More Options */}
        {/* <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <MoreVertical className="h-5 w-5 text-gray-600" />
        </button> */}
      </div>

      {/* Country and Token Selectors */}
      <div className="flex items-center justify-between px-5 mt-3 ">
        <Dropdown
          value={country}
          options={countries}
          onChange={onCountryChange}
        />
        <Dropdown value={token} options={tokens} onChange={onTokenChange} />
      </div>
    </header>
  );
}
