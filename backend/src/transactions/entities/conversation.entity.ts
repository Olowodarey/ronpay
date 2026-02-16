import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('conversations')
@Index(['walletAddress'])
@Index(['sessionId'])
@Index(['walletAddress', 'sessionId'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  walletAddress: string;

  @Column()
  sessionId: string;

  @Column({ default: 'user' })
  role: string; // 'user' | 'assistant'

  @Column('text')
  message: string;

  @Column('jsonb', { nullable: true })
  intent: any; // Parsed PaymentIntent if applicable

  @Column({ nullable: true })
  action: string; // Quick lookup: 'send_payment', 'buy_airtime', etc.

  @CreateDateColumn()
  createdAt: Date;
}
