import { PaymentsService } from '../src/payments/payments.service';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

async function verifySwapAndSend() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();

  const paymentsService = moduleFixture.get<PaymentsService>(PaymentsService);

  const senderAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // Vitalik (Mock)
  const recipientAddress = '0x868eBAfF16cF072CD4706Ad8d4c4a14fEdcD9860'; // Random Recipient

  const intent = {
    action: 'send_payment',
    amount: 1,
    currency: 'EURm',
    sourceCurrency: 'USDm',
    recipient: recipientAddress,
    confidence: 1,
  };

  console.log('--- Sending Test Payload ---');
  console.log(JSON.stringify(intent, null, 2));

  try {
    // Calling the PUBLIC method parsePaymentIntentDirect instead of private buildTransferResponse
    // unique id is just for logging/tracking
    const result = await paymentsService.parsePaymentIntentDirect(intent as any, senderAddress);
    
    console.log('\n--- Service Response ---');
    console.log(JSON.stringify(result, null, 2));

    if (result.actionRequired === 'SWAP_THEN_SEND' || result.actionRequired === 'APPROVE_REQUIRED') {
        console.log('\n✅ SUCCESS: Correct action returned.');
    } else {
        console.error(`\n❌ FAILED: Expected SWAP_THEN_SEND or APPROVE_REQUIRED, got ${result.actionRequired}`);
        process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

verifySwapAndSend();
