import { Injectable, Logger } from '@nestjs/common';
import { MentoService } from './mento.service';
import { CELO_TOKENS } from './celo.service';

/**
 * Route Optimizer Service
 *
 * Finds the cheapest path for cross-currency transfers on Celo.
 * Compares direct Mento swaps against multi-hop routes through intermediate tokens.
 *
 * Example: USD → NGN
 *   Path A: USDm → NGNm  (direct Mento swap)
 *   Path B: USDm → EURm → NGNm  (two-hop via EUR)
 *   Path C: USDm → KESm → NGNm  (two-hop via KES)
 */

export interface RouteQuote {
  path: string[];
  amountOut: string;
  totalCost: number; // effective cost = amountIn - value of amountOut in source currency
  price: number; // effective exchange rate
  source: string;
  hops: number;
}

export interface RouteComparison {
  bestRoute: RouteQuote;
  allRoutes: RouteQuote[];
  savings: string; // how much saved vs worst route
}

// Mento-supported intermediate tokens for multi-hop routing
const INTERMEDIATE_TOKENS = ['USDm', 'EURm', 'BRLm', 'KESm', 'NGNm'] as const;

@Injectable()
export class RouteOptimizerService {
  private readonly logger = new Logger(RouteOptimizerService.name);

  constructor(private readonly mentoService: MentoService) {}

  /**
   * Find the best route from one token to another.
   * Compares direct swap vs all viable multi-hop paths.
   */
  async findBestRoute(
    fromToken: keyof typeof CELO_TOKENS,
    toToken: keyof typeof CELO_TOKENS,
    amountIn: string,
  ): Promise<RouteComparison> {
    this.logger.log(`Finding best route: ${amountIn} ${fromToken} → ${toToken}`);

    const routes: RouteQuote[] = [];

    // 1. Try direct swap
    const directQuote = await this.getDirectQuote(fromToken, toToken, amountIn);
    if (directQuote) {
      routes.push(directQuote);
    }

    // 2. Try multi-hop through intermediate tokens
    const multiHopQuotes = await this.getMultiHopQuotes(fromToken, toToken, amountIn);
    routes.push(...multiHopQuotes);

    if (routes.length === 0) {
      this.logger.warn(`No routes found for ${fromToken} → ${toToken}`);
      throw new Error(`No routes available for ${fromToken} → ${toToken}`);
    }

    // 3. Sort by best output (highest amountOut = cheapest route)
    routes.sort((a, b) => parseFloat(b.amountOut) - parseFloat(a.amountOut));

    const bestRoute = routes[0];
    const worstRoute = routes[routes.length - 1];

    const savings =
      routes.length > 1
        ? (parseFloat(bestRoute.amountOut) - parseFloat(worstRoute.amountOut)).toFixed(4)
        : '0';

    this.logger.log(
      `Best route: ${bestRoute.path.join(' → ')} (${bestRoute.amountOut} ${toToken}, ${bestRoute.hops} hop${bestRoute.hops > 1 ? 's' : ''})`,
    );

    return {
      bestRoute,
      allRoutes: routes,
      savings,
    };
  }

  /**
   * Get a direct swap quote (single hop)
   */
  private async getDirectQuote(
    fromToken: keyof typeof CELO_TOKENS,
    toToken: keyof typeof CELO_TOKENS,
    amountIn: string,
  ): Promise<RouteQuote | null> {
    try {
      const quote = await this.mentoService.getSwapQuote(fromToken, toToken, amountIn);

      return {
        path: [fromToken, toToken],
        amountOut: quote.amountOut,
        totalCost: parseFloat(amountIn) - parseFloat(quote.amountOut) / quote.price,
        price: quote.price,
        source: quote.source || 'mento-direct',
        hops: 1,
      };
    } catch (error) {
      this.logger.debug(`No direct route: ${fromToken} → ${toToken}: ${error.message}`);
      return null;
    }
  }

  /**
   * Try all viable two-hop routes through intermediate tokens
   */
  private async getMultiHopQuotes(
    fromToken: keyof typeof CELO_TOKENS,
    toToken: keyof typeof CELO_TOKENS,
    amountIn: string,
  ): Promise<RouteQuote[]> {
    const routes: RouteQuote[] = [];

    for (const intermediate of INTERMEDIATE_TOKENS) {
      // Skip if intermediate is same as source or destination
      if (intermediate === fromToken || intermediate === toToken) continue;

      // Skip native CELO — can't route through it with Mento
      if (fromToken === 'CELO' || toToken === 'CELO') continue;

      try {
        // Hop 1: from → intermediate
        const hop1 = await this.mentoService.getSwapQuote(
          fromToken,
          intermediate as keyof typeof CELO_TOKENS,
          amountIn,
        );

        // Hop 2: intermediate → to
        const hop2 = await this.mentoService.getSwapQuote(
          intermediate as keyof typeof CELO_TOKENS,
          toToken,
          hop1.amountOut,
        );

        const effectivePrice = parseFloat(hop2.amountOut) / parseFloat(amountIn);

        routes.push({
          path: [fromToken, intermediate, toToken],
          amountOut: hop2.amountOut,
          totalCost: parseFloat(amountIn) - parseFloat(hop2.amountOut) / effectivePrice,
          price: effectivePrice,
          source: `mento-multihop-via-${intermediate}`,
          hops: 2,
        });

        this.logger.debug(
          `Multi-hop route: ${fromToken} → ${intermediate} → ${toToken} = ${hop2.amountOut}`,
        );
      } catch (error) {
        // Not all pairs have liquidity — silently skip
        this.logger.debug(
          `Multi-hop via ${intermediate} failed: ${error.message}`,
        );
      }
    }

    return routes;
  }

  /**
   * Get supported corridors (combinations that make sense for remittances)
   */
  getSupportedCorridors(): Array<{ from: string; to: string }> {
    return [
      { from: 'USDm', to: 'NGNm' },
      { from: 'USDm', to: 'KESm' },
      { from: 'USDm', to: 'BRLm' },
      { from: 'USDm', to: 'EURm' },
      { from: 'EURm', to: 'NGNm' },
      { from: 'EURm', to: 'KESm' },
      { from: 'EURm', to: 'BRLm' },
      { from: 'BRLm', to: 'NGNm' },
      { from: 'KESm', to: 'NGNm' },
    ];
  }
}
