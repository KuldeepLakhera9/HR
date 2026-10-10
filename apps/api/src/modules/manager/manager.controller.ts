import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ManagerService } from './manager.service';
import { ManagerReportsService } from './manager-reports.service';
import { ManagerAlertsService } from './manager-alerts.service';
import { ManagerAlertsQueryDto } from './dto/manager-alerts-query.dto';
import { ManagerDashboardQueryDto } from './dto/manager-dashboard-query.dto';
import { TeamDirectoryQueryDto } from './dto/team-directory-query.dto';
import { QueryUnifiedApprovalsDto } from './dto/unified-approvals-query.dto';
import {
  DecideUnifiedApprovalDto,
  CancelUnifiedApprovalDto,
} from './dto/decide-unified-approval.dto';
import {
  ManagerTeamAttendanceReportQueryDto,
  ManagerTeamExceptionReportQueryDto,
  ManagerTeamApprovalReportQueryDto,
  ManagerTeamAvailabilityReportQueryDto,
} from './dto/manager-reports-query.dto';

@ApiTags('Manager Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('manager')
export class ManagerController {
  constructor(
    private readonly managerService: ManagerService,
    private readonly managerReportsService: ManagerReportsService,
    private readonly managerAlertsService: ManagerAlertsService,
  ) {}

  @Get('dashboard/overview')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary:
      'Get authorized manager dashboard metrics, today presence roster, pending approvals breakdown, exceptions, and upcoming absences',
  })
  @ApiResponse({
    status: 200,
    description: 'Manager dashboard aggregated overview',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if caller lacks manager role or reporting scope',
  })
  async getDashboardOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ManagerDashboardQueryDto,
  ) {
    return this.managerService.getDashboardOverview(user, query);
  }

  @Get('team/directory')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @RequirePermissions('EMPLOYEE_VIEW')
  @ApiOperation({
    summary:
      'Get paginated and searchable team directory within the authorized reporting hierarchy with real-time availability',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated team directory with attendance availability',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if caller lacks manager role or reporting scope',
  })
  async getTeamDirectory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TeamDirectoryQueryDto,
  ) {
    return this.managerService.getTeamDirectory(user, query);
  }

  @Get('team/members/:id')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @RequirePermissions('EMPLOYEE_VIEW')
  @ApiOperation({
    summary: 'Get authorized detail view of a team member within manager reporting hierarchy scope',
  })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({
    status: 200,
    description: 'Authorized employee details, balances, and recent attendance',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if target employee is outside manager reporting hierarchy',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found if employee does not exist',
  })
  async getTeamMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.managerService.getTeamMember(user, id);
  }

  @Get('approvals')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @ApiOperation({
    summary:
      'Get unified pending approval requests inbox across Leave, WFH, and Official Visits within manager hierarchy',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of unified approval requests with status breakdown counters',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if caller lacks authorized manager or HR scope',
  })
  async getUnifiedApprovals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryUnifiedApprovalsDto,
  ) {
    return this.managerService.getUnifiedApprovals(user, query);
  }

  @Get('approvals/:type/:id')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @ApiOperation({
    summary: 'Get detailed item view for a Leave, WFH, or Official Visit request',
  })
  @ApiParam({ name: 'type', description: 'Request type: LEAVE | WFH | VISIT' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  @ApiResponse({
    status: 200,
    description: 'Detailed approval request with history and balances',
  })
  async getUnifiedApprovalDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.managerService.getUnifiedApprovalDetail(user, type, id);
  }

  @Post('approvals/decide')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'HR', 'MANAGER')
  @ApiOperation({
    summary:
      'Approve or reject a unified approval request (Leave, WFH, Visit) within manager hierarchy chain',
  })
  @ApiResponse({
    status: 200,
    description: 'Request decided successfully and balance/status posted idempotently',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error, missing rejection reason, or invalid request status',
  })
  @ApiResponse({
    status: 403,
    description: 'Self-approval forbidden or unauthorized hierarchy approver',
  })
  async decideUnifiedApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecideUnifiedApprovalDto,
  ) {
    return this.managerService.decideUnifiedApproval(user, dto);
  }

  @Post('approvals/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'HR', 'MANAGER')
  @ApiOperation({
    summary: 'Cancel an upcoming Leave, WFH, or Visit request with documented cancellation reason',
  })
  @ApiResponse({
    status: 200,
    description: 'Request cancelled successfully and balance reservation released',
  })
  async cancelUnifiedApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CancelUnifiedApprovalDto,
  ) {
    return this.managerService.cancelUnifiedApproval(user, dto);
  }

  @Get('reports/attendance')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary:
      'Get authorized manager team attendance report with server-side aggregations and optional CSV export',
  })
  @ApiResponse({
    status: 200,
    description: 'Scoped team attendance records and metrics or CSV export',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date boundaries or query parameters',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if caller lacks manager role or requests employee outside hierarchy',
  })
  async getTeamAttendanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ManagerTeamAttendanceReportQueryDto,
  ) {
    return this.managerReportsService.getTeamAttendanceReport(user, query);
  }

  @Get('reports/exceptions')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary:
      'Get authorized manager team attendance exceptions report with breakdowns and resolution tracking',
  })
  @ApiResponse({
    status: 200,
    description: 'Scoped team attendance exception events and aggregations or CSV export',
  })
  async getTeamExceptionReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ManagerTeamExceptionReportQueryDto,
  ) {
    return this.managerReportsService.getTeamExceptionReport(user, query);
  }

  @Get('reports/approvals')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @ApiOperation({
    summary: 'Get unified manager team approval decisions and turnaround time report',
  })
  @ApiResponse({
    status: 200,
    description: 'Scoped team approval activity records and aggregations or CSV export',
  })
  async getTeamApprovalReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ManagerTeamApprovalReportQueryDto,
  ) {
    return this.managerReportsService.getTeamApprovalReport(user, query);
  }

  @Get('reports/availability')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary:
      'Get manager team availability roster report, work mode breakdown, and scheduling rates',
  })
  @ApiResponse({
    status: 200,
    description: 'Scoped team availability metrics and roster or CSV export',
  })
  async getTeamAvailabilityReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ManagerTeamAvailabilityReportQueryDto,
  ) {
    return this.managerReportsService.getTeamAvailabilityReport(user, query);
  }

  @Get('alerts')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @ApiOperation({
    summary:
      'Get actionable alerts for the manager including pending approvals, attendance exceptions, and upcoming absences',
  })
  @ApiResponse({
    status: 200,
    description: 'List of actionable alerts with read/unread statuses and destination deep links',
  })
  async getAlerts(@CurrentUser() user: AuthenticatedUser, @Query() query: ManagerAlertsQueryDto) {
    return this.managerAlertsService.getManagerAlerts(user, query);
  }

  @Post('alerts/scan-upcoming')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger scan and notification of upcoming team absences for roster planning',
  })
  @ApiResponse({
    status: 200,
    description: 'Scan summary and count of alerted upcoming team absences',
  })
  async scanUpcomingAbsences(@CurrentUser() user: AuthenticatedUser) {
    return this.managerAlertsService.scanAndNotifyUpcomingAbsences(user);
  }
}
