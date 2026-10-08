import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

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
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('balances')
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
