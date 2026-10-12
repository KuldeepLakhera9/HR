import { Controller, Get, Query, UseGuards, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { PerformanceReportsService } from './performance-reports.service';
import { QueryHrPerformanceReportDto } from './dto/performance-reports.dto';

@ApiTags('Performance - Dashboards & Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('performance/dashboards')
export class PerformanceReportsController {
  constructor(private readonly service: PerformanceReportsService) {}

  @Get('employee')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get employee performance dashboard (goals, upcoming deadlines, finalized feedback, development plans)',
  })
  async getEmployeeDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getEmployeeDashboard(user);
  }

  @Get('manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get manager team performance dashboard (team goals, pending reviews, overdue items)',
  })
  async getManagerDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getManagerDashboard(user);
  }

  @Get('hr-admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get HR/Admin global performance dashboard with differential privacy guardrails',
  })
  async getHrAdminDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryHrPerformanceReportDto,
  ) {
    return this.service.getHrAdminDashboard(user, query);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export performance reviews MIS report as CSV with formula injection protection',
  })
  async exportPerformanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryHrPerformanceReportDto,
    @Res() res: Response,
  ) {
    const { filename, csv } = await this.service.exportPerformanceReportCsv(user, query);

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    res.send(csv);
  }
}
