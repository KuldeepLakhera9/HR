import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EmployeesModule } from '../employees/employees.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { LeaveLedgerService } from './leave-ledger.service';
import { LeaveCalculatorService } from './leave-calculator.service';

@Module({
  imports: [PrismaModule, EmployeesModule, NotificationsModule],
  controllers: [LeaveController],
  providers: [LeaveService, LeaveLedgerService, LeaveCalculatorService],
  exports: [LeaveService, LeaveLedgerService, LeaveCalculatorService],
})
export class LeaveModule {}
