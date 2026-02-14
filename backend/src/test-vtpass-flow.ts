import axios from 'axios';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '../.env') });

const API_BASE_URL = 'http://localhost:3001';

async function testVtpassFlow() {
  console.log('🚀 Starting VTpass Implementation Verification...');

  try {
    // 1. Test Direct Intent Parsing (Bypassing AI)
    console.log('\nStep 1: Parsing intent directly...');
    const parseResponse = await axios.post(`${API_BASE_URL}/payments/parse-intent-direct`, {
      intent: {
        action: 'buy_airtime',
        recipient: '08012345678',
        amount: 100,
        currency: 'NGNm',
        biller: 'MTN',
        confidence: 0.95
      },
      senderAddress: '0x1234567890123456789012345678901234567890'
    });

    console.log('✅ Intent Parsed Successfully');
    console.log('Unsigned Transaction:', JSON.stringify(parseResponse.data.transaction, null, 2));
    console.log('Service Metadata:', JSON.stringify(parseResponse.data.meta, null, 2));

    const txHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
    console.log(`\nStep 2: Simulating blockchain transaction confirmation (TxHash: ${txHash})...`);

    // 2. Test Record Transaction & Trigger VTPASS
    // This simulates MiniPay recording the transaction after signing
    const recordResponse = await axios.post(`${API_BASE_URL}/payments/execute`, {
      txHash: txHash,
      fromAddress: '0x1234567890123456789012345678901234567890',
      toAddress: process.env.RONPAY_TREASURY_ADDRESS || '0x40fc14c7717758371306917618D588147775ce45',
      amount: parseResponse.data.parsedCommand.amount.toString(),
      currency: 'cUSD',
      intent: 'Buy 100 NGN MTN airtime',
      metadata: {
        ...parseResponse.data.meta,
        recipient: '08012345678'
      },
      serviceId: parseResponse.data.meta.serviceType === 'buy_airtime' ? 'airtime-mtn' : 'unknown'
    });

    console.log('✅ Transaction Recorded Successfully');
    console.log('Response Message:', recordResponse.data.message);

    // 3. Test Direct Airtime Purchase Trigger
    console.log('\nStep 3: Triggering airtime purchase (Direct Endpoint)...');
    const purchaseResponse = await axios.post(`${API_BASE_URL}/payments/purchase-airtime`, {
      txHash: txHash,
      phoneNumber: '08012345678',
      amount: 100,
      provider: 'MTN',
      walletAddress: '0x1234567890123456789012345678901234567890'
    });

    console.log('✅ Airtime Purchase Triggered');
    console.log('Status:', purchaseResponse.data.status);
    console.log('Message:', purchaseResponse.data.message);
    if (purchaseResponse.data.fullResponse) {
       console.log('VTPass Response Code:', purchaseResponse.data.fullResponse.code);
    }

    console.log('\n🎉 VTpass Implementation Verification Completed Successfully!');
  } catch (error) {
    console.error('\n❌ Verification Failed:');
    if (axios.isAxiosError(error)) {
      console.error('Status:', error.response?.status);
      console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

testVtpassFlow();
