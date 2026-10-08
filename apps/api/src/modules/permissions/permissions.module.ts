import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@Injectable()
export class PermissionsService {
  async findAll() {
    return [
      { id: 'p1', code: 'org:manage', name: 'Manage Organization', module: 'organization' },
      { id: 'p2', code: 'employees:read', name: 'View Employees', module: 'employees' },
      { id: 'p3', code: 'employees:write', name: 'Create/Edit Employees', module: 'employees' },
      { id: 'p4', code: 'attendance:mark', name: 'Mark Own Attendance', module: 'attendance' },
      {
        id: 'p5',
        code: 'attendance:manage',
        name: 'Manage Organization Attendance',
        module: 'attendance',
      },
      { id: 'p6', code: 'leave:apply', name: 'Apply For Leave', module: 'leave' },
      { id: 'p7', code: 'leave:approve', name: 'Approve Leave Requests', module: 'leave' },
      { id: 'p8', code: 'visits:apply', name: 'Apply Official Visit', module: 'visits' },
      { id: 'p9', code: 'visits:approve', name: 'Approve Official Visits', module: 'visits' },
      { id: 'p10', code: 'reports:view', name: 'View Analytics & MIS', module: 'reports' },
    ];
  }
}

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'List granular permission catalog' })
  async findAll() {
    const data = await this.permissionsService.findAll();
    return {
      message: 'Permissions catalog retrieved',
      data,
    };
  }
}

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
