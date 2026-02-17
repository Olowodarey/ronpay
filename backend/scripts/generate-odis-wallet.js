#!/usr/bin/env node

const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log('\n🔑 ODIS Backend Wallet Generated:\n');
console.log('ODIS_PRIVATE_KEY=' + privateKey);
console.log('ODIS_ACCOUNT_ADDRESS=' + account.address);
console.log('\n⚠️  IMPORTANT:');
console.log('1. Add these to your .env file');
console.log('2. Fund this address with ≥0.01 cUSD for ODIS quota');
console.log('3. Keep the private key SECRET — never commit to git\n');
