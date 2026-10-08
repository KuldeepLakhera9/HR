import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Injectable()
export class LeaveService {
  async getLeaveBalances() {
    return [
      { type: 'Casual Leave (CL)', available: 8, total: 12, used: 4 },
      { type: 'Sick / Medical Leave (SL)', available: 10, total: 10, used: 0 },
      { type: 'Privilege / Earned Leave (PL)', available: 14, total: 18, used: 4 },
    ];
  }
}

@ApiTags('Leave')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('balances')
  @RequirePermissions('LEAVE_VIEW')
  @ApiOperation({ summary: 'Get employee leave balances and entitlements' })
  async getLeaveBalances() {
    const data = await this.leaveService.getLeaveBalances();
    return {
      message: 'Leave balances retrieved',
      data,
    };
  }
}

@Module({
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
