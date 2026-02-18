import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { NellobytesService } from '../src/nellobytes/nellobytes.service';
import { Logger } from '@nestjs/common';

async function debugBuyAirtime() {
  const logger = new Logger('DebugBuyAirtime');
  
  // Create application context
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const nellobytesService = app.get(NellobytesService);
    
    // Test data
    const testData = {
      mobile_number: '09046144400', // Airtel number provided by user
      amount: 100, // Minimum amount for testing
      mobile_network: '', // Let the service auto-detect or fail if needed
    };

    logger.log(`Starting airtime purchase debug for: ${JSON.stringify(testData)}`);

    // Attempt purchase
    const result = await nellobytesService.buyAirtime(testData);

    logger.log('--- PURCHASE RESULT ---');
    console.log(JSON.stringify(result, null, 2));

    if (result && (result.status === 'ORDER_COMPLETED' || result.status === 'ORDER_RECEIVED')) {
        logger.log('✅ SUCCESS: Airtime purchase initiated successfully.');
    } else {
        logger.error('❌ FAILED: Airtime purchase did not complete as expected.');
        // If it failed due to missing network, we might need to be explicit.
        // But the service logic should handle detection for 0904 prefix if configured.
    }

  } catch (error) {
    logger.error('❌ ERROR OCCURRED:');
    if (error.response) {
       console.error(JSON.stringify(error.response.data, null, 2));
    } else {
       console.error(error);
    }
  } finally {
    await app.close();
  }
}

debugBuyAirtime();
