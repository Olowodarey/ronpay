import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as Sentry from '@sentry/node';

import { AppModule } from './app.module';
import { WinstonLoggerAdapter } from './common/winston.adapter';

async function bootstrap() {
  // Initialize Sentry for error tracking (production only)
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    const integrations: any[] = [];
    try {
      const { nodeProfilingIntegration } = await import('@sentry/profiling-node');
      integrations.push(nodeProfilingIntegration());
    } catch (error) {
      new WinstonLoggerAdapter().warn('Failed to load Sentry profiling integration', 'Bootstrap');
    }

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      integrations,
      tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
      profilesSampleRate: 0.1,
    });
    // We can still use the raw logger here locally if we import it, OR use the adapter.
    // Since I removed the import of 'logger', I need to re-add it OR use the adapter.
    // Let's use the adapter.
    new WinstonLoggerAdapter().log('Sentry error tracking initialized', 'Bootstrap');
  }

  /*
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });
  */
  // Use buffer logs to ensure we don't lose startup logs before adapter is set,
  // OR just pass the adapter directly if possible, but NestFactory.create doesn't accept class instance easily in options if it needs DI.
  // Actually, we can just instantiate it manually.

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(new WinstonLoggerAdapter());

  const allowedOrigins: (string | RegExp)[] = [
    'http://localhost:3000',
    'https://ronpay.xyz',
    'https://www.ronpay.xyz',
    'https://ronpay.app',
    'https://www.ronpay.app',
    'https://ronpay.vercel.app',
  ];

  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push(
      /\.ngrok-free\.dev$/,
      /\.ngrok\.io$/,
    );
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);

  const winstonLogger = new WinstonLoggerAdapter();
  winstonLogger.log(`RonPay backend running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error) => {
  new WinstonLoggerAdapter().error('Failed to start application', error.stack, 'Bootstrap');
  process.exit(1);
});


