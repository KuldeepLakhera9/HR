import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SalaryComponentsController } from './controllers/salary-components.controller';
import { SalaryStructuresController } from './controllers/salary-structures.controller';
import { EmployeeCompensationController } from './controllers/employee-compensation.controller';
import { PayrollPeriodsController } from './controllers/payroll-periods.controller';
import { PayrollRunsController } from './controllers/payroll-runs.controller';
import { PayrollExceptionsController } from './controllers/payroll-exceptions.controller';
import { PayslipsController } from './controllers/payslips.controller';
import { SalaryComponentsService } from './services/salary-components.service';
import { SalaryStructuresService } from './services/salary-structures.service';
import { EmployeeCompensationService } from './services/employee-compensation.service';
import { PayrollPeriodsService } from './services/payroll-periods.service';
import { PayrollRunsService } from './services/payroll-runs.service';
import { PayrollCalculationEngineService } from './services/payroll-calculation-engine.service';
import { PayrollInputsService } from './services/payroll-inputs.service';
import { PayrollValidationService } from './services/payroll-validation.service';
import { PayslipsService } from './services/payslips.service';
import { PayslipPdfService } from './services/payslip-pdf.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    SalaryComponentsController,
    SalaryStructuresController,
    EmployeeCompensationController,
    PayrollPeriodsController,
    PayrollRunsController,
    PayrollExceptionsController,
    PayslipsController,
  ],
  providers: [
    SalaryComponentsService,
    SalaryStructuresService,
    EmployeeCompensationService,
    PayrollPeriodsService,
    PayrollRunsService,
    PayrollCalculationEngineService,
    PayrollInputsService,
    PayrollValidationService,
    PayslipsService,
    PayslipPdfService,
  ],
  exports: [
    SalaryComponentsService,
    SalaryStructuresService,
    EmployeeCompensationService,
    PayrollPeriodsService,
    PayrollRunsService,
    PayrollCalculationEngineService,
    PayrollInputsService,
    PayrollValidationService,
    PayslipsService,
    PayslipPdfService,
  ],
})
export class PayrollModule {}
