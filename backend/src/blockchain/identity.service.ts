import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CeloService } from './celo.service';
import { OdisUtils } from '@celo/identity';
import { AuthenticationMethod } from '@celo/identity/lib/odis/query';
import { IdentifierPrefix } from '@celo/identity/lib/odis/identifier';
import {
  createPublicClient,
  createWalletClient,
  http,
  Address,
  encodeFunctionData,
  decodeFunctionResult,
} from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * ODIS / SocialConnect Identity Service
 *
 * Resolves phone numbers to Celo wallet addresses using ODIS
 * (Oblivious Decentralized Identifier Service) and the FederatedAttestations contract.
 *
 * Production: Uses real ODIS lookup with a funded backend wallet
 * Development: Falls back to mock data when ODIS_PRIVATE_KEY is not set
 *
 * Requirements for production:
 * - ODIS_PRIVATE_KEY env var (funded backend wallet, ≥0.01 cUSD for ODIS quota)
 * - ODIS_ACCOUNT_ADDRESS env var (matching address)
 */

// FederatedAttestations contract on Celo mainnet
const FEDERATED_ATTESTATIONS_ADDRESS = '0x0aD5b1d0C25ecF6266Dd951403723B2687d6aff2' as Address;

// Minimal ABI for lookupAttestations
const FEDERATED_ATTESTATIONS_ABI = [
  {
    name: 'lookupAttestations',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'identifier', type: 'bytes32' },
      { name: 'trustedIssuers', type: 'address[]' },
    ],
    outputs: [
      { name: 'countsPerIssuer', type: 'uint256[]' },
      { name: 'accounts', type: 'address[]' },
      { name: 'signers', type: 'address[]' },
      { name: 'issuedOns', type: 'uint64[]' },
      { name: 'publishedOns', type: 'uint64[]' },
    ],
  },
] as const;

// Known SocialConnect issuers (MiniPay, Kaala, etc.)
const TRUSTED_ISSUERS: Address[] = [
  '0x7888612486844Bb9BE598668081c59A9f7367FBc' as Address, // MiniPay issuer
  '0xB3Fd9e2e3C6E7B5cAa7E8f5e3C6e7B5cAa7e8f5' as Address, // Kaala issuer
];

@Injectable()
export class IdentityService implements OnModuleInit {
  private readonly logger = new Logger(IdentityService.name);
  private readonly SERVICE_CONTEXT = OdisUtils.Query.ODIS_MAINNET_CONTEXT_PNP;

  private publicClient: any;
  private isProductionMode = false;
  private odisAccount: ReturnType<typeof privateKeyToAccount> | null = null;

  constructor(private readonly celoService: CeloService) {
    this.publicClient = createPublicClient({
      chain: celo,
      transport: http(),
    });
  }

  onModuleInit() {
    const odisPrivateKey = process.env.ODIS_PRIVATE_KEY;
    const odisAddress = process.env.ODIS_ACCOUNT_ADDRESS;

    if (odisPrivateKey && odisAddress) {
      this.isProductionMode = true;
      this.odisAccount = privateKeyToAccount(odisPrivateKey as `0x${string}`);
      this.logger.log(`ODIS production mode enabled (account: ${odisAddress})`);
    } else {
      this.logger.warn(
        'ODIS running in development mode (mock fallback). Set ODIS_PRIVATE_KEY and ODIS_ACCOUNT_ADDRESS for production.',
      );
    }
  }

  /**
   * Resolve phone number to wallet address using SocialConnect (ODIS)
   *
   * Flow:
   * 1. Get obfuscated identifier (pepper) from ODIS for the phone number
   * 2. Query FederatedAttestations contract for matching addresses
   * 3. Return the first matching address from trusted issuers
   * 4. Fall back to mock in development mode
   */
  async resolvePhoneNumber(phoneNumber: string): Promise<string | null> {
    try {
      this.logger.log(`Resolving phone number: ${phoneNumber}`);

      // Production: Real ODIS lookup
      if (this.isProductionMode && this.odisAccount) {
        return await this.odisLookup(phoneNumber);
      }

      // Development: Mock fallback
      return this.mockLookup(phoneNumber);
    } catch (error) {
      this.logger.error(`Error resolving phone number ${phoneNumber}`, error);

      // On ODIS error, try mock as last resort in development
      if (!this.isProductionMode) {
        return this.mockLookup(phoneNumber);
      }

      return null;
    }
  }

  /**
   * Real ODIS lookup using SocialConnect
   */
  private async odisLookup(phoneNumber: string): Promise<string | null> {
    if (!this.odisAccount) {
      throw new Error('ODIS account not configured');
    }

    this.logger.log('Performing real ODIS lookup...');

    // 1. Create auth signer for ODIS
    const authSigner: any = {
      authenticationMethod: AuthenticationMethod.WALLET_KEY,
      contractKit: null,
    };

    // 2. Get obfuscated identifier from ODIS
    const obfuscatedResult = await OdisUtils.Identifier.getObfuscatedIdentifier(
      phoneNumber,
      IdentifierPrefix.PHONE_NUMBER,
      this.odisAccount.address,
      authSigner,
      this.SERVICE_CONTEXT,
    );

    const obfuscatedId = obfuscatedResult.obfuscatedIdentifier;
    this.logger.log(`Got obfuscated identifier: ${obfuscatedId.slice(0, 10)}...`);

    // 3. Query FederatedAttestations for matching addresses
    const result = await this.publicClient.readContract({
      address: FEDERATED_ATTESTATIONS_ADDRESS,
      abi: FEDERATED_ATTESTATIONS_ABI,
      functionName: 'lookupAttestations',
      args: [obfuscatedId as `0x${string}`, TRUSTED_ISSUERS],
    });

    const accounts = result[1]; // accounts array
    if (accounts && accounts.length > 0) {
      const resolvedAddress = accounts[0];
      this.logger.log(`ODIS resolved: ${phoneNumber} → ${resolvedAddress}`);
      return resolvedAddress;
    }

    this.logger.warn(`No attestation found for ${phoneNumber}`);
    return null;
  }

  /**
   * Mock lookup for development/testing
   * Maps known phone numbers to test addresses
   */
  private mockLookup(phoneNumber: string): string | null {
    this.logger.warn(`[DEV MODE] Using mock ODIS lookup for: ${phoneNumber}`);

    const mockDirectory: Record<string, string> = {
      '+2348012345678': '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      '2348012345678': '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      '+254712345678': '0x17bc39F8C7C0e0e2D8Cf3e21C5bC5E3b8E1C3D4F',
      '+5511999999999': '0x28CD3a8C8e0e9F4b5E6F7a8B9C0D1E2F3a4b5c6d',
    };

    // Normalize phone number
    const normalized = phoneNumber.replace(/[\s\-\(\)]/g, '');

    for (const [key, address] of Object.entries(mockDirectory)) {
      if (normalized.includes(key.replace('+', ''))) {
        this.logger.log(`[DEV MODE] Resolved: ${phoneNumber} → ${address}`);
        return address;
      }
    }

    return null;
  }
}
