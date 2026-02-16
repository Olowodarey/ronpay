/**
 * RonPay Agent Configuration
 * Central config for the AI payment agent
 */

export const AGENT_CONFIG = {
  // Agent Identity (from SelfClaw dashboard)
  agentId: '4fdef06f-7f60-4a3f-8203-6e8f834c1952',
  erc8004OnChainId: 22,
  wallet: '0x868eBAfF16cF072CD4706Ad8d4c4a14fEdcD9860',

  // Agent Metadata
  name: 'RonPay',
  description:
    'AI-powered payment agent for Africa and Beyond. Send money using natural language, schedule recurring payments, and auto-pay bills.',
  version: '1.0.0',
  category: 'Payment',

  // Payment Settings
  maxTransactionAmount: 1000, // $1,000 USD equivalent
  confirmationThreshold: 100, // Require confirmation for txs over $100

  // Supported currencies
  supportedCurrencies: [
    'USDm',
    'EURm',
    'BRLm',
    'KESm',
    'NGNm',
    'CELO',
    'cUSDC',
    'cUSDT',
  ] as const,

  // Default currency
  defaultCurrency: 'USDm' as const,

  // Supported languages
  supportedLanguages: ['en', 'es', 'pt', 'fr'] as const,

  // Skills (matching dashboard)
  skills: [
    { name: 'Send CELO', description: 'Send native CELO tokens' },
    { name: 'Send Tokens', description: 'Send Mento stablecoins (USDm, EURm, BRLm, KESm, NGNm)' },
    { name: 'Check Balance', description: 'Check wallet balances across all supported tokens' },
    { name: 'Query Rate', description: 'Compare fees vs Wise and Western Union' },
    { name: 'Gas Price', description: 'Estimate gas costs for transactions' },
    { name: 'Buy Airtime', description: 'Purchase Nigerian airtime (MTN, Airtel, Glo, 9mobile)' },
    { name: 'Pay Bills', description: 'Pay TV, electricity, and data bills via VTPASS' },
    { name: 'Schedule Payment', description: 'Set up recurring payments (daily, weekly, monthly)' },
  ],

  // Fee comparison corridors
  supportedCorridors: [
    { from: 'USD', to: 'NGN' },
    { from: 'USD', to: 'KES' },
    { from: 'USD', to: 'BRL' },
    { from: 'EUR', to: 'NGN' },
    { from: 'EUR', to: 'KES' },
    { from: 'USD', to: 'EUR' },
  ],
} as const;

export type SupportedCurrency = (typeof AGENT_CONFIG.supportedCurrencies)[number];
