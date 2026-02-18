import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  Address,
  encodeFunctionData,
} from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ERC20_ABI } from '../abis/erc20';

// Chain IDs
export const CELO_CHAIN_IDS = {
  MAINNET: 42220,
  ALFAJORES: 11142220,
};

// Celo token addresses on Mainnet
export const CELO_MAINNET_TOKENS = {
  USDm: '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b',
  EURm: '0xA99dC247d6b7B2E3ab48a1fEE101b83cD6aCd82a',
  BRLm: '0x2294298942fdc79417DE9E0D740A4957E0e7783a',
  KESm: '0xC7e4635651E3e3Af82b61d3E23c159438daE3BbF',
  NGNm: '0x3d5ae86F34E2a82771496D140daFAEf3789dF888',
  cUSDC: '0xceb09c2a6886ed289893d562b87f8d689b9d118c',
  cUSDT: '0xb020D981420744F6b0FedD22bB67cd37Ce18a1d5',
  CELO: 'native',
} as const;

// Celo token addresses on Sepolia (Alfajores)
export const CELO_ALFAJORES_TOKENS = {
  USDm: '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b',
  EURm: '0xA99dC247d6b7B2E3ab48a1fEE101b83cD6aCd82a',
  BRLm: '0x2294298942fdc79417DE9E0D740A4957E0e7783a',
  KESm: '0xC7e4635651E3e3Af82b61d3E23c159438daE3BbF',
  NGNm: '0x3d5ae86F34E2a82771496D140daFAEf3789dF888',
  cUSDC: '0x2F25de78D37f3008060f08994693aF412bc371c9',
  cUSDT: '0x48065bB66110C0E97E951662961eD35aD2177395',
  // cUSDC: '0xceb09c2a6886ed289893d562b87f8d689b9d118c', // Native USDC on Celo
  // cUSDT: '0xb020D981420744F6b0FedD22bB67cd37Ce18a1d5', // Native USDT on Celo
  CELO: 'native',
} as const;

// Combined export for backward compatibility or general use
export const CELO_TOKENS = CELO_MAINNET_TOKENS;

// Broker addresses
export const MENTO_BROKER_ADDRESSES = {
  [CELO_CHAIN_IDS.MAINNET]: '0x777A8255cA72412f0d706dc03C9D1987306B4CaD',
  [CELO_CHAIN_IDS.ALFAJORES]: '0xB9Ae2065142EB79b6c5EB1E8778F883fad6B07Ba',
};

@Injectable()
export class CeloService implements OnModuleInit {
  private readonly logger = new Logger(CeloService.name);
  private publicClient: any;
  private walletClient: any;
  private backendAccount: ReturnType<typeof privateKeyToAccount> | null = null;

  constructor() {
    this.publicClient = createPublicClient({
      chain: celo,
      transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org'),
    });
  }

  onModuleInit() {
    const schedulerKey = process.env.SCHEDULER_PRIVATE_KEY;
    if (schedulerKey) {
      // Validate and normalize private key format
      let normalizedKey = schedulerKey.trim();
      if (!normalizedKey.startsWith('0x')) {
        normalizedKey = '0x' + normalizedKey;
      }

      if (normalizedKey.length !== 66) {
        this.logger.error(
          `Invalid SCHEDULER_PRIVATE_KEY length: ${normalizedKey.length} (expected 66 chars including 0x)`,
        );
        return;
      }

      try {
        this.backendAccount = privateKeyToAccount(
          normalizedKey as `0x${string}`,
        );
        this.walletClient = createWalletClient({
          account: this.backendAccount,
          chain: celo,
          transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org'),
        });
        this.logger.log(
          `Backend signing wallet initialised: ${this.backendAccount.address}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to initialize scheduler wallet: ${error.message}`,
        );
      }
    } else {
      this.logger.warn(
        'SCHEDULER_PRIVATE_KEY not set — scheduled payments will fail. Set this env var for production.',
      );
    }
  }

  /**
   * Build transaction data for client-side signing (MiniPay compatible)
   * Returns unsigned transaction that MiniPay will sign
   */
  async buildPaymentTransaction(
    to: Address,
    amount: string,
    token: keyof typeof CELO_TOKENS = 'USDm',
    feeCurrency?: Address,
  ) {
    console.log('Building payment transaction for:', {
      to,
      amount,
      token,
      feeCurrency,
    });
    const amountInWei = parseUnits(amount, 18);

    if (token === 'CELO') {
      // Native CELO transfer
      console.log('Native CELO transfer');
      return {
        to,
        value: amountInWei.toString(),
        data: '0x' as `0x${string}`,
        feeCurrency: feeCurrency || CELO_TOKENS.USDm, // Pay gas in USDm by default
      };
    } else {
      console.log('ERC20 token transfer');
      // ERC20 token transfer
      const tokenAddress = CELO_TOKENS[token] as Address;

      // Encode transfer function call
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [to, amountInWei],
      });

      return {
        to: tokenAddress,
        value: '0',
        data,
        feeCurrency: feeCurrency || CELO_TOKENS.USDm, // Pay gas in USDm
      };
    }
  }

  /**
   * Get balance of a wallet address
   */
  async getBalance(
    address: Address,
    token: keyof typeof CELO_TOKENS = 'USDm',
  ): Promise<string> {
    if (token === 'CELO') {
      const balance = await this.publicClient.getBalance({ address });
      return formatUnits(balance, 18);
    } else {
      const tokenAddress = CELO_TOKENS[token] as Address;

      const balance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });

      return formatUnits(balance as bigint, 18);
    }
  }

  /**
   * Get multiple token balances at once
   */
  async getAllBalances(address: Address) {
    const [USDm, CELO, KESm, EURm, BRLm] = await Promise.all([
      this.getBalance(address, 'USDm'),
      this.getBalance(address, 'CELO'),
      this.getBalance(address, 'KESm'),
      this.getBalance(address, 'EURm'),
      this.getBalance(address, 'BRLm'),
    ]);

    return {
      USDm: parseFloat(USDm),
      CELO: parseFloat(CELO),
      KESm: parseFloat(KESm),
      EURm: parseFloat(EURm),
      BRLm: parseFloat(BRLm),
    };
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash: `0x${string}`) {
    return this.publicClient.getTransactionReceipt({ hash: txHash });
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(txHash: `0x${string}`) {
    return this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000, // 60 seconds
    });
  }

  /**
   * Verify an ERC20 transfer within a transaction
   */
  async verifyERC20Transfer(
    txHash: `0x${string}`,
    expectedTo: Address,
    expectedAmount: string,
    token: keyof typeof CELO_TOKENS = 'USDm',
  ): Promise<boolean> {
    const receipt = await this.waitForTransaction(txHash);
    if (receipt.status !== 'success') return false;

    const tokenAddress = CELO_TOKENS[token] as Address;
    const expectedAmountInWei = parseUnits(expectedAmount, 18);

    // Filter logs for Transfer events from our token
    const transferLogs = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === tokenAddress.toLowerCase() &&
        log.topics[0] ===
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer(address,address,uint256)
    );

    for (const log of transferLogs) {
      // Transfer event: topic[1] is 'from', topic[2] is 'to'
      const to = `0x${log.topics[2]?.substring(26)}`.toLowerCase();
      const value = BigInt(log.data);

      if (
        to === expectedTo.toLowerCase() &&
        value >= expectedAmountInWei // Allow for slight rounding differences or excess
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(transaction: {
    to: Address;
    value?: bigint;
    data?: `0x${string}`;
  }) {
    return this.publicClient.estimateGas(transaction);
  }

  /**
   * Get all supported tokens
   */
  getSupportedTokens() {
    return Object.keys(CELO_TOKENS);
  }

  /**
   * Get token address by symbol
   */
  getTokenAddress(token: keyof typeof CELO_TOKENS): Address | 'native' {
    return CELO_TOKENS[token];
  }

  /**
   * Get the active token mapping based on chain ID
   */
  getTokenMap() {
    const chainId = parseInt(process.env.CELO_CHAIN_ID || '42220');
    return chainId === CELO_CHAIN_IDS.ALFAJORES
      ? CELO_ALFAJORES_TOKENS
      : CELO_MAINNET_TOKENS;
  }

  /**
   * Get the Broker address for the active network
   */
  getBrokerAddress(): Address {
    const chainId = parseInt(process.env.CELO_CHAIN_ID || '42220');
    return (MENTO_BROKER_ADDRESSES[chainId] ||
      MENTO_BROKER_ADDRESSES[CELO_CHAIN_IDS.MAINNET]) as Address;
  }

  /**
   * Get allowance of a token for a spender
   */
  async getAllowance(
    token: keyof typeof CELO_TOKENS,
    owner: Address,
    spender: Address,
  ): Promise<string> {
    if (token === 'CELO') return '1000000000'; // Native CELO doesn't need allowance

    const tokenMap = this.getTokenMap();
    const tokenAddress = tokenMap[token] as Address;

    try {
      const allowance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner, spender],
      });

      return formatUnits(allowance as bigint, 18);
    } catch (error) {
      this.logger.error(
        `Failed to get allowance for ${token}: ${error.message}`,
      );
      return '0';
    }
  }

  /**
   * Build an approve transaction for a token
   */
  async buildApproveTransaction(
    token: keyof typeof CELO_TOKENS,
    spender: Address,
    amount: string = '1000000.0',
  ) {
    const tokenMap = this.getTokenMap();
    const tokenAddress = tokenMap[token] as Address;
    const amountWei = parseUnits(amount, 18);

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, amountWei],
    });

    return {
      to: tokenAddress,
      value: '0',
      data,
      feeCurrency: tokenMap.USDm as Address,
    };
  }

  /**
   * Validate Celo address
   */
  isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  // ────────────────────────────────────────────────────────────
  // Backend Wallet — Signs & broadcasts for scheduled payments
  // ────────────────────────────────────────────────────────────

  /**
   * Whether the backend wallet is available for signing.
   */
  get canSign(): boolean {
    return this.backendAccount !== null && this.walletClient !== null;
  }

  /**
   * Get the backend wallet address
   */
  get signerAddress(): Address | null {
    return this.backendAccount?.address || null;
  }

  /**
   * Send an ERC20 transfer signed by the backend wallet.
   * Used for scheduled/recurring payments where there is no MiniPay to sign.
   *
   * Requires SCHEDULER_PRIVATE_KEY env var.
   * The wallet must hold sufficient token balance + gas.
   */
  async sendERC20Transfer(
    to: Address,
    amount: string,
    token: keyof typeof CELO_TOKENS = 'USDm',
  ): Promise<{ txHash: `0x${string}`; status: string }> {
    if (!this.walletClient || !this.backendAccount) {
      throw new Error(
        'Backend signing wallet not configured. Set SCHEDULER_PRIVATE_KEY env var.',
      );
    }

    const amountInWei = parseUnits(amount, 18);

    if (token === 'CELO') {
      // Native CELO transfer
      const txHash = await this.walletClient.sendTransaction({
        to,
        value: amountInWei,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });

      this.logger.log(`CELO transfer confirmed: ${txHash} (${receipt.status})`);
      return { txHash, status: receipt.status };
    }

    // ERC20 transfer
    const tokenAddress = CELO_TOKENS[token] as Address;
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amountInWei],
    });

    const txHash = await this.walletClient.sendTransaction({
      to: tokenAddress,
      data,
      value: 0n,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });

    this.logger.log(
      `ERC20 transfer confirmed: ${amount} ${token} → ${to} | tx: ${txHash} (${receipt.status})`,
    );

    if (receipt.status !== 'success') {
      throw new Error(`Transaction reverted: ${txHash}`);
    }

    return { txHash, status: receipt.status };
  }
}
