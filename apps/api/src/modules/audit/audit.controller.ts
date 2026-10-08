import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('AUDIT_VIEW')
  @ApiBearerAuth()
  @Get('logs')
  @ApiOperation({ summary: 'Retrieve immutable organization audit log records' })
  @ApiResponse({
    status: 200,
    description: 'Audit log records returned without sensitive credentials',
  })
  async getLogs(@CurrentUser() user: AuthenticatedUser, @Query('limit') limitStr?: string) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const data = await this.auditService.getRecentLogs(user.organizationId, limit);
    return {
      message: 'Audit logs retrieved',
      data,
    };
  }
}
