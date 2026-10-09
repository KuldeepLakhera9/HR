import { Module } from '@nestjs/common';
import { WfhController } from './wfh.controller';
import { WfhService } from './wfh.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [PrismaModule, AuditModule, EmployeesModule, AttendanceModule],
  controllers: [WfhController],
  providers: [WfhService],
  exports: [WfhService],
})
export class WfhModule {}
