import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SalaryComponentsController } from './controllers/salary-components.controller';
import { SalaryStructuresController } from './controllers/salary-structures.controller';
import { EmployeeCompensationController } from './controllers/employee-compensation.controller';
import { SalaryComponentsService } from './services/salary-components.service';
import { SalaryStructuresService } from './services/salary-structures.service';
import { EmployeeCompensationService } from './services/employee-compensation.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    SalaryComponentsController,
    SalaryStructuresController,
    EmployeeCompensationController,
  ],
  providers: [SalaryComponentsService, SalaryStructuresService, EmployeeCompensationService],
  exports: [SalaryComponentsService, SalaryStructuresService, EmployeeCompensationService],
})
export class PayrollModule {}
