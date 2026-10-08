import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EmployeesService } from './employees.service';
import { EmployeesController, OrgChartController } from './employees.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [EmployeesController, OrgChartController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
