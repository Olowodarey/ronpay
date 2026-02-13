import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: boolean;
    redis?: boolean;
  };
  version: string;
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async check(): Promise<HealthCheckResult> {
    const checks = {
      database: await this.checkDatabase(),
      redis: true, // Redis check can be added if needed
    };

    const allHealthy = Object.values(checks).every((check) => check === true);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  @Get('ready')
  async ready(): Promise<{ ready: boolean }> {
    // Check if app is ready to accept traffic
    const dbReady = await this.checkDatabase();
    return { ready: dbReady };
  }

  @Get('live')
  live(): { alive: boolean } {
    // Simple liveness check
    return { alive: true };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.connection.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}
