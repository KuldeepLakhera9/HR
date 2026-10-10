import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveModule } from '../leave/leave.module';
import { WfhModule } from '../wfh/wfh.module';
import { VisitsModule } from '../visits/visits.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';
import { ManagerReportsService } from './manager-reports.service';
import { ManagerAlertsService } from './manager-alerts.service';

@Module({
  imports: [
    PrismaModule,
    EmployeesModule,
    LeaveModule,
    WfhModule,
    VisitsModule,
    NotificationsModule,
  ],
  controllers: [ManagerController],
  providers: [ManagerService, ManagerReportsService, ManagerAlertsService],
  exports: [ManagerService, ManagerReportsService, ManagerAlertsService],
})
export class ManagerModule {}
