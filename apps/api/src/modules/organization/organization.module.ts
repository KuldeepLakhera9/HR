import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    return {
      organization: {
        code: 'PEOPLEOS',
        name: 'PeopleOS Technologies Inc.',
        timezone: 'Asia/Kolkata',
      },
      branches: [
        {
          code: 'BLR-HQ',
          name: 'Bengaluru Headquarters',
          city: 'Bengaluru',
          geofenceRadiusMeters: 150,
        },
        { code: 'MUM-01', name: 'Mumbai Tech Park', city: 'Mumbai', geofenceRadiusMeters: 100 },
        { code: 'DEL-01', name: 'Delhi NCR Hub', city: 'Gurugram', geofenceRadiusMeters: 120 },
      ],
      departments: [
        { code: 'ENG', name: 'Engineering & Product', employeeCount: 42 },
        { code: 'HR', name: 'Human Resources', employeeCount: 8 },
        { code: 'OPS', name: 'Operations & Facilities', employeeCount: 16 },
        { code: 'FIN', name: 'Finance & Accounts', employeeCount: 6 },
      ],
    };
  }
}

@ApiTags('Organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('overview')
  @RequirePermissions('ORGANIZATION_VIEW')
  @ApiOperation({ summary: 'Get organization hierarchy and structure overview' })
  async getOverview() {
    const data = await this.organizationService.getOverview();
    return {
      message: 'Organization overview retrieved successfully',
      data,
    };
  }
}

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
