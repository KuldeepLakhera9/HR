import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Injectable,
  Module,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { AttendanceModule } from '../attendance/attendance.module';
import { AttendanceReportingService } from '../attendance/attendance-reporting.service';
import { DailyAttendanceReportQueryDto } from '../attendance/dto/daily-attendance-report-query.dto';
import { MonthlyAttendanceReportQueryDto } from '../attendance/dto/monthly-attendance-report-query.dto';
import { EmployeesModule } from '../employees/employees.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PayrollReportQueryDto } from './dto/payroll-analytics-query.dto';
import { PayrollAnalyticsService } from './services/payroll-analytics.service';
import { ExecutiveDashboardQueryDto } from './dto/executive-dashboard-query.dto';
import { ExecutiveDashboardService } from './services/executive-dashboard.service';
import {
  WorkforceHeadcountQueryDto,
  WorkforceMovementQueryDto,
  WorkforceTrendsQueryDto,
} from './dto/workforce-analytics-query.dto';
import { WorkforceAnalyticsService } from './services/workforce-analytics.service';
import {
  WeeklyAttendanceReportQueryDto,
  AttendanceExceptionsReportQueryDto,
} from './dto/attendance-analytics-query.dto';
import { AttendanceAnalyticsService } from './services/attendance-analytics.service';
import { RequestAnalyticsQueryDto } from './dto/request-analytics-query.dto';
import { RequestAnalyticsService } from './services/request-analytics.service';
import { PerformanceAnalyticsQueryDto } from './dto/performance-analytics-query.dto';
import { PerformanceAnalyticsService } from './services/performance-analytics.service';
import {
  CreateSavedReportDefinitionDto,
  QuerySavedReportsDto,
  QueryReportCatalogDto,
} from './dto/mis-library.dto';
import { MisReportLibraryService } from './services/mis-report-library.service';
import { ExportReportQueryDto } from './dto/report-export-query.dto';
import { ReportExportService } from './services/report-export.service';
import { QueryReconciliationDto } from './dto/report-reconciliation.dto';
import { ReportReconciliationService } from './services/report-reconciliation.service';

@Injectable()
export class ReportsService {
  async getMISSummary() {
    return {
      monthlyAttendanceRate: 94.6,
      averageWorkingHours: 8.4,
      onTimeArrivalRate: 91.2,
      attritionRateAnnualized: 4.1,
    };
  }
}

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly attendanceReportingService: AttendanceReportingService,
    private readonly executiveDashboardService: ExecutiveDashboardService,
    private readonly workforceAnalyticsService: WorkforceAnalyticsService,
    private readonly attendanceAnalyticsService: AttendanceAnalyticsService,
    private readonly requestAnalyticsService: RequestAnalyticsService,
    private readonly performanceAnalyticsService: PerformanceAnalyticsService,
    private readonly misReportLibraryService: MisReportLibraryService,
    private readonly reportExportService: ReportExportService,
    private readonly reportReconciliationService: ReportReconciliationService,
    private readonly payrollAnalyticsService: PayrollAnalyticsService,
  ) {}

  @Get('executive/dashboard')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get unified executive workforce dashboard metrics and distributions' })
  async getExecutiveDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExecutiveDashboardQueryDto,
  ) {
    const data = await this.executiveDashboardService.getDashboardSummary(user, query);
    return {
      message: 'Executive dashboard metrics retrieved successfully',
      data,
    };
  }

  @Get('workforce/headcount')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get multi-dimensional headcount snapshot report' })
  async getWorkforceHeadcount(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkforceHeadcountQueryDto,
  ) {
    const data = await this.workforceAnalyticsService.getHeadcountReport(user, query);
    return {
      message: 'Workforce headcount report retrieved successfully',
      data,
    };
  }

  @Get('workforce/movement')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get workforce joiners, exits, and attrition movement report' })
  async getWorkforceMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkforceMovementQueryDto,
  ) {
    const data = await this.workforceAnalyticsService.getMovementReport(user, query);
    return {
      message: 'Workforce movement report retrieved successfully',
      data,
    };
  }

  @Get('workforce/trends')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get monthly workforce growth and attrition trends' })
  async getWorkforceTrends(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkforceTrendsQueryDto,
  ) {
    const data = await this.workforceAnalyticsService.getTrendsReport(user, query);
    return {
      message: 'Workforce trends report retrieved successfully',
      data,
    };
  }

  @Get('summary')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get management information system (MIS) report summary' })
  async getSummary() {
    const data = await this.reportsService.getMISSummary();
    return {
      message: 'MIS report summary retrieved',
      data,
    };
  }

  @Get('attendance/daily')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Get daily attendance report with working-hour summaries and mode indicators',
  })
  async getDailyAttendanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DailyAttendanceReportQueryDto,
  ) {
    return this.attendanceAnalyticsService.getDailyReport(user, query);
  }

  @Get('attendance/weekly')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Get weekly attendance matrix, day-of-week breakdown and shift performance',
  })
  async getWeeklyAttendanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WeeklyAttendanceReportQueryDto,
  ) {
    const data = await this.attendanceAnalyticsService.getWeeklyReport(user, query);
    return {
      message: 'Weekly attendance report retrieved successfully',
      data,
    };
  }

  @Get('attendance/monthly')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Get monthly attendance report with employee rollups and shift metrics',
  })
  async getMonthlyAttendanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthlyAttendanceReportQueryDto,
  ) {
    return this.attendanceAnalyticsService.getMonthlyReport(user, query);
  }

  @Get('attendance/exceptions')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary:
      'Get attendance exception reports (late arrivals, missing checkout, geofence, incomplete)',
  })
  async getAttendanceExceptionsReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceExceptionsReportQueryDto,
  ) {
    const data = await this.attendanceAnalyticsService.getExceptionsReport(user, query);
    return {
      message: 'Attendance exceptions report retrieved successfully',
      data,
    };
  }

  @Get('requests/utilization')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Get leave utilization by type, chargeable vs calendar days, and balance summaries',
  })
  async getLeaveUtilizationReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RequestAnalyticsQueryDto,
  ) {
    const data = await this.requestAnalyticsService.getLeaveUtilizationReport(user, query);
    return {
      message: 'Leave utilization report retrieved successfully',
      data,
    };
  }

  @Get('requests/volumes')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Get unified request volumes, outcomes, WFH, and official-visit metrics',
  })
  async getRequestVolumesReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RequestAnalyticsQueryDto,
  ) {
    const data = await this.requestAnalyticsService.getRequestVolumesReport(user, query);
    return {
      message: 'Request volumes and outcomes report retrieved successfully',
      data,
    };
  }

  @Get('requests/turnaround')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Get pending request aging and approval turnaround time performance metrics',
  })
  async getApprovalTurnaroundReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RequestAnalyticsQueryDto,
  ) {
    const data = await this.requestAnalyticsService.getApprovalTurnaroundReport(user, query);
    return {
      message: 'Approval turnaround report retrieved successfully',
      data,
    };
  }

  @Get('performance/overview')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary:
      'Get performance review cycle participation, completion, assessment stages and rating distributions',
  })
  async getPerformanceOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PerformanceAnalyticsQueryDto,
  ) {
    const data = await this.performanceAnalyticsService.getPerformanceOverviewReport(user, query);
    return {
      message: 'Performance review analytics overview retrieved successfully',
      data,
    };
  }

  @Get('performance/goals')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Get goal progress, completion rates, category rollups, and lagging goals',
  })
  async getGoalProgressReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PerformanceAnalyticsQueryDto,
  ) {
    const data = await this.performanceAnalyticsService.getGoalProgressReport(user, query);
    return {
      message: 'Goal progress analytics retrieved successfully',
      data,
    };
  }

  @Get('performance/development-plans')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary:
      'Get employee development plan execution progress, completion rate, and overdue actions',
  })
  async getDevelopmentPlanReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PerformanceAnalyticsQueryDto,
  ) {
    const data = await this.performanceAnalyticsService.getDevelopmentPlanReport(user, query);
    return {
      message: 'Development plan analytics retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // Phase 11.10: Enterprise Payroll Management & Analytics Endpoints
  // ---------------------------------------------------------------------------

  @Get('payroll/summary')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Get payroll summary report with gross-to-net reconciliation and status rollups',
  })
  async getPayrollSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollReportQueryDto,
  ) {
    const data = await this.payrollAnalyticsService.getPayrollSummaryReport(user, query);
    return {
      message: 'Payroll summary report retrieved successfully',
      data,
    };
  }

  @Get('payroll/cost-center')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get department and branch payroll cost center allocations' })
  async getPayrollCostCenters(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollReportQueryDto,
  ) {
    const data = await this.payrollAnalyticsService.getCostCenterReport(user, query);
    return {
      message: 'Payroll cost center report retrieved successfully',
      data,
    };
  }

  @Get('payroll/register')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Get confidential employee-level payroll register (strictly authorized)',
  })
  async getPayrollRegister(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollReportQueryDto,
  ) {
    const data = await this.payrollAnalyticsService.getPayrollRegisterReport(user, query);
    return {
      message: 'Payroll register report retrieved successfully',
      data,
    };
  }

  @Get('payroll/earnings-deductions')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get itemized earnings and deductions component breakdown' })
  async getPayrollEarningsDeductions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollReportQueryDto,
  ) {
    const data = await this.payrollAnalyticsService.getEarningsDeductionsReport(user, query);
    return {
      message: 'Payroll earnings and deductions report retrieved successfully',
      data,
    };
  }

  @Get('payroll/exceptions')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get payroll calculation exceptions and diagnostics' })
  async getPayrollExceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollReportQueryDto,
  ) {
    const data = await this.payrollAnalyticsService.getPayrollExceptionsReport(user, query);
    return {
      message: 'Payroll exceptions report retrieved successfully',
      data,
    };
  }

  @Get('payroll/period-comparison')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get period-over-period payroll variance and movement comparison' })
  async getPayrollPeriodComparison(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollReportQueryDto,
  ) {
    const data = await this.payrollAnalyticsService.getPeriodComparisonReport(user, query);
    return {
      message: 'Payroll period comparison report retrieved successfully',
      data,
    };
  }

  @Get('payroll/adjustments')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get payroll manual adjustments and offsets report' })
  async getPayrollAdjustments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollReportQueryDto,
  ) {
    const data = await this.payrollAnalyticsService.getPayrollAdjustmentsReport(user, query);
    return {
      message: 'Payroll adjustments report retrieved successfully',
      data,
    };
  }

  @Get('payroll/approval-history')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get payroll workflow approval and finalization audit trail' })
  async getPayrollApprovalHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollReportQueryDto,
  ) {
    const data = await this.payrollAnalyticsService.getApprovalHistoryReport(user, query);
    return {
      message: 'Payroll approval history report retrieved successfully',
      data,
    };
  }

  @Get('payroll/payment-reconciliation')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get payment disbursement settlement and bank reconciliation report' })
  async getPayrollPaymentReconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollReportQueryDto,
  ) {
    const data = await this.payrollAnalyticsService.getPaymentReconciliationReport(user, query);
    return {
      message: 'Payment reconciliation report retrieved successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // Centralized MIS Report Library Endpoints
  // ---------------------------------------------------------------------------

  @Get('library/catalog')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary:
      'Discover authorized report catalog across Workforce, Attendance, Requests, and Performance',
  })
  async getReportCatalog(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryReportCatalogDto,
  ) {
    const data = await this.misReportLibraryService.getCatalog(user, query);
    return {
      message: 'Report catalog retrieved successfully',
      data,
    };
  }

  @Get('library/saved')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'List user saved report definitions for current organization' })
  async getSavedReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuerySavedReportsDto,
  ) {
    const data = await this.misReportLibraryService.getSavedReports(user, query);
    return {
      message: 'Saved report definitions retrieved successfully',
      data,
    };
  }

  @Post('library/saved')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Save a customized safe parameterized report definition' })
  async createSavedReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavedReportDefinitionDto,
  ) {
    const data = await this.misReportLibraryService.createSavedReport(user, dto);
    return {
      message: 'Report definition saved successfully',
      data,
    };
  }

  @Delete('library/saved/:id')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Delete a saved report definition' })
  async deleteSavedReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.misReportLibraryService.deleteSavedReport(user, id);
    return {
      message: 'Saved report definition deleted successfully',
      data,
    };
  }

  @Post('library/saved/:id/execute')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary: 'Execute a saved report definition with real-time permission and scope re-evaluation',
  })
  async executeSavedReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.misReportLibraryService.executeSavedReport(user, id);
    return {
      message: 'Saved report executed successfully',
      data,
    };
  }

  // ---------------------------------------------------------------------------
  // Secure Report Export Endpoints
  // ---------------------------------------------------------------------------

  @Get('export/csv')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary:
      'Export authorized MIS report to sanitized CSV with formula injection protection and RBAC scope',
  })
  async exportReportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExportReportQueryDto,
    @Res() res: Response,
  ) {
    const { filename, csv, contentType } = await this.reportExportService.exportReportCsv(
      user,
      query,
    );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
    });

    return res.status(200).send(csv);
  }

  // ---------------------------------------------------------------------------
  // Data Quality & Report Reconciliation Endpoints
  // ---------------------------------------------------------------------------

  @Get('reconciliation/audit')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({
    summary:
      'Run comprehensive reporting data-quality checks and reconcile derived reports against source records',
  })
  async getReconciliationAudit(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryReconciliationDto,
  ) {
    const data = await this.reportReconciliationService.runDataQualityChecks(user, query);
    return {
      message: 'Reporting data reconciliation audit completed successfully',
      data,
    };
  }
}

@Module({
  imports: [AttendanceModule, EmployeesModule, AuditModule, PrismaModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ExecutiveDashboardService,
    WorkforceAnalyticsService,
    AttendanceAnalyticsService,
    RequestAnalyticsService,
    PerformanceAnalyticsService,
    MisReportLibraryService,
    ReportExportService,
    ReportReconciliationService,
    PayrollAnalyticsService,
  ],
  exports: [
    ReportsService,
    ExecutiveDashboardService,
    WorkforceAnalyticsService,
    AttendanceAnalyticsService,
    RequestAnalyticsService,
    PerformanceAnalyticsService,
    MisReportLibraryService,
    ReportExportService,
    ReportReconciliationService,
    PayrollAnalyticsService,
  ],
})
export class ReportsModule {}
