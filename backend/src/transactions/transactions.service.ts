import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
  ) {}

  async create(data: Partial<Transaction>): Promise<Transaction> {
    const transaction = this.transactionsRepository.create(data);
    return this.transactionsRepository.save(transaction);
  }

  async findByAddress(address: string): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: [
        { fromAddress: address.toLowerCase() },
        { toAddress: address.toLowerCase() },
      ],
      order: { createdAt: 'DESC' },
      take: 50, // Limit to last 50 transactions
    });
  }

  async findByTxHash(txHash: string): Promise<Transaction | null> {
    return this.transactionsRepository.findOne({
      where: { txHash },
    });
  }

  async updateStatus(txHash: string, status: string): Promise<void> {
    await this.transactionsRepository.update({ txHash }, { status });
  }

  async getStats(address: string) {
    const transactions = await this.findByAddress(address);
    
    const sent = transactions.filter(tx => tx.fromAddress.toLowerCase() === address.toLowerCase());
    const received = transactions.filter(tx => tx.toAddress.toLowerCase() === address.toLowerCase());

    return {
      total: transactions.length,
      sent: sent.length,
      received: received.length,
      sentVolume: sent.reduce((sum, tx) => sum + Number(tx.amount), 0),
      receivedVolume: received.reduce((sum, tx) => sum + Number(tx.amount), 0),
    };
  }
}
