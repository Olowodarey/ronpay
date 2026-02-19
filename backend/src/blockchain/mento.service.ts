import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CeloService, CELO_TOKENS } from './celo.service';
import { providers, utils, BigNumber } from 'ethers';
import { Mento } from '@mento-protocol/mento-sdk';
import Redis from 'ioredis';

@Injectable()
export class MentoService implements OnModuleInit {
  private redis: Redis;
  private readonly logger = new Logger(MentoService.name);
  private readonly CACHE_TTL = 30; // 30 seconds for real rates
  private mento: Mento;
  private provider: providers.JsonRpcProvider;

  constructor(
    private readonly celoService: CeloService,
    private readonly configService: ConfigService,
  ) { }

  async onModuleInit() {
    // Initialize Redis for caching
    const redisUrl = this.configService.get('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        tls: redisUrl.startsWith('rediss:')
          ? { rejectUnauthorized: false }
          : undefined,
      });
    } else {
      this.redis = new Redis({
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
      });
    }

    // Initialize Ethers Provider for Mento SDK
    this.provider = new providers.JsonRpcProvider(
      "https://forno.celo-sepolia.celo-testnet.org"
    );

    try {
      this.mento = await Mento.create(this.provider);
      this.logger.log('Mento SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Mento SDK', error);
    }
  }

  /**
   * Get a quote for swapping tokens using real Mento Protocol rates with caching
   */
  async getSwapQuote(
    fromToken: keyof typeof CELO_TOKENS,
    toToken: keyof typeof CELO_TOKENS,
    amountIn: string,
  ) {
    const tokenMap = this.celoService.getTokenMap();
    const fromAddress = tokenMap[fromToken];
    const toAddress = tokenMap[toToken];

    if (fromAddress === 'native' || toAddress === 'native') {
      throw new Error('Native CELO swaps not fully supported for this operation.');
    }

    // Check cache first
    const cacheKey = `rate:${fromToken}:${toToken}:${amountIn}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        this.logger.debug(`Using cached rate for ${fromToken} → ${toToken}`);
        return cachedData;
      }
    } catch (cacheError) {
      // Ignore cache errors
    }

    try {
      // Use Mento SDK to get amount out
      // Assuming 18 decimals for stablecoins (cUSD, cEUR, etc)
      const amountInWei = utils.parseUnits(amountIn, 18);

      const amountOutWei = await this.mento.getAmountOut(
        fromAddress,
        toAddress,
        amountInWei
      );

      const amountOut = utils.formatUnits(amountOutWei, 18);

      // Calculate derived price (rate)
      const price = parseFloat(amountOut) / parseFloat(amountIn);

      const result = {
        amountOut,
        price,
        source: 'mento-sdk-v1',
        timestamp: Date.now(),
      };

      // Cache the result
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

      this.logger.log(`Fetched Mento rate: 1 ${fromToken} = ${price.toFixed(4)} ${toToken}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to fetch Mento quote: ${error.message}`, error.stack);
      // Fallback to mock if SDK fails (or if pair doesn't exist)
      this.logger.warn('Falling back to mock quotes due to error');
      return this.getMockQuote(fromToken, toToken as string, amountIn);
    }
  }

  /**
   * Get a quote for how much input is needed for a fixed output amount (swapOut)
   */
  async getAmountInQuote(
    fromToken: keyof typeof CELO_TOKENS,
    toToken: keyof typeof CELO_TOKENS,
    amountOut: string,
  ) {
    const tokenMap = this.celoService.getTokenMap();
    const fromAddress = tokenMap[fromToken];
    const toAddress = tokenMap[toToken];

    if (fromAddress === 'native' || toAddress === 'native') {
      throw new Error('Native CELO swaps not fully supported for this operation.');
    }

    try {
      const amountOutWei = utils.parseUnits(amountOut, 18);

      const amountInWei = await this.mento.getAmountIn(
        fromAddress,
        toAddress,
        amountOutWei
      );

      const amountIn = utils.formatUnits(amountInWei, 18);

      // Calculate derived price (rate)
      const price = parseFloat(amountOut) / parseFloat(amountIn);

      return {
        amountIn,
        price,
        source: 'mento-sdk-v1',
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Mento amountIn quote: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build a swap transaction data using Mento SDK
   */
  async buildSwapTransaction(
    fromToken: keyof typeof CELO_TOKENS,
    toToken: keyof typeof CELO_TOKENS,
    amountOut: string,
    maxAmountIn: string,
  ) {
    const tokenMap = this.celoService.getTokenMap();
    const fromAddress = tokenMap[fromToken];
    const toAddress = tokenMap[toToken];

    const amountOutWei = utils.parseUnits(amountOut, 18);
    const maxAmountInWei = utils.parseUnits(maxAmountIn, 18);

    // Standard Mento swapOut (receives into user's wallet)
    const txObj = await this.mento.swapOut(
      fromAddress,
      toAddress,
      amountOutWei,
      maxAmountInWei
    );

    return {
      to: txObj.to as string,
      data: txObj.data as string,
      value: txObj.value ? txObj.value.toString() : '0',
    };
  }

  /**
   * Fallback mock quotes (kept for resilience)
   */
  private getMockQuote(from: string, to: string, amount: string) {
    let rate = 1;
    // Mock rates
    if (from === 'USDm' && to === 'NGNm') rate = 1520;
    if (from === 'NGNm' && to === 'USDm') rate = 1 / 1520;
    if (from === 'USDm' && to === 'KESm') rate = 132; 
    if (from === 'KESm' && to === 'USDm') rate = 1 / 132;
    if (from === 'USDm' && to === 'BRLm') rate = 5.8; 
    if (from === 'BRLm' && to === 'USDm') rate = 1 / 5.8;

    // EURm rates
    if (from === 'EURm' && to === 'NGNm') rate = 1680;
    if (from === 'NGNm' && to === 'EURm') rate = 1 / 1680;

    const amountOut = (parseFloat(amount) * rate).toString();
    return {
      amountOut,
      price: rate,
      source: 'mock-fallback',
    };
  }
}
