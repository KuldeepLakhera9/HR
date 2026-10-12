import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthorizationModule } from '../../common/authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmployeesModule } from '../employees/employees.module';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { ReviewCyclesService } from './review-cycles.service';
import { ReviewCyclesController } from './review-cycles.controller';

@Module({
  imports: [PrismaModule, AuthorizationModule, AuditModule, NotificationsModule, EmployeesModule],
  controllers: [GoalsController, ReviewCyclesController],
  providers: [GoalsService, ReviewCyclesService],
  exports: [GoalsService, ReviewCyclesService],
})
export class PerformanceModule {}
