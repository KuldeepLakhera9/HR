import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { DecideLeaveRequestDto } from './dto/decide-leave-request.dto';
import { CancelLeaveRequestDto } from './dto/cancel-leave-request.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { CalculateLeaveDaysDto } from './dto/calculate-leave-days.dto';
import { CreateHolidayDto, UpdateHolidayDto } from './dto/create-holiday.dto';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { CreateLeavePolicyDto, AssignLeavePolicyDto } from './dto/create-leave-policy.dto';
import { AdjustLeaveBalanceDto } from './dto/adjust-leave-balance.dto';

@ApiTags('Leave')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  // ===========================================================================
  // 1. Employee Leave Application & Inquiry
  // ===========================================================================

  @Post('apply')
  @RequirePermissions('LEAVE_APPLY')
  @ApiOperation({ summary: 'Submit an employee leave application' })
  async apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveService.apply(user, dto);
  }

  @Post('calculate')
  @RequirePermissions('LEAVE_VIEW')
  @ApiOperation({ summary: 'Pre-flight duration, holiday, and balance evaluation' })
  async calculatePreview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CalculateLeaveDaysDto,
  ) {
    return this.leaveService.calculatePreview(user, dto);
  }

  @Get('balances')
  @RequirePermissions('LEAVE_VIEW')
  @ApiOperation({ summary: 'Get leave balance accounts and entitlements' })
  async getBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId?: string,
    @Query('year') year?: string,
  ) {
    return this.leaveService.getLeaveBalances(
      user,
      employeeId,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @Get('requests')
  @RequirePermissions('LEAVE_VIEW')
  @ApiOperation({ summary: 'List and filter leave applications with role-based scoping' })
  async getRequests(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryLeaveRequestsDto) {
    return this.leaveService.getRequests(user, query);
  }

  @Get('requests/:id')
  @RequirePermissions('LEAVE_VIEW')
  @ApiOperation({ summary: 'Get single leave request details' })
  async getRequestById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leaveService.getRequestById(user, id);
  }

  @Get('manager/pending')
  @RequirePermissions('LEAVE_APPROVE')
  @ApiOperation({ summary: 'List pending leave applications for manager or HR review' })
  async getManagerPending(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryLeaveRequestsDto,
    @Query('escalatedOnly') escalatedOnly?: string,
  ) {
    return this.leaveService.getManagerPending(user, {
      ...query,
      escalatedOnly: escalatedOnly === 'true',
    });
  }

  @Get('overview')
  @RequirePermissions('LEAVE_VIEW')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @ApiOperation({ summary: 'Get aggregated leave analytics, pending counts and today leaves' })
  async getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.getLeaveOverview(user);
  }

  // ===========================================================================
  // 2. Approvals & Cancellations
  // ===========================================================================

  @Post('requests/:id/decide')
  @RequirePermissions('LEAVE_APPROVE')
  @ApiOperation({ summary: 'Approve or reject a submitted leave application' })
  async decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideLeaveRequestDto,
  ) {
    return this.leaveService.decide(user, id, dto);
  }

  @Post('requests/:id/cancel')
  @RequirePermissions('LEAVE_APPLY')
  @ApiOperation({ summary: 'Cancel a submitted or approved leave request' })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelLeaveRequestDto,
  ) {
    return this.leaveService.cancel(user, id, dto);
  }

  // ===========================================================================
  // 3. Holidays
  // ===========================================================================

  @Get('holidays')
  @RequirePermissions('LEAVE_VIEW')
  @ApiOperation({ summary: 'Get holiday calendar observances' })
  async getHolidays(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year') year?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.leaveService.getHolidays(
      user.organizationId,
      year ? parseInt(year, 10) : undefined,
      branchId,
    );
  }

  @Post('holidays')
  @RequirePermissions('SETTING_UPDATE')
  @ApiOperation({ summary: 'Create a new public or regional holiday' })
  async createHoliday(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateHolidayDto) {
    return this.leaveService.createHoliday(user, dto);
  }

  @Put('holidays/:id')
  @RequirePermissions('SETTING_UPDATE')
  @ApiOperation({ summary: 'Update a holiday entry' })
  async updateHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateHolidayDto,
  ) {
    return this.leaveService.updateHoliday(user, id, dto);
  }

  @Delete('holidays/:id')
  @RequirePermissions('SETTING_UPDATE')
  @ApiOperation({ summary: 'Delete a holiday entry' })
  async deleteHoliday(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leaveService.deleteHoliday(user, id);
  }

  // ===========================================================================
  // 4. Leave Types & Policy Admin
  // ===========================================================================

  @Get('types')
  @RequirePermissions('LEAVE_VIEW')
  @ApiOperation({ summary: 'Get configured leave types' })
  async getLeaveTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.getLeaveTypes(user.organizationId);
  }

  @Post('types')
  @RequirePermissions('SETTING_UPDATE')
  @ApiOperation({ summary: 'Create a new leave type' })
  async createLeaveType(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeaveTypeDto) {
    return this.leaveService.createLeaveType(user, dto);
  }

  @Get('policies')
  @RequirePermissions('LEAVE_VIEW')
  @ApiOperation({ summary: 'Get configured leave policies' })
  async getLeavePolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.getLeavePolicies(user.organizationId);
  }

  @Post('policies')
  @RequirePermissions('SETTING_UPDATE')
  @ApiOperation({ summary: 'Create a new leave policy' })
  async createLeavePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeavePolicyDto,
  ) {
    return this.leaveService.createLeavePolicy(user, dto);
  }

  @Post('policies/assign')
  @RequirePermissions('SETTING_UPDATE')
  @ApiOperation({ summary: 'Assign a leave policy to an employee' })
  async assignPolicy(@CurrentUser() user: AuthenticatedUser, @Body() dto: AssignLeavePolicyDto) {
    return this.leaveService.assignPolicy(user, dto);
  }

  @Post('balances/adjust')
  @RequirePermissions('SETTING_UPDATE')
  @ApiOperation({ summary: 'Record an audited manual balance adjustment' })
  async adjustBalance(@CurrentUser() user: AuthenticatedUser, @Body() dto: AdjustLeaveBalanceDto) {
    return this.leaveService.adjustBalance(user, dto);
  }
}
