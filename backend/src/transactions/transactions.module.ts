import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { Conversation } from './entities/conversation.entity';
import { TransactionsService } from './transactions.service';
import { ConversationService } from './conversation.service';
import { ReceiptsService } from './receipts.service';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Conversation]), FeesModule],
  providers: [TransactionsService, ConversationService, ReceiptsService],
  exports: [TransactionsService, ConversationService, ReceiptsService],
})
export class TransactionsModule {}
