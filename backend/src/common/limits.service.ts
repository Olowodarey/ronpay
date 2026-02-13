import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';

// Transaction limits configuration
export const TRANSACTION_LIMITS = {
  MIN_AMOUNT_USD: 0.01,
  MAX_AMOUNT_USD: 10000,
  
  // Per-currency limits (equivalent to $10k)
  MAX_NGN: 15000000,  // ~$10k at 1500 rate
  MAX_KES: 1300000,   // ~$10k at 130 rate
  
  // Daily limits per wallet
  DAILY_MAX_USD: 50000,
  DAILY_MAX_TRANSACTIONS: 100,
};

interface TransactionLimit {
  wallet_address: string;
  daily_volume_usd: number;
  daily_tx_count: number;
  daily_volume_ngn: number;
  daily_volume_kes: number;
  last_reset: Date;
}

@Injectable()
export class LimitsService {
  constructor(
    @InjectRepository(TransactionLimit)
    private readonly limitsRepo: Repository<TransactionLimit>,
  ) {}

  /**
   * Check if transaction is within limits
   */
  async checkLimits(
    walletAddress: string,
    amount: number,
    currency: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check single transaction limits
    const singleTxCheck = this.checkSingleTransaction(amount, currency);
    if (!singleTxCheck.allowed) {
      return singleTxCheck;
    }

    // Get or create daily limits record
    let limits = await this.limitsRepo.findOne({
      where: { wallet_address: walletAddress },
    });

    if (!limits) {
      limits = this.limitsRepo.create({
        wallet_address: walletAddress,
        daily_volume_usd: 0,
        daily_tx_count: 0,
        daily_volume_ngn: 0,
        daily_volume_kes: 0,
        last_reset: new Date(),
      });
      await this.limitsRepo.save(limits);
    }

    // Auto-reset if 24 hours passed
    if (this.shouldReset(limits.last_reset)) {
      limits = await this.resetLimits(walletAddress);
    }

    // Check daily transaction count
    if (limits.daily_tx_count >= TRANSACTION_LIMITS.DAILY_MAX_TRANSACTIONS) {
      return {
        allowed: false,
        reason: `Daily transaction limit reached (${TRANSACTION_LIMITS.DAILY_MAX_TRANSACTIONS} tx/day)`,
      };
    }

    // Check daily volume (convert to USD for comparison)
    const amountUSD = this.convertToUSD(amount, currency);
    const newDailyVolume = limits.daily_volume_usd + amountUSD;

    if (newDailyVolume > TRANSACTION_LIMITS.DAILY_MAX_USD) {
      return {
        allowed: false,
        reason: `Daily volume limit exceeded ($${TRANSACTION_LIMITS.DAILY_MAX_USD}/day)`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record transaction in limits tracking
   */
  async recordTransaction(
    walletAddress: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    const limits = await this.limitsRepo.findOne({
      where: { wallet_address: walletAddress },
    });

    if (!limits) {
      throw new Error('Limits record not found');
    }

    const amountUSD = this.convertToUSD(amount, currency);

    limits.daily_tx_count += 1;
    limits.daily_volume_usd += amountUSD;

    // Track per-currency volumes
    if (currency === 'NGNm' || currency === 'NGN') {
      limits.daily_volume_ngn += amount;
    } else if (currency === 'KESm' || currency === 'KES') {
      limits.daily_volume_kes += amount;
    }

    await this.limitsRepo.save(limits);
  }

  /**
   * Check single transaction limits
   */
  private checkSingleTransaction(
    amount: number,
    currency: string,
  ): { allowed: boolean; reason?: string } {
    // Minimum check
    const amountUSD = this.convertToUSD(amount, currency);
    if (amountUSD < TRANSACTION_LIMITS.MIN_AMOUNT_USD) {
      return {
        allowed: false,
        reason: `Amount too small (min: $${TRANSACTION_LIMITS.MIN_AMOUNT_USD})`,
      };
    }

    // Maximum check (per currency)
    if (currency === 'NGNm' || currency === 'NGN') {
      if (amount > TRANSACTION_LIMITS.MAX_NGN) {
        return {
          allowed: false,
          reason: `Amount exceeds max for NGN (${TRANSACTION_LIMITS.MAX_NGN})`,
        };
      }
    } else if (currency === 'KESm' || currency === 'KES') {
      if (amount > TRANSACTION_LIMITS.MAX_KES) {
        return {
          allowed: false,
          reason: `Amount exceeds max for KES (${TRANSACTION_LIMITS.MAX_KES})`,
        };
      }
    }

    // USD check
    if (amountUSD > TRANSACTION_LIMITS.MAX_AMOUNT_USD) {
      return {
        allowed: false,
        reason: `Amount exceeds maximum ($${TRANSACTION_LIMITS.MAX_AMOUNT_USD})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Convert amount to USD for limit checking
   */
  private convertToUSD(amount: number, currency: string): number {
    // Approximate exchange rates for limit checking
    const rates: Record<string, number> = {
      'USDm': 1,
      'USDC': 1,
      'cUSD': 1,
      'NGNm': 1 / 1500,  // ~1500 NGN per USD
      'cNGN': 1 / 1500,
      'KESm': 1 / 130,   // ~130 KES per USD
      'cKES': 1 / 130,
    };

    return amount * (rates[currency] || 1);
  }

  /**
   * Check if limits should be reset (24 hours passed)
   */
  private shouldReset(lastReset: Date): boolean {
    const now = new Date();
    const hoursPassed = (now.getTime() - new Date(lastReset).getTime()) / (1000 * 60 * 60);
    return hoursPassed >= 24;
  }

  /**
   * Reset daily limits for a wallet
   */
  private async resetLimits(walletAddress: string): Promise<TransactionLimit> {
    await this.limitsRepo.update(
      { wallet_address: walletAddress },
      {
        daily_volume_usd: 0,
        daily_tx_count: 0,
        daily_volume_ngn: 0,
        daily_volume_kes: 0,
        last_reset: new Date(),
      },
    );

    return this.limitsRepo.findOne({
      where: { wallet_address: walletAddress },
    });
  }

  /**
   * Scheduled task to reset all limits at midnight UTC
   */
  @Cron('0 0 * * *') // Every day at midnight
  async resetAllLimits(): Promise<void> {
    await this.limitsRepo.query('SELECT reset_daily_limits()');
  }

  /**
   * Get current limits for a wallet (for dashboard display)
   */
  async getLimits(walletAddress: string): Promise<any> {
    const limits = await this.limitsRepo.findOne({
      where: { wallet_address: walletAddress },
    });

    if (!limits) {
      return {
        daily_tx_count: 0,
        daily_volume_usd: 0,
        transaction_limit: TRANSACTION_LIMITS.DAILY_MAX_TRANSACTIONS,
        volume_limit: TRANSACTION_LIMITS.DAILY_MAX_USD,
        remaining_tx: TRANSACTION_LIMITS.DAILY_MAX_TRANSACTIONS,
        remaining_volume: TRANSACTION_LIMITS.DAILY_MAX_USD,
      };
    }

    return {
      daily_tx_count: limits.daily_tx_count,
      daily_volume_usd: limits.daily_volume_usd,
      transaction_limit: TRANSACTION_LIMITS.DAILY_MAX_TRANSACTIONS,
      volume_limit: TRANSACTION_LIMITS.DAILY_MAX_USD,
      remaining_tx: TRANSACTION_LIMITS.DAILY_MAX_TRANSACTIONS - limits.daily_tx_count,
      remaining_volume: TRANSACTION_LIMITS.DAILY_MAX_USD - limits.daily_volume_usd,
      last_reset: limits.last_reset,
    };
  }
}
