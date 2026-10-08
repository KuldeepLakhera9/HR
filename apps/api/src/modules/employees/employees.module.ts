import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

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
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
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
