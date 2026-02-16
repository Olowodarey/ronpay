import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { CeloService, CELO_TOKENS } from '../blockchain/celo.service';
import { FeesService } from '../fees/fees.service';
import { Address } from 'viem';

/**
 * MCP Tools Provider
 *
 * Exposes RonPay's existing services as MCP-compatible tools
 * that any AI agent or LLM can discover and invoke.
 *
 * This does NOT duplicate logic — it delegates to existing services.
 */
@Injectable()
export class McpToolsProvider {
  constructor(
    private readonly celoService: CeloService,
    private readonly feesService: FeesService,
  ) {}

  @Tool({
    name: 'send_payment',
    description:
      'Build a payment transaction to send CELO or Mento stablecoins (USDm, EURm, BRLm, KESm, NGNm, cUSDC, cUSDT) to a recipient address on Celo',
    parameters: z.object({
      to: z.string().describe('Recipient 0x address (42 characters)'),
      amount: z.string().describe('Amount to send (e.g. "50", "100.5")'),
      token: z
        .enum([
          'USDm',
          'EURm',
          'BRLm',
          'KESm',
          'NGNm',
          'CELO',
          'cUSDC',
          'cUSDT',
        ])
        .default('USDm')
        .describe('Token to send (default: USDm)'),
    }),
  })
  async sendPayment({
    to,
    amount,
    token,
  }: {
    to: string;
    amount: string;
    token: keyof typeof CELO_TOKENS;
  }) {
    const tx = await this.celoService.buildPaymentTransaction(
      to as Address,
      amount,
      token,
    );
    return {
      status: 'transaction_built',
      transaction: tx,
      message: `Payment of ${amount} ${token} to ${to} is ready for signing`,
    };
  }

  @Tool({
    name: 'check_balance',
    description:
      'Get wallet token balances for USDm, CELO, KESm, EURm, and BRLm on Celo',
    parameters: z.object({
      address: z
        .string()
        .describe('Wallet 0x address to check balances for'),
    }),
  })
  async checkBalance({ address }: { address: string }) {
    const balances = await this.celoService.getAllBalances(address as Address);
    return {
      address,
      balances,
      message: `Balances for ${address.slice(0, 6)}...${address.slice(-4)}`,
    };
  }

  @Tool({
    name: 'get_single_balance',
    description:
      'Get the balance of a specific token for a wallet address',
    parameters: z.object({
      address: z.string().describe('Wallet 0x address'),
      token: z
        .enum([
          'USDm',
          'EURm',
          'BRLm',
          'KESm',
          'NGNm',
          'CELO',
          'cUSDC',
          'cUSDT',
        ])
        .default('USDm')
        .describe('Token to check balance for'),
    }),
  })
  async getSingleBalance({
    address,
    token,
  }: {
    address: string;
    token: keyof typeof CELO_TOKENS;
  }) {
    const balance = await this.celoService.getBalance(
      address as Address,
      token,
    );
    return {
      address,
      token,
      balance: parseFloat(balance),
    };
  }

  @Tool({
    name: 'compare_fees',
    description:
      'Compare remittance fees between RonPay (Celo + Mento) and Wise. Shows how much users save.',
    parameters: z.object({
      from: z
        .enum(['USD', 'EUR', 'GBP'])
        .describe('Source currency'),
      to: z
        .enum(['NGN', 'KES', 'BRL', 'EUR'])
        .describe('Target currency'),
      amount: z.number().describe('Amount to send in source currency'),
    }),
  })
  async compareFees({
    from,
    to,
    amount,
  }: {
    from: string;
    to: string;
    amount: number;
  }) {
    const comparison = await this.feesService.compareFees({
      from,
      to,
      amount,
    });
    return comparison;
  }

  @Tool({
    name: 'estimate_gas',
    description: 'Estimate gas cost for a Celo transaction',
    parameters: z.object({
      to: z.string().describe('Recipient 0x address'),
    }),
  })
  async estimateGas({ to }: { to: string }) {
    const gas = await this.celoService.estimateGas({
      to: to as Address,
    });
    return {
      estimatedGas: gas.toString(),
      message: `Estimated gas: ${gas}`,
    };
  }

  @Tool({
    name: 'get_supported_tokens',
    description: 'List all supported tokens on the Celo network',
    parameters: z.object({}),
  })
  async getSupportedTokens() {
    const tokens = this.celoService.getSupportedTokens();
    return {
      tokens,
      count: tokens.length,
    };
  }

  @Tool({
    name: 'verify_transaction',
    description:
      'Verify the status of a transaction by its hash',
    parameters: z.object({
      txHash: z
        .string()
        .describe('Transaction hash (0x...)'),
    }),
  })
  async verifyTransaction({ txHash }: { txHash: string }) {
    const receipt = await this.celoService.getTransactionReceipt(
      txHash as `0x${string}`,
    );
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
    };
  }
}
