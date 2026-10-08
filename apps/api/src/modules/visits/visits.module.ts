import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

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
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get()
  @RequirePermissions('VISIT_VIEW')
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
