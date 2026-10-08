import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SystemHealth } from '@hrms/types';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async checkHealth(): Promise<SystemHealth> {
    const startTime = Date.now();
    let dbStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';
    let dbLatency = 0;
    let dbMessage: string | undefined = undefined;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - startTime;
      dbStatus = 'connected';
    } catch (err: unknown) {
      dbStatus = 'disconnected';
      dbMessage = err instanceof Error ? err.message : 'Database ping failed';
    }

    const isHealthy = dbStatus === 'connected';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: {
          status: dbStatus,
          latencyMs: dbLatency,
          message: dbMessage,
        },
        api: {
          status: 'healthy',
        },
      },
    };
  }
}
