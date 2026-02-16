import { MentoService } from './mento.service';
import { IdentityService } from './identity.service';
import { CeloService } from './celo.service';
import { RouteOptimizerService } from './route-optimizer.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [CeloService, MentoService, IdentityService, RouteOptimizerService],
  exports: [CeloService, MentoService, IdentityService, RouteOptimizerService],
})
export class BlockchainModule {}
