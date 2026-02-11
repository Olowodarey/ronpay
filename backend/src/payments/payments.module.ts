import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AiModule } from '../ai/ai.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [BlockchainModule, AiModule, TransactionsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
