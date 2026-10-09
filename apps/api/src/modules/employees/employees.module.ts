import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EmployeesService } from './employees.service';
import { HierarchyService } from './hierarchy.service';
import { EmployeesController, OrgChartController } from './employees.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [EmployeesController, OrgChartController],
  providers: [EmployeesService, HierarchyService],
  exports: [EmployeesService, HierarchyService],
})
export class EmployeesModule {}
