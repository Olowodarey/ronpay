import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { McpModule } from '@rekog/mcp-nest';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { AiModule } from './ai/ai.module';
import { PaymentsModule } from './payments/payments.module';
import { TransactionsModule } from './transactions/transactions.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { FeesModule } from './fees/fees.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { A2aModule } from './a2a/a2a.module';
import { McpToolsProvider } from './mcp/mcp-tools.provider';
import { NellobytesModule } from './nellobytes/nellobytes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 30,
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: configService.get('NODE_ENV') !== 'production',
        extra: {
          max: 20,
          min: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl) {
          const url = new URL(redisUrl);

          const isTls = url.protocol === 'rediss:';
          return {
            redis: {
              host: url.hostname,
              port: Number(url.port),
              username: url.username,
              password: url.password,
              tls: isTls ? { rejectUnauthorized: false } : undefined,
            },
          };
        }
        return {
          redis: {
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
          },
        };
      },
      inject: [ConfigService],
    }),
    // MCP Server — exposes tools for AI agent integration
    McpModule.forRoot({
      name: 'ronpay-mcp',
      version: '1.0.0',
    }),
    BlockchainModule,
    AiModule,
    PaymentsModule,
    TransactionsModule,
    NellobytesModule,
    SchedulerModule,
    FeesModule,
    NotificationsModule,
    HealthModule,
    // A2A Protocol — agent discovery at /.well-known/agent.json
    A2aModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // MCP tools — delegates to existing services
    McpToolsProvider,
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

