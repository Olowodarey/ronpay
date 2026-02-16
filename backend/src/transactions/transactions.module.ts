import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { Conversation } from './entities/conversation.entity';
import { TransactionsService } from './transactions.service';
import { ConversationService } from './conversation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Conversation])],
  providers: [TransactionsService, ConversationService],
  exports: [TransactionsService, ConversationService],
})
export class TransactionsModule {}
