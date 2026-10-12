import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmployeesService } from './employees.service';
import { HierarchyService } from './hierarchy.service';
import { EmployeesController, OrgChartController } from './employees.controller';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [EmployeesController, OrgChartController],
  providers: [EmployeesService, HierarchyService],
  exports: [EmployeesService, HierarchyService],
})
export class EmployeesModule {}
