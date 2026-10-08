import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@Injectable()
export class VisitsService {
  async getOfficialVisits() {
    return [
      {
        id: 'vis-1',
        employeeName: 'Rajesh Kumar',
        destination: 'Client Office, Mumbai',
        purpose: 'Q4 Architecture Review',
        status: 'APPROVED',
        date: '2026-10-09',
      },
      {
        id: 'vis-2',
        employeeName: 'Priya Nair',
        destination: 'Data Center Site, Hyderabad',
        purpose: 'Hardware Inspection',
        status: 'PENDING',
        date: '2026-10-12',
      },
    ];
  }
}

@ApiTags('Official Visits')
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get()
  @ApiOperation({ summary: 'List official visits and outdoor duty requests' })
  async getOfficialVisits() {
    const data = await this.visitsService.getOfficialVisits();
    return {
      message: 'Official visits retrieved successfully',
      data,
    };
  }
}

@Module({
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
