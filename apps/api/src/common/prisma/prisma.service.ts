import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    // Monitor slow database queries (> 200ms) for observability
    (this as any).$on?.('query', (e: { query: string; duration: number }) => {
      if (e.duration >= 200) {
        this.logger.warn(`Slow query detected (${e.duration}ms): ${e.query.slice(0, 150)}...`);
      }
    });

    try {
      await this.$connect();
      this.logger.log('Database connection initialized successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Database connection failed during boot: ${msg}. Running in decoupled mode.`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
