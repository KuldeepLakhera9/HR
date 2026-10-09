import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Module,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { BreakDto } from './dto/break.dto';
import { RecalculateAttendanceDto } from './dto/recalculate-attendance.dto';
import { SubmitCorrectionRequestDto } from './dto/correction-request.dto';
import { AttendanceOperationsQueryDto } from './dto/attendance-operations-query.dto';
import { DecideCorrectionRequestDto } from './dto/decide-correction.dto';
import { EmployeesModule } from '../employees/employees.module';
import {
  OfficeLocationsController,
  OfficeLocationsAliasController,
} from './office-locations.controller';
import { OfficeLocationsService } from './office-locations.service';
import {
  AttendancePoliciesController,
  AttendanceShiftsController,
} from './attendance-policies.controller';
import { AttendancePoliciesService } from './attendance-policies.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  @RequirePermissions('ATTENDANCE_MARK')
  @ApiOperation({
    summary:
      'Office check-in with GPS geofence verification, shift calculation & atomic session creation',
  })
  async checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckInDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.attendanceService.checkIn(user, dto, ipAddress, userAgent);
  }

  @Post('check-out')
  @RequirePermissions('ATTENDANCE_MARK')
  @ApiOperation({
    summary:
      'Office check-out, break auto-conclusion, gross/net work time calculation & daily summary update',
  })
  async checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckOutDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.attendanceService.checkOut(user, dto, ipAddress, userAgent);
  }

  @Post('break/start')
  @RequirePermissions('ATTENDANCE_MARK')
  @ApiOperation({
    summary: 'Start an active break within the currently open attendance session',
  })
  async startBreak(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BreakDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.attendanceService.startBreak(user, dto, ipAddress, userAgent);
  }

  @Post('break/end')
  @RequirePermissions('ATTENDANCE_MARK')
  @ApiOperation({
    summary: 'End an active break and update total break minutes for the current session',
  })
  async endBreak(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BreakDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.attendanceService.endBreak(user, dto, ipAddress, userAgent);
  }

  @Post('reconcile-missing')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({
    summary:
      'Flag missing checkouts past cutoff hour, transition to AUTO_CLOSED, and record exceptions without fabricating checkout events',
  })
  async reconcileMissing(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.reconcileMissingCheckouts(user.organizationId);
  }

  @Post('recalculate')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({
    summary:
      'Deterministic recalculation and reconciliation of daily attendance summaries for an employee or organization',
  })
  async recalculate(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecalculateAttendanceDto) {
    return this.attendanceService.recalculateAttendance(user.organizationId, dto, user.id);
  }

  @Get('today')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get current user attendance status, active session, and policy rules for today',
  })
  async getToday(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getToday(user);
  }

  @Get('my-history')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get current employee attendance daily history and recent sessions',
  })
  async getMyHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getMyHistory(user);
  }

  @Post('correction-request')
  @RequirePermissions('ATTENDANCE_MARK')
  @ApiOperation({
    summary: 'Submit an attendance correction request for past or missed punches',
  })
  async submitCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitCorrectionRequestDto,
  ) {
    return this.attendanceService.submitCorrectionRequest(user, dto);
  }

  @Get('my-corrections')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get all correction requests submitted by current employee',
  })
  async getMyCorrections(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getMyCorrections(user);
  }

  @Get('operations/dashboard')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get organizational attendance operations dashboard metrics, headcount, and trend',
  })
  async getOperationsDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceOperationsQueryDto,
  ) {
    return this.attendanceService.getOperationsDashboard(user.organizationId, query);
  }

  @Get('operations/records')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get paginated employee attendance operations records with filters and search',
  })
  async getOperationsRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceOperationsQueryDto,
  ) {
    return this.attendanceService.getOperationsRecords(user, query);
  }

  @Get('operations/records/:employeeId')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get detailed employee attendance timeline, events, and exceptions for detail drawer',
  })
  async getOperationsEmployeeDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.getOperationsEmployeeDetail(user, employeeId, date);
  }

  @Get('operations/corrections')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get all organizational attendance correction requests for HR/Admin review',
  })
  async getOperationsCorrections(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.attendanceService.getOperationsCorrections(user.organizationId, status);
  }

  @Post('corrections/:requestId/decide')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({
    summary: 'Approves or rejects an attendance correction request (HR or reporting Manager)',
  })
  async decideCorrectionRequestGeneral(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: DecideCorrectionRequestDto,
  ) {
    return this.attendanceService.decideCorrectionRequest(user, requestId, dto);
  }

  // ===========================================================================
  // MANAGER TEAM ATTENDANCE ENDPOINTS
  // ===========================================================================

  @Get('manager/dashboard')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get manager team attendance summary, headcount, and pending corrections count',
  })
  async getManagerDashboard(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.attendanceService.getManagerTeamDashboard(user, date);
  }

  @Get('manager/records')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary:
      'Get scoped paginated attendance records strictly for manager team direct and indirect reports',
  })
  async getManagerRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceOperationsQueryDto,
  ) {
    return this.attendanceService.getManagerTeamRecords(user, query);
  }

  @Get('manager/corrections')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get pending attendance correction requests from manager team members',
  })
  async getManagerCorrections(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getManagerTeamCorrections(user);
  }

  @Post('manager/corrections/:requestId/decide')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({
    summary:
      'Manager approves or rejects an attendance correction request for their reporting employee',
  })
  async decideCorrectionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: DecideCorrectionRequestDto,
  ) {
    return this.attendanceService.decideCorrectionRequest(user, requestId, dto);
  }

  @Get('manager/records/:employeeId')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary:
      'Get employee attendance timeline with hierarchy validation strictly enforcing team reporting scope',
  })
  async getManagerEmployeeDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.getManagerEmployeeDetail(user, employeeId, date);
  }

  @Get('summary')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'Get current daily attendance summary across organization' })
  async getTodaySummary() {
    const data = await this.attendanceService.getTodaySummary();
    return {
      message: 'Attendance summary retrieved',
      data,
    };
  }

  @Get('policy')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get organization attendance mode policy (Office/Official Visit/WFH)',
  })
  async getAttendancePolicy() {
    const data = await this.attendanceService.getAttendancePolicy();
    return {
      message: 'Attendance policy retrieved',
      data,
    };
  }
}

@Module({
  imports: [EmployeesModule],
  controllers: [
    AttendanceController,
    OfficeLocationsController,
    OfficeLocationsAliasController,
    AttendancePoliciesController,
    AttendanceShiftsController,
  ],
  providers: [AttendanceService, OfficeLocationsService, AttendancePoliciesService],
  exports: [AttendanceService, OfficeLocationsService, AttendancePoliciesService],
})
export class AttendanceModule {}
