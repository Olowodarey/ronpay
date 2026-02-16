import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { PaymentIntent } from '../types';
import { randomUUID } from 'crypto';

/**
 * Conversation Service
 *
 * Manages conversation history for contextual AI parsing.
 * Each wallet can have an active session. Sessions auto-expire
 * after 30 minutes of inactivity.
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  // Session timeout in milliseconds (30 minutes)
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  // Maximum messages to include in AI context
  private readonly MAX_CONTEXT_MESSAGES = 10;

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
  ) {}

  /**
   * Get or create an active session for a wallet address.
   * If the most recent message is older than SESSION_TIMEOUT, start a new session.
   */
  async getOrCreateSession(walletAddress: string): Promise<string> {
    const lastMessage = await this.conversationRepo.findOne({
      where: { walletAddress },
      order: { createdAt: 'DESC' },
    });

    if (lastMessage) {
      const elapsed = Date.now() - lastMessage.createdAt.getTime();
      if (elapsed < this.SESSION_TIMEOUT_MS) {
        return lastMessage.sessionId;
      }
    }

    // Start a new session
    const sessionId = `session-${randomUUID()}`;
    this.logger.log(`New session for ${walletAddress}: ${sessionId}`);
    return sessionId;
  }

  /**
   * Add a user or assistant message to the conversation.
   */
  async addMessage(
    walletAddress: string,
    sessionId: string,
    role: 'user' | 'assistant',
    message: string,
    intent?: PaymentIntent,
  ): Promise<Conversation> {
    const entry = this.conversationRepo.create({
      walletAddress,
      sessionId,
      role,
      message,
      intent: intent || undefined,
      action: intent?.action || undefined,
    });

    return this.conversationRepo.save(entry);
  }

  /**
   * Get recent conversation history for a session.
   * Used to provide context to AI services for follow-up messages.
   */
  async getSessionHistory(
    sessionId: string,
    limit?: number,
  ): Promise<Conversation[]> {
    const messages = await this.conversationRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: limit || this.MAX_CONTEXT_MESSAGES,
    });
    return messages;
  }

  /**
   * Get conversation history for a wallet (across all sessions).
   */
  async getWalletHistory(
    walletAddress: string,
    limit = 50,
  ): Promise<Conversation[]> {
    return this.conversationRepo.find({
      where: { walletAddress },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Format conversation history into a context string for AI prompts.
   * Returns a formatted string suitable for appending to the system prompt.
   */
  formatContextForAI(history: Conversation[]): string {
    if (!history.length) return '';

    const lines = history.map((msg) => {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant';
      return `${prefix}: ${msg.message}`;
    });

    return `\n\nConversation context (recent messages):\n${lines.join('\n')}`;
  }

  /**
   * Clear all messages for a session (e.g., user says "start over").
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.conversationRepo.delete({ sessionId });
    this.logger.log(`Cleared session: ${sessionId}`);
  }

  /**
   * Clean up old sessions (sessions older than 24 hours).
   * Can be called periodically via a cron job.
   */
  async cleanupOldSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.conversationRepo.delete({
      createdAt: LessThan(cutoff),
    });
    const deleted = result.affected || 0;
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} old conversation entries`);
    }
    return deleted;
  }
}
