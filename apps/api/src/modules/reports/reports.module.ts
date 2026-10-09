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
  ) {}

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
  imports: [AttendanceModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
