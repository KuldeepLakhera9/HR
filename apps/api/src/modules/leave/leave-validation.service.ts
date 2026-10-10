import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeaveCalculatorService, CalculatedLeaveDaysResult } from './leave-calculator.service';
import {
  ApprovalDecision,
  LeaveDurationType,
  LeaveRequestStatus,
  Prisma,
  VisitStatus,
  WfhStatus,
} from '@prisma/client';

export interface LeaveValidationError {
  field?: string;
  code: string;
  message: string;
}

export interface LeaveValidationWarning {
  code: string;
  message: string;
}

export interface LeaveValidationResult {
  isValid: boolean;
  errors: LeaveValidationError[];
  warnings: LeaveValidationWarning[];
  calculation?: CalculatedLeaveDaysResult;
  availableBalance?: number;
  pendingBalance?: number;
  leaveYear?: number;
  policy?: {
    id: string;
    name: string;
    code: string;
    annualEntitlement: number;
    allowNegativeBalance: boolean;
    maxNegativeBalance: number;
    countWeekendsAsLeave: boolean;
    countHolidaysAsLeave: boolean;
    minNoticeDays: number;
    maxConsecutiveDays?: number | null;
  };
}

export interface ValidateLeaveParams {
  organizationId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string | Date;
  endDate: string | Date;
  durationType?: LeaveDurationType;
  reason?: string;
  attachmentUrl?: string;
  excludeRequestId?: string; // For updates or re-validations
  referenceDate?: Date; // Authoritative reference date (defaults to UTC server midnight)
  tx?: Prisma.TransactionClient;
}

@Injectable()
export class LeaveValidationService {
  private readonly logger = new Logger(LeaveValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculatorService: LeaveCalculatorService,
  ) {}

  /**
   * Deterministically validates an employee leave application.
   * Can be run in pre-flight mode (returning structured error objects)
   * or throwing mode (throwing structured NestJS exceptions).
   */
  async validateLeaveApplication(
    params: ValidateLeaveParams,
    throwOnError: boolean = false,
  ): Promise<LeaveValidationResult> {
    const client = params.tx || this.prisma;
    const errors: LeaveValidationError[] = [];
    const warnings: LeaveValidationWarning[] = [];

    // 1. Date Normalization & Range Checks
    let start: Date;
    let end: Date;

    try {
      start = this.calculatorService.normalizeDateToUtc(params.startDate);
      end = this.calculatorService.normalizeDateToUtc(params.endDate);
    } catch (err: any) {
      errors.push({
        field: 'dates',
        code: 'INVALID_DATE_FORMAT',
        message: err.message || 'Invalid start or end date format provided.',
      });
      return this.finishValidation(errors, warnings, throwOnError);
    }

    if (end < start) {
      errors.push({
        field: 'endDate',
        code: 'END_DATE_BEFORE_START_DATE',
        message: 'Leave end date cannot be earlier than start date.',
      });
      return this.finishValidation(errors, warnings, throwOnError);
    }

    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();

    // 2. Leave-Year Boundary Validation
    // Enterprise HR policy rule: Leaves cannot cross annual ledger accounting boundaries.
    if (startYear !== endYear) {
      errors.push({
        field: 'dates',
        code: 'CROSS_LEAVE_YEAR_BOUNDARY',
        message: `Leave application spans across leave year boundary (${startYear} and ${endYear}). Please submit separate applications for each year to ensure accurate balance deduction and carry-forward calculation.`,
      });
      return this.finishValidation(errors, warnings, throwOnError);
    }

    const leaveYear = startYear;
    const durationType = params.durationType || LeaveDurationType.FULL_DAY;

    // 3. Leave Type Verification
    const leaveType = await client.leaveType.findFirst({
      where: {
        id: params.leaveTypeId,
        organizationId: params.organizationId,
        isActive: true,
      },
    });

    if (!leaveType) {
      errors.push({
        field: 'leaveTypeId',
        code: 'LEAVE_TYPE_INACTIVE_OR_NOT_FOUND',
        message: 'The requested leave type does not exist or has been deactivated.',
      });
      return this.finishValidation(errors, warnings, throwOnError);
    }

    // Half-Day Constraints
    if (durationType !== LeaveDurationType.FULL_DAY) {
      if (!leaveType.allowHalfDay) {
        errors.push({
          field: 'durationType',
          code: 'HALF_DAY_NOT_ALLOWED',
          message: `${leaveType.name} policy does not permit half-day applications.`,
        });
      }
      if (start.getTime() !== end.getTime()) {
        errors.push({
          field: 'durationType',
          code: 'HALF_DAY_MULTI_DAY_PROHIBITED',
          message: 'Half-day leave can only be applied for a single calendar day.',
        });
        return this.finishValidation(errors, warnings, throwOnError);
      }
    }

    // 4. Policy Assignment & Eligibility
    const policyAssignment = await client.employeeLeavePolicyAssignment.findFirst({
      where: {
        organizationId: params.organizationId,
        employeeId: params.employeeId,
        leavePolicy: { leaveTypeId: leaveType.id },
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      },
      include: { leavePolicy: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const policy = policyAssignment?.leavePolicy;

    if (!policy) {
      errors.push({
        field: 'policy',
        code: 'NO_ASSIGNED_POLICY',
        message: `No active leave policy assignment found for ${leaveType.name} during the requested period.`,
      });
      return this.finishValidation(errors, warnings, throwOnError);
    }

    // 5. Notice Period Validation (Deterministic server clock)
    if (policy.minNoticeDays > 0) {
      const refDate = params.referenceDate
        ? this.calculatorService.normalizeDateToUtc(params.referenceDate)
        : this.calculatorService.normalizeDateToUtc(new Date());

      const diffMs = start.getTime() - refDate.getTime();
      const noticeDaysProvided = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (noticeDaysProvided < policy.minNoticeDays) {
        errors.push({
          field: 'startDate',
          code: 'INSUFFICIENT_NOTICE_PERIOD',
          message: `${policy.name} requires at least ${policy.minNoticeDays} day(s) advance notice. Provided notice: ${noticeDaysProvided < 0 ? 0 : noticeDaysProvided} day(s).`,
        });
      }
    }

    // 6. Chargeable Days Calculation
    const calc = await this.calculatorService.calculateLeaveDays({
      organizationId: params.organizationId,
      employeeId: params.employeeId,
      leaveTypeId: leaveType.id,
      startDate: start,
      endDate: end,
      durationType,
    });

    if (calc.chargeableDays <= 0) {
      errors.push({
        field: 'dates',
        code: 'ZERO_CHARGEABLE_DAYS',
        message:
          'Selected date range contains 0 chargeable working days (falls entirely on weekends or gazetted holidays).',
      });
      return this.finishValidation(errors, warnings, throwOnError);
    }

    // 7. Maximum Duration Limits
    if (policy.maxConsecutiveDays && calc.chargeableDays > policy.maxConsecutiveDays) {
      errors.push({
        field: 'endDate',
        code: 'MAX_CONSECUTIVE_DAYS_EXCEEDED',
        message: `Requested leave (${calc.chargeableDays} days) exceeds maximum allowable consecutive limit of ${policy.maxConsecutiveDays} days under policy ${policy.name}.`,
      });
    }

    // 8. Document Requirements
    if (
      leaveType.requiresDoc &&
      calc.chargeableDays >= leaveType.docThresholdDays &&
      !params.attachmentUrl
    ) {
      errors.push({
        field: 'attachmentUrl',
        code: 'SUPPORTING_DOCUMENT_REQUIRED',
        message: `Supporting documentation (e.g. medical certificate) is mandatory for ${leaveType.name} applications of ${leaveType.docThresholdDays} days or longer.`,
      });
    }

    // 9. Collision & Overlap Detection
    // A. Overlapping Leave Requests
    const overlappingLeaveWhere: Prisma.LeaveRequestWhereInput = {
      employeeId: params.employeeId,
      status: { in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.APPROVED] },
      startDate: { lte: end },
      endDate: { gte: start },
    };
    if (params.excludeRequestId) {
      overlappingLeaveWhere.id = { not: params.excludeRequestId };
    }

    const overlappingLeave = await client.leaveRequest.findFirst({
      where: overlappingLeaveWhere,
      include: { leaveType: true },
    });

    if (overlappingLeave) {
      const statusLabel =
        overlappingLeave.status === LeaveRequestStatus.SUBMITTED ? 'Pending' : 'Approved';
      errors.push({
        field: 'dates',
        code: 'OVERLAPPING_LEAVE_REQUEST',
        message: `Overlapping ${statusLabel} leave exists: ${overlappingLeave.leaveType.name} from ${overlappingLeave.startDate.toISOString().split('T')[0]} to ${overlappingLeave.endDate.toISOString().split('T')[0]}.`,
      });
    }

    // B. Overlapping Official Visits
    const overlappingVisit = await client.officialVisit.findFirst({
      where: {
        employeeId: params.employeeId,
        status: { in: [VisitStatus.SUBMITTED, VisitStatus.APPROVED] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });

    if (overlappingVisit) {
      errors.push({
        field: 'dates',
        code: 'OVERLAPPING_OFFICIAL_VISIT',
        message: `Cannot request leave during an active official visit window (${overlappingVisit.startDate.toISOString().split('T')[0]} to ${overlappingVisit.endDate.toISOString().split('T')[0]}).`,
      });
    }

    // C. Overlapping Work-From-Home
    const overlappingWfh = await client.wfhRequest.findFirst({
      where: {
        employeeId: params.employeeId,
        status: { in: [WfhStatus.SUBMITTED, WfhStatus.APPROVED] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });

    if (overlappingWfh) {
      errors.push({
        field: 'dates',
        code: 'OVERLAPPING_WFH_REQUEST',
        message: `Cannot request leave during an active work-from-home schedule (${overlappingWfh.startDate.toISOString().split('T')[0]} to ${overlappingWfh.endDate.toISOString().split('T')[0]}).`,
      });
    }

    // 10. Balance Sufficiency Check
    const account = await client.leaveBalanceAccount.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId: params.organizationId,
          employeeId: params.employeeId,
          leaveTypeId: leaveType.id,
          leaveYear,
        },
      },
    });

    const availableBalance = account
      ? Number(account.closingBalance)
      : Number(policy.annualEntitlement);
    const pendingBalance = account ? Number(account.pendingBalance) : 0;
    const allowNegative = policy.allowNegativeBalance;
    const maxNegative = Number(policy.maxNegativeBalance);

    if (!allowNegative && availableBalance < calc.chargeableDays) {
      errors.push({
        field: 'balance',
        code: 'INSUFFICIENT_LEAVE_BALANCE',
        message: `Insufficient leave balance for ${leaveType.name}. Available: ${availableBalance} days, Required: ${calc.chargeableDays} days.`,
      });
    } else if (allowNegative && availableBalance - calc.chargeableDays < -maxNegative) {
      errors.push({
        field: 'balance',
        code: 'NEGATIVE_BALANCE_LIMIT_EXCEEDED',
        message: `Leave application exceeds maximum allowable overdraft limit of ${maxNegative} days. Available: ${availableBalance} days.`,
      });
    }

    // Warning for sandwich rule application
    if (calc.isSandwichApplied) {
      warnings.push({
        code: 'SANDWICH_RULE_APPLIED',
        message:
          'Sandwich rule applied: Non-working days falling within the leave period have been included as chargeable leave per organizational policy.',
      });
    }

    return this.finishValidation(
      errors,
      warnings,
      throwOnError,
      calc,
      availableBalance,
      pendingBalance,
      leaveYear,
      {
        id: policy.id,
        name: policy.name,
        code: policy.code,
        annualEntitlement: Number(policy.annualEntitlement),
        allowNegativeBalance: policy.allowNegativeBalance,
        maxNegativeBalance: Number(policy.maxNegativeBalance),
        countWeekendsAsLeave: policy.countWeekendsAsLeave,
        countHolidaysAsLeave: policy.countHolidaysAsLeave,
        minNoticeDays: policy.minNoticeDays,
        maxConsecutiveDays: policy.maxConsecutiveDays,
      },
    );
  }

  private finishValidation(
    errors: LeaveValidationError[],
    warnings: LeaveValidationWarning[],
    throwOnError: boolean,
    calculation?: CalculatedLeaveDaysResult,
    availableBalance?: number,
    pendingBalance?: number,
    leaveYear?: number,
    policy?: any,
  ): LeaveValidationResult {
    const isValid = errors.length === 0;

    if (!isValid && throwOnError) {
      const primaryError = errors[0];
      if (
        primaryError.code === 'OVERLAPPING_LEAVE_REQUEST' ||
        primaryError.code === 'OVERLAPPING_OFFICIAL_VISIT' ||
        primaryError.code === 'OVERLAPPING_WFH_REQUEST'
      ) {
        throw new ConflictException({
          statusCode: 409,
          code: primaryError.code,
          message: primaryError.message,
          errors,
        });
      }

      throw new BadRequestException({
        statusCode: 400,
        code: primaryError.code,
        message: primaryError.message,
        errors,
      });
    }

    return {
      isValid,
      errors,
      warnings,
      calculation,
      availableBalance,
      pendingBalance,
      leaveYear,
      policy,
    };
  }
}
