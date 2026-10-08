import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Injectable()
export class EmployeesService {
  async findAll() {
    return [
      {
        id: 'emp-1',
        code: 'EMP001',
        name: 'Vikram Aditya',
        department: 'Executive',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        id: 'emp-2',
        code: 'EMP002',
        name: 'Ananya Sharma',
        department: 'Human Resources',
        role: 'HR',
        status: 'ACTIVE',
      },
      {
        id: 'emp-3',
        code: 'EMP003',
        name: 'Rajesh Kumar',
        department: 'Engineering',
        role: 'MANAGER',
        status: 'ACTIVE',
      },
      {
        id: 'emp-4',
        code: 'EMP004',
        name: 'Priya Nair',
        department: 'Engineering',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
      {
        id: 'emp-5',
        code: 'EMP005',
        name: 'Amitabh Roy',
        department: 'Engineering',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    ];
  }
}

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('EMPLOYEE_VIEW')
  @ApiOperation({ summary: 'List employees directory (Phase 1 Foundation)' })
  async findAll() {
    const data = await this.employeesService.findAll();
    return {
      message: 'Employees retrieved successfully',
      data,
      meta: { total: data.length },
    };
  }
}

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
