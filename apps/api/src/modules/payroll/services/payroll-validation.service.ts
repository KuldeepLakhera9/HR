import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  PayrollExceptionSeverity,
  PayrollExceptionCategory,
  PayrollExceptionStatus,
  ResolvePayrollExceptionDto,
  QueryPayrollExceptionsDto,
  PayrollExceptionsSummaryDto,
} from '@hrms/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class PayrollValidationService {
  private readonly logger = new Logger(PayrollValidationService.name);

  // Configurable review thresholds
  private readonly SALARY_SPIKE_RATIO = 1.25; // +25%
  private readonly SALARY_DROP_RATIO = 0.75; // -25%

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Run deterministic, explainable validation rules across all snapshots of a payroll run.
   * Generates BLOCKING_ERROR, WARNING, and INFORMATION exceptions.
   */
  async validateRun(organizationId: string, runId: string): Promise<PayrollExceptionsSummaryDto> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      include: {
        period: true,
        snapshots: {
          include: {
            employee: {
              include: {
                employment: {
                  include: { department: true },
                },
                contact: true,
              },
            },
            items: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run ${runId} not found`);
    }

    const currentVersion = run.calculationVersion;

    // Remove stale OPEN exceptions for this run before re-evaluating
    await this.prisma.payrollException.deleteMany({
      where: {
        organizationId,
        payrollRunId: runId,
        status: 'OPEN',
      },
    });

    const exceptionsToCreate: Prisma.PayrollExceptionCreateManyInput[] = [];

    for (const snap of run.snapshots) {
      const emp = snap.employee;
      const snapJson = (snap.calculationInputSnapshot as any) || {};
      const recon = snapJson.reconciliation;
      const workSummary = snapJson.workSummary;

      const baseGross = Number(snap.baseMonthlyGross);
      const earnedGross = Number(snap.earnedGross);
      const netSalary = Number(snap.netSalary);

      // RULE 1: Missing Compensation Assignment (BLOCKING_ERROR)
      if (snap.isException && (!baseGross || baseGross <= 0)) {
        exceptionsToCreate.push({
          organizationId,
          payrollRunId: runId,
          employeeId: snap.employeeId,
          snapshotId: snap.id,
          severity: 'BLOCKING_ERROR',
          category: 'MISSING_COMPENSATION',
          title: 'Missing Approved Compensation Structure',
          explanation:
            snap.exceptionReason ||
            `Employee ${snap.employeeName} (${snap.employeeCode}) has no active approved compensation assignment for period ${run.period.year}-${run.period.month}. Earned pay is ₹0.00.`,
          sourceRecordType: 'EmployeeCompensation',
          sourceRecordId: emp?.id || null,
          ruleName: 'RULE_REQUIRE_APPROVED_COMPENSATION',
          calculationVersion: currentVersion,
          status: 'OPEN',
        });
      }

      // RULE 2: Negative Net Pay (BLOCKING_ERROR)
      if (netSalary < 0 || snapJson.warnings?.some((w: string) => w.includes('floored at zero'))) {
        exceptionsToCreate.push({
          organizationId,
          payrollRunId: runId,
          employeeId: snap.employeeId,
          snapshotId: snap.id,
          severity: 'BLOCKING_ERROR',
          category: 'NEGATIVE_NET_PAY',
          title: 'Deductions Exceed Gross Salary (Negative Net Pay)',
          explanation: `Total employee deductions (₹${snap.totalDeductions}) exceed earned gross earnings (₹${snap.earnedGross}). Net take-home cannot be negative.`,
          sourceRecordType: 'EmployeePayrollSnapshot',
          sourceRecordId: snap.id,
          ruleName: 'RULE_NET_SALARY_FLOOR',
          calculationVersion: currentVersion,
          status: 'OPEN',
        });
      }

      // RULE 3: Calculation & Item Reconciliation Discrepancy (BLOCKING_ERROR)
      if (recon && !recon.isReconciled) {
        exceptionsToCreate.push({
          organizationId,
          payrollRunId: runId,
          employeeId: snap.employeeId,
          snapshotId: snap.id,
          severity: 'BLOCKING_ERROR',
          category: 'CALCULATION_DISCREPANCY',
          title: 'Mathematical Reconciliation Mismatch',
          explanation:
            recon.discrepancyReason ||
            'Sum of line-item components does not balance with summary gross earnings or net salary.',
          sourceRecordType: 'PayrollCalculationEngine',
          sourceRecordId: snap.id,
          ruleName: 'RULE_MATHEMATICAL_RECONCILIATION',
          calculationVersion: currentVersion,
          status: 'OPEN',
        });
      }

      // RULE 4: Anomaly Salary Spike (> +25% vs Base Gross) (WARNING)
      // Note: Never automatically alters salary per Requirement 9.
      if (baseGross > 0 && earnedGross > baseGross * this.SALARY_SPIKE_RATIO) {
        const spikePct = Math.round(((earnedGross - baseGross) / baseGross) * 100);
        exceptionsToCreate.push({
          organizationId,
          payrollRunId: runId,
          employeeId: snap.employeeId,
          snapshotId: snap.id,
          severity: 'WARNING',
          category: 'ANOMALY_SALARY_SPIKE',
          title: `Unusual Salary Spike (+${spikePct}%)`,
          explanation: `Earned gross (₹${earnedGross.toLocaleString('en-IN')}) is +${spikePct}% higher than base monthly salary (₹${baseGross.toLocaleString('en-IN')}). Review one-time adjustments, arrears, or bonuses.`,
          sourceRecordType: 'PayrollAdjustment',
          ruleName: 'ANOMALY_SPIKE_DETECTOR',
          calculationVersion: currentVersion,
          status: 'OPEN',
        });
      }

      // RULE 5: Anomaly Salary Drop (< -25% vs Base Gross) (WARNING)
      if (baseGross > 0 && earnedGross < baseGross * this.SALARY_DROP_RATIO && !snap.isException) {
        const dropPct = Math.round(((baseGross - earnedGross) / baseGross) * 100);
        exceptionsToCreate.push({
          organizationId,
          payrollRunId: runId,
          employeeId: snap.employeeId,
          snapshotId: snap.id,
          severity: 'WARNING',
          category: 'ANOMALY_SALARY_DROP',
          title: `Significant Salary Drop (-${dropPct}%)`,
          explanation: `Earned gross (₹${earnedGross.toLocaleString('en-IN')}) is -${dropPct}% lower than base monthly salary (₹${baseGross.toLocaleString('en-IN')}) due to Loss-of-Pay or proration. Verify attendance records.`,
          sourceRecordType: 'AttendanceDailySummary',
          ruleName: 'ANOMALY_DROP_DETECTOR',
          calculationVersion: currentVersion,
          status: 'OPEN',
        });
      }

      // RULE 6: Unresolved Attendance / Pending Corrections (WARNING)
      if (workSummary && workSummary.unresolvedExceptionCount > 0) {
        exceptionsToCreate.push({
          organizationId,
          payrollRunId: runId,
          employeeId: snap.employeeId,
          snapshotId: snap.id,
          severity: 'WARNING',
          category: 'UNRESOLVED_ATTENDANCE',
          title: 'Unresolved Attendance Corrections / Exceptions',
          explanation: `${workSummary.unresolvedExceptionCount} pending correction request(s) or anomaly exception(s) exist for ${snap.employeeName}. Resolve attendance records prior to payroll lock.`,
          sourceRecordType: 'AttendanceCorrectionRequest',
          ruleName: 'RULE_ATTENDANCE_CORRECTIONS_PENDING',
          calculationVersion: currentVersion,
          status: 'OPEN',
        });
      }

      // RULE 7: Missing Attendance Records on Scheduled Days (WARNING)
      if (workSummary && workSummary.missingAttendanceDays > 0) {
        exceptionsToCreate.push({
          organizationId,
          payrollRunId: runId,
          employeeId: snap.employeeId,
          snapshotId: snap.id,
          severity: 'WARNING',
          category: 'UNRESOLVED_ATTENDANCE',
          title: 'Missing Punch Records on Scheduled Workdays',
          explanation: `${workSummary.missingAttendanceDays} scheduled workday(s) have no clock-in records, leaves, or holidays. Per policy, pay was not docked automatically.`,
          sourceRecordType: 'AttendanceDailySummary',
          ruleName: 'RULE_ATTENDANCE_MISSING_PUNCHES',
          calculationVersion: currentVersion,
          status: 'OPEN',
        });
      }

      // RULE 8: Missing Bank Details (WARNING)
      if (!snap.bankAccountMasked && !emp?.contact?.address) {
        exceptionsToCreate.push({
          organizationId,
          payrollRunId: runId,
          employeeId: snap.employeeId,
          snapshotId: snap.id,
          severity: 'WARNING',
          category: 'MISSING_BANK_DETAILS',
          title: 'Missing Bank Account / Payout Method',
          explanation: `Employee ${snap.employeeName} has no bank account number configured. Direct deposit payout cannot be executed.`,
          sourceRecordType: 'Employee',
          sourceRecordId: emp?.id || null,
          ruleName: 'RULE_PAYOUT_BANK_ACCOUNT',
          calculationVersion: currentVersion,
          status: 'OPEN',
        });
      }

      // RULE 9: Missing Tax PAN / UAN Identifier (INFORMATION)
      if (!snap.panMasked) {
        exceptionsToCreate.push({
          organizationId,
          payrollRunId: runId,
          employeeId: snap.employeeId,
          snapshotId: snap.id,
          severity: 'INFORMATION',
          category: 'MISSING_TAX_IDENTIFIER',
          title: 'Missing Income Tax PAN Identifier',
          explanation: `Employee ${snap.employeeName} has no PAN registered. TDS may be deducted at higher statutory rates if required.`,
          sourceRecordType: 'Employee',
          sourceRecordId: emp?.id || null,
          ruleName: 'RULE_STATUTORY_PAN_IDENTIFIER',
          calculationVersion: currentVersion,
          status: 'OPEN',
        });
      }
    }

    if (exceptionsToCreate.length > 0) {
      await this.prisma.payrollException.createMany({
        data: exceptionsToCreate,
      });
    }

    // Update total exception count on run
    const openCount = await this.prisma.payrollException.count({
      where: {
        organizationId,
        payrollRunId: runId,
        status: 'OPEN',
      },
    });

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { exceptionCount: openCount },
    });

    this.logger.log(
      `Validated payroll run ${runId}: generated ${exceptionsToCreate.length} exceptions (${openCount} open).`,
    );

    return this.getExceptionsSummary(organizationId, runId);
  }

  /**
   * Query exceptions with filtering by period, department, employee, category, and severity
   */
  async getExceptions(organizationId: string, query: QueryPayrollExceptionsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PayrollExceptionWhereInput = {
      organizationId,
      ...(query.runId ? { payrollRunId: query.runId } : {}),
      ...(query.periodId ? { payrollRun: { periodId: query.periodId } } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId
        ? {
            employee: {
              employment: { departmentId: query.departmentId },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { explanation: { contains: query.search, mode: 'insensitive' } },
              {
                employee: {
                  displayName: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                employee: {
                  employeeCode: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.payrollException.count({ where }),
      this.prisma.payrollException.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
        include: {
          payrollRun: {
            select: { id: true, title: true, status: true },
          },
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
              employment: {
                select: {
                  department: { select: { name: true } },
                },
              },
            },
          },
          resolvedBy: {
            select: { id: true, email: true },
          },
        },
      }),
    ]);

    return {
      data: items.map((ex) => ({
        id: ex.id,
        organizationId: ex.organizationId,
        payrollRunId: ex.payrollRunId,
        runTitle: ex.payrollRun?.title,
        employeeId: ex.employeeId,
        employeeCode: ex.employee?.employeeCode || null,
        employeeName: ex.employee?.displayName || null,
        departmentName: ex.employee?.employment?.department?.name || null,
        snapshotId: ex.snapshotId,
        severity: ex.severity,
        category: ex.category,
        title: ex.title,
        explanation: ex.explanation,
        sourceRecordType: ex.sourceRecordType,
        sourceRecordId: ex.sourceRecordId,
        ruleName: ex.ruleName,
        detectedAt: ex.detectedAt.toISOString(),
        calculationVersion: ex.calculationVersion,
        status: ex.status,
        resolutionAction: ex.resolutionAction,
        resolutionNotes: ex.resolutionNotes,
        resolvedById: ex.resolvedById,
        resolvedByName: ex.resolvedBy?.email || null,
        resolvedAt: ex.resolvedAt?.toISOString() || null,
        createdAt: ex.createdAt.toISOString(),
        updatedAt: ex.updatedAt.toISOString(),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get KPI summary of exceptions for a run or organization
   */
  async getExceptionsSummary(
    organizationId: string,
    runId?: string,
  ): Promise<PayrollExceptionsSummaryDto> {
    const where: Prisma.PayrollExceptionWhereInput = {
      organizationId,
      ...(runId ? { payrollRunId: runId } : {}),
    };

    const [
      total,
      blockingErrors,
      warnings,
      information,
      openCount,
      resolvedCount,
      overriddenCount,
      unresolvedWarningsList,
    ] = await Promise.all([
      this.prisma.payrollException.count({ where }),
      this.prisma.payrollException.count({
        where: { ...where, severity: 'BLOCKING_ERROR', status: 'OPEN' },
      }),
      this.prisma.payrollException.count({
        where: { ...where, severity: 'WARNING', status: 'OPEN' },
      }),
      this.prisma.payrollException.count({
        where: { ...where, severity: 'INFORMATION', status: 'OPEN' },
      }),
      this.prisma.payrollException.count({ where: { ...where, status: 'OPEN' } }),
      this.prisma.payrollException.count({ where: { ...where, status: 'RESOLVED' } }),
      this.prisma.payrollException.count({ where: { ...where, status: 'OVERRIDDEN' } }),
      this.prisma.payrollException.findMany({
        where: { ...where, severity: 'WARNING', status: 'OPEN' },
        select: {
          id: true,
          category: true,
          title: true,
          employee: { select: { displayName: true } },
        },
        take: 50,
      }),
    ]);

    return {
      total,
      blockingErrors,
      warnings,
      information,
      open: openCount,
      resolved: resolvedCount,
      overridden: overriddenCount,
      hasBlockingErrors: blockingErrors > 0,
      canApprove: blockingErrors === 0,
      unresolvedWarnings: (unresolvedWarningsList || []).map((w) => ({
        id: w.id,
        category: w.category,
        title: w.title,
        employeeName: w.employee?.displayName || null,
      })),
    };
  }

  /**
   * Investigate and resolve an exception with audit trail and mandatory resolution notes.
   */
  async resolveException(
    organizationId: string,
    exceptionId: string,
    dto: ResolvePayrollExceptionDto,
    userId: string,
  ) {
    const exception = await this.prisma.payrollException.findFirst({
      where: { id: exceptionId, organizationId },
      include: { payrollRun: true },
    });

    if (!exception) {
      throw new NotFoundException(`Payroll exception ${exceptionId} not found`);
    }

    // Requirement 8: Do not automatically change locked payroll
    if (exception.payrollRun.status === 'LOCKED' || exception.payrollRun.status === 'PUBLISHED') {
      throw new BadRequestException(
        'Cannot resolve exceptions on a LOCKED or PUBLISHED payroll run. Issue a controlled correction run.',
      );
    }

    // Requirement 5: Require a reason for manual overrides
    if (!dto.resolutionNotes || dto.resolutionNotes.trim().length < 5) {
      throw new BadRequestException(
        'A comprehensive resolution note (minimum 5 characters) is required for audit compliance.',
      );
    }

    const newStatus: PayrollExceptionStatus =
      dto.action === 'OVERRIDE_APPROVED'
        ? 'OVERRIDDEN'
        : dto.action === 'DISMISSED'
          ? 'DISMISSED'
          : 'RESOLVED';

    const updated = await this.prisma.payrollException.update({
      where: { id: exceptionId },
      data: {
        status: newStatus,
        resolutionAction: dto.action,
        resolutionNotes: dto.resolutionNotes.trim(),
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });

    // Update open exception count on run
    const openCount = await this.prisma.payrollException.count({
      where: {
        organizationId,
        payrollRunId: exception.payrollRunId,
        status: 'OPEN',
      },
    });

    await this.prisma.payrollRun.update({
      where: { id: exception.payrollRunId },
      data: { exceptionCount: openCount },
    });

    // Requirement 6: Audit all overrides and resolution actions
    await this.auditService.record({
      organizationId,
      userId,
      action: 'PAYROLL_EXCEPTION_RESOLVED',
      entity: 'PayrollException',
      entityId: exceptionId,
      metadata: {
        payrollRunId: exception.payrollRunId,
        employeeId: exception.employeeId,
        severity: exception.severity,
        category: exception.category,
        action: dto.action,
        newStatus,
        notes: dto.resolutionNotes,
      },
    });

    return updated;
  }
}
