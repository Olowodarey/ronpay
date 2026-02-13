import { Controller, Get, Query, ParseFloatPipe } from '@nestjs/common';
import { FeesService } from './fees.service';
import { FeeComparisonDto } from './dto/fee-comparison.dto';

/**
 * Fee Comparison Controller
 * Exposes endpoints for comparing remittance fees
 */
@Controller('fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  /**
   * Compare fees for a specific corridor
   * @example GET /fees/compare?from=USD&to=NGN&amount=100
   */
  @Get('compare')
  async compareFees(
      @Query('from') from: string,
      @Query('to') to: string,
      @Query('amount', ParseFloatPipe) amount: number,
  ) {
    const comparisonDto: FeeComparisonDto = {
        from,
        to,
        amount,
    };

    return this.feesService.compareFees(comparisonDto);
  }

  /**
   * Get list of supported corridors
   * @example GET /fees/corridors
   */
  @Get('corridors')
  getSupportedCorridors() {
    return {
      corridors: this.feesService.getSupportedCorridors(),
      count: this.feesService.getSupportedCorridors().length,
    };
  }
}
