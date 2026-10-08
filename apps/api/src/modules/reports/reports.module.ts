import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

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
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get management information system (MIS) report summary' })
  async getSummary() {
    const data = await this.reportsService.getMISSummary();
    return {
      message: 'MIS report summary retrieved',
      data,
    };
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
