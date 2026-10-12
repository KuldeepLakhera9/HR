import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SalaryComponentsController } from './controllers/salary-components.controller';
import { SalaryStructuresController } from './controllers/salary-structures.controller';
import { SalaryComponentsService } from './services/salary-components.service';
import { SalaryStructuresService } from './services/salary-structures.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [SalaryComponentsController, SalaryStructuresController],
  providers: [SalaryComponentsService, SalaryStructuresService],
  exports: [SalaryComponentsService, SalaryStructuresService],
})
export class PayrollModule {}
