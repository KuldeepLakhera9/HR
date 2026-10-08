import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecentLogs() {
    return [
      {
        id: 'aud-1',
        actorName: 'Vikram Aditya',
        action: 'ROLE_ASSIGNED',
        target: 'Priya Nair -> Engineering Lead',
        timestamp: '10 mins ago',
        type: 'system',
      },
      {
        id: 'aud-2',
        actorName: 'Ananya Sharma',
        action: 'BRANCH_CREATED',
        target: 'Delhi NCR Hub',
        timestamp: '1 hour ago',
        type: 'org',
      },
      {
        id: 'aud-3',
        actorName: 'Rajesh Kumar',
        action: 'VISIT_APPROVED',
        target: 'Priya Nair (Hyderabad)',
        timestamp: '3 hours ago',
        type: 'attendance',
      },
      {
        id: 'aud-4',
        actorName: 'System',
        action: 'BACKUP_COMPLETED',
        target: 'PostgreSQL Daily Snapshot',
        timestamp: '5 hours ago',
        type: 'system',
      },
    ];
  }
}

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @ApiOperation({ summary: 'Retrieve immutable organization audit log records' })
  async getLogs() {
    const data = await this.auditService.getRecentLogs();
    return {
      message: 'Audit logs retrieved',
      data,
    };
  }
}

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
