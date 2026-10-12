import { Controller, Get, Injectable, Module, Query, UseGuards } from '@nestjs/common';
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
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ExecutiveDashboardQueryDto } from './dto/executive-dashboard-query.dto';
import { ExecutiveDashboardService } from './services/executive-dashboard.service';
import {
  WorkforceHeadcountQueryDto,
  WorkforceMovementQueryDto,
  WorkforceTrendsQueryDto,
} from './dto/workforce-analytics-query.dto';
import { WorkforceAnalyticsService } from './services/workforce-analytics.service';

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
  @ApiOperation({ summary: 'Get daily attendance report with working-hour summaries' })
  async getDailyAttendanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DailyAttendanceReportQueryDto,
  ) {
    return this.attendanceReportingService.getDailyReport(user.organizationId, query);
  }

  @Get('attendance/monthly')
  @RequirePermissions('REPORT_VIEW')
  @ApiOperation({ summary: 'Get monthly attendance report with employee rollups' })
  async getMonthlyAttendanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthlyAttendanceReportQueryDto,
  ) {
    return this.attendanceReportingService.getMonthlyReport(user.organizationId, query);
  }
}

@Module({
  imports: [AttendanceModule, EmployeesModule, PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService, ExecutiveDashboardService, WorkforceAnalyticsService],
  exports: [ReportsService, ExecutiveDashboardService, WorkforceAnalyticsService],
})
export class ReportsModule {}
