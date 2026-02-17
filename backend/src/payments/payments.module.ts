import { Module, Global } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AiModule } from '../ai/ai.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

import { NellobytesModule } from '../nellobytes/nellobytes.module';

@Global()
@Module({
  imports: [BlockchainModule, AiModule, TransactionsModule, NellobytesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
