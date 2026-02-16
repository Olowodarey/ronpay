import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { FeesService } from '../fees/fees.service';

/**
 * Receipts Service
 *
 * Generates formatted transaction receipts with savings calculations
 * and multi-language support.
 */

export interface TransactionReceipt {
  receiptId: string;
  timestamp: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  txHash: string;
  explorerUrl: string;
  fee: string;
  estimatedSavings: string;
  memo: string | null;
  metadata: any;
  formatted: {
    text: Record<string, string>;
    summary: string;
  };
}

const RECEIPT_MESSAGES = {
  en: {
    title: 'RonPay Transaction Receipt',
    from: 'From',
    to: 'To',
    amount: 'Amount',
    fee: 'Network Fee',
    savings: 'Estimated Savings vs Traditional',
    status: 'Status',
    txHash: 'Transaction Hash',
    date: 'Date',
    explorer: 'View on Celo Explorer',
    success: '✅ Transaction Successful',
    pending: '⏳ Transaction Pending',
    failed: '❌ Transaction Failed',
  },
  es: {
    title: 'Recibo de Transacción RonPay',
    from: 'De',
    to: 'Para',
    amount: 'Monto',
    fee: 'Tarifa de Red',
    savings: 'Ahorro estimado vs Tradicional',
    status: 'Estado',
    txHash: 'Hash de Transacción',
    date: 'Fecha',
    explorer: 'Ver en Celo Explorer',
    success: '✅ Transacción Exitosa',
    pending: '⏳ Transacción Pendiente',
    failed: '❌ Transacción Fallida',
  },
  pt: {
    title: 'Recibo de Transação RonPay',
    from: 'De',
    to: 'Para',
    amount: 'Valor',
    fee: 'Taxa de Rede',
    savings: 'Economia estimada vs Tradicional',
    status: 'Status',
    txHash: 'Hash da Transação',
    date: 'Data',
    explorer: 'Ver no Celo Explorer',
    success: '✅ Transação Bem-sucedida',
    pending: '⏳ Transação Pendente',
    failed: '❌ Transação Falhou',
  },
  fr: {
    title: 'Reçu de Transaction RonPay',
    from: 'De',
    to: 'À',
    amount: 'Montant',
    fee: 'Frais de Réseau',
    savings: 'Économies estimées vs Traditionnel',
    status: 'Statut',
    txHash: 'Hash de Transaction',
    date: 'Date',
    explorer: 'Voir sur Celo Explorer',
    success: '✅ Transaction Réussie',
    pending: '⏳ Transaction En Attente',
    failed: '❌ Transaction Échouée',
  },
};

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly feesService: FeesService,
  ) {}

  /**
   * Generate a formatted receipt for a transaction
   */
  async generateReceipt(
    txHash: string,
    language: 'en' | 'es' | 'pt' | 'fr' = 'en',
  ): Promise<TransactionReceipt> {
    const tx = await this.transactionsService.findByTxHash(txHash);

    if (!tx) {
      throw new NotFoundException(`Transaction ${txHash} not found`);
    }

    const explorerUrl = `https://celoscan.io/tx/${tx.txHash}`;

    // Estimate network fee (~0.001 CELO for standard transfers)
    const fee = '~0.001 CELO';

    // Calculate savings vs traditional transfer
    const estimatedSavings = await this.calculateSavings(
      tx.amount,
      tx.currency,
    );

    const msgs = RECEIPT_MESSAGES[language] || RECEIPT_MESSAGES.en;

    // Generate formatted text receipts in all supported languages
    const formatted: Record<string, string> = {};
    for (const [lang, langMsgs] of Object.entries(RECEIPT_MESSAGES)) {
      const statusIcon =
        tx.status === 'success' || tx.status === 'success_delivered'
          ? langMsgs.success
          : tx.status === 'pending'
            ? langMsgs.pending
            : langMsgs.failed;

      formatted[lang] = [
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `  ${langMsgs.title}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `${statusIcon}`,
        ``,
        `${langMsgs.from}: ${tx.fromAddress}`,
        `${langMsgs.to}: ${tx.toAddress}`,
        `${langMsgs.amount}: ${tx.amount} ${tx.currency}`,
        `${langMsgs.fee}: ${fee}`,
        `${langMsgs.savings}: ${estimatedSavings}`,
        ``,
        `${langMsgs.date}: ${tx.createdAt.toISOString()}`,
        `${langMsgs.txHash}: ${tx.txHash}`,
        `${langMsgs.explorer}: ${explorerUrl}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ].join('\n');
    }

    // Summary line for the requested language
    const statusText =
      tx.status === 'success' || tx.status === 'success_delivered'
        ? msgs.success
        : tx.status === 'pending'
          ? msgs.pending
          : msgs.failed;

    return {
      receiptId: tx.id,
      timestamp: tx.createdAt.toISOString(),
      from: tx.fromAddress,
      to: tx.toAddress,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      type: tx.type,
      txHash: tx.txHash,
      explorerUrl,
      fee,
      estimatedSavings,
      memo: tx.memo || null,
      metadata: tx.metadata,
      formatted: {
        text: formatted,
        summary: `${statusText} — ${tx.amount} ${tx.currency}`,
      },
    };
  }

  /**
   * Calculate estimated savings vs traditional remittance
   */
  private async calculateSavings(
    amount: number,
    currency: string,
  ): Promise<string> {
    try {
      // Traditional remittance fee is typically 5-7% for Africa
      const traditionalFeePercent = 0.06; // 6% average
      const ronpayFeePercent = 0.005; // 0.5% RonPay fee

      const traditionalFee = amount * traditionalFeePercent;
      const ronpayFee = amount * ronpayFeePercent;
      const savings = traditionalFee - ronpayFee;

      if (savings <= 0) return '$0.00';

      return `~$${savings.toFixed(2)} (${((traditionalFeePercent - ronpayFeePercent) * 100).toFixed(1)}% less)`;
    } catch (error) {
      this.logger.debug(`Could not calculate savings: ${error.message}`);
      return 'N/A';
    }
  }
}
