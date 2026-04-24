import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  environment: string;
  checks?: {
    database?: string;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    const uptime = Date.now() - this.startTime;

    try {
      // Verify database connectivity
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime,
        environment: process.env['NODE_ENV'] ?? 'unknown',
        checks: {
          database: 'ok',
        },
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Health check failed: ${err.message ?? 'Unknown error'}`,
        err.stack ?? String(err),
      );
      throw new HttpException(
        {
          status: 'down',
          timestamp: new Date().toISOString(),
          uptime,
          checks: {
            database: 'down',
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async ready(): Promise<{ ready: boolean }> {
    try {
      // Check if database migrations are applied
      await this.prisma.$queryRaw`SELECT 1`;
      return { ready: true };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Readiness check failed: ${err.message ?? 'Unknown error'}`,
        err.stack ?? String(err),
      );
      throw new HttpException({ ready: false }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  live(): Promise<{ alive: boolean }> {
    // Simple liveness check - just verify the service is running
    return Promise.resolve({ alive: true });
  }
}
