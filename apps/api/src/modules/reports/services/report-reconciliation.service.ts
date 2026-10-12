import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import {
  QueryReconciliationDto,
  ReconciliationDiscrepancy,
  ReconciliationReportResult,
} from '../dto/report-reconciliation.dto';

@Injectable()
export class ReportReconciliationService {
  private readonly logger = new Logger(ReportReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enforces role-based diagnostic permissions.
   * Only ADMIN and HR users are permitted to inspect data discrepancies.
   */
  private verifyAccess(user: AuthenticatedUser): void {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      throw new ForbiddenException(
        'Only HR and Administrators are authorized to run reporting data reconciliation audits',
      );
    }
  }

  /**
   * Execute Comprehensive Reporting Data Quality & Reconciliation Audits.
   * Compares derived reports against authoritative underlying source records.
   * Strictly read-only; never mutates or overwrites source records.
   */
  async runDataQualityChecks(
    user: AuthenticatedUser,
    query: QueryReconciliationDto,
  ): Promise<ReconciliationReportResult> {
    this.verifyAccess(user);

    const orgId = user.organizationId;
    const discrepancies: ReconciliationDiscrepancy[] = [];
    let totalChecksEvaluated = 0;
    const now = new Date();
    const nowIso = now.toISOString();

    const shouldRun = (domain: string) =>
      !query.domain || query.domain === 'ALL' || query.domain === domain;

    // -------------------------------------------------------------------------
    // DOMAIN 1: WORKFORCE RECORDS RECONCILIATION
    // -------------------------------------------------------------------------
    if (shouldRun('WORKFORCE')) {
      // Check DQ-WF-01: Exited employees with missing exitDate
      totalChecksEvaluated++;
      const exitedMissingDates = await this.prisma.employee.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: { in: ['RESIGNED', 'TERMINATED', 'EXITED'] },
          exitDate: null,
        },
        select: { id: true, employeeCode: true, status: true },
      });

      for (const emp of exitedMissingDates) {
        discrepancies.push({
          id: `dq-wf-01-${emp.id}`,
          domain: 'WORKFORCE',
          checkCode: 'DQ-WF-01',
          checkName: 'Exited Employee Missing Exit Date',
          severity: 'CRITICAL',
          recordReference: `EMP:${emp.employeeCode}`,
          entityId: emp.id,
          description: `Employee has status '${emp.status}' but no exit date is recorded. Excludes them from attrition and movement metrics.`,
          expectedValue: 'Contractual Exit Date (ISO-8601)',
          actualValue: 'NULL',
          detectedAt: nowIso,
          suggestedRemediation:
            'HR Operations must update the employee record with their confirmed exit date in Employee Management.',
        });
      }

      // Check DQ-WF-02: Active employees missing department or branch assignment
      totalChecksEvaluated++;
      const activeUnassigned = await this.prisma.employee.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
          isActive: true,
          employment: null,
        },
        select: {
          id: true,
          employeeCode: true,
          status: true,
        },
      });

      for (const emp of activeUnassigned) {
        discrepancies.push({
          id: `dq-wf-02-${emp.id}`,
          domain: 'WORKFORCE',
          checkCode: 'DQ-WF-02',
          checkName: 'Active Employee Unassigned Organization Hierarchy',
          severity: 'WARNING',
          recordReference: `EMP:${emp.employeeCode}`,
          entityId: emp.id,
          description:
            'Active employee is missing employment details record, causing omissions in dimensional breakdown reports.',
          expectedValue: 'Assigned Department and Branch',
          actualValue: 'No Employment Record',
          detectedAt: nowIso,
          suggestedRemediation:
            'Create active Employment Details with Department and Branch under Employee Profile.',
        });
      }

      // Check DQ-WF-03: Inverted joining and exit dates
      totalChecksEvaluated++;
      const invertedDates = await this.prisma.employee.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          exitDate: { not: null },
        },
        select: { id: true, employeeCode: true, joiningDate: true, exitDate: true },
      });

      for (const emp of invertedDates) {
        if (emp.exitDate && emp.joiningDate > emp.exitDate) {
          discrepancies.push({
            id: `dq-wf-03-${emp.id}`,
            domain: 'WORKFORCE',
            checkCode: 'DQ-WF-03',
            checkName: 'Inverted Joining and Exit Dates',
            severity: 'CRITICAL',
            recordReference: `EMP:${emp.employeeCode}`,
            entityId: emp.id,
            description: 'Employee joining date is after their recorded exit date.',
            expectedValue: `exitDate >= joiningDate (${emp.joiningDate.toISOString().split('T')[0]})`,
            actualValue: `exitDate: ${emp.exitDate.toISOString().split('T')[0]}`,
            detectedAt: nowIso,
            suggestedRemediation:
              'Verify contractual records and correct the chronology of joiningDate and exitDate.',
          });
        }
      }
    }

    // -------------------------------------------------------------------------
    // DOMAIN 2: ATTENDANCE SUMMARIES RECONCILIATION
    // -------------------------------------------------------------------------
    if (shouldRun('ATTENDANCE')) {
      // Check DQ-ATT-01: PRESENT status with 0 work minutes and no check-in
      totalChecksEvaluated++;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const invalidPresentSummaries = await this.prisma.attendanceDailySummary.findMany({
        where: {
          organizationId: orgId,
          date: { gte: thirtyDaysAgo },
          status: 'PRESENT',
          firstCheckIn: null,
          totalWorkMinutes: { lte: 0 },
        },
        select: {
          id: true,
          date: true,
          employee: { select: { employeeCode: true } },
          totalWorkMinutes: true,
        },
        take: 100,
      });

      for (const s of invalidPresentSummaries) {
        discrepancies.push({
          id: `dq-att-01-${s.id}`,
          domain: 'ATTENDANCE',
          checkCode: 'DQ-ATT-01',
          checkName: 'Present Summary with Missing Punch and Zero Minutes',
          severity: 'WARNING',
          recordReference: `ATT:${s.employee.employeeCode}:${s.date.toISOString().split('T')[0]}`,
          entityId: s.id,
          description:
            'Attendance daily summary marked PRESENT without recorded biometric punches or calculated work duration.',
          expectedValue: 'firstCheckIn != null and totalWorkMinutes > 0',
          actualValue: `Minutes: ${s.totalWorkMinutes || 0}, Punches: 0`,
          detectedAt: nowIso,
          suggestedRemediation:
            'Inspect raw attendance events or trigger an attendance recalculation for the affected employee date.',
        });
      }

      // Check DQ-ATT-02: Stale INCOMPLETE or PENDING_REVIEW summaries > 48h
      totalChecksEvaluated++;
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const staleExceptions = await this.prisma.attendanceDailySummary.findMany({
        where: {
          organizationId: orgId,
          date: { lte: fortyEightHoursAgo, gte: thirtyDaysAgo },
          status: { in: ['INCOMPLETE', 'PENDING_REVIEW'] },
        },
        select: {
          id: true,
          date: true,
          status: true,
          employee: { select: { employeeCode: true } },
        },
        take: 100,
      });

      for (const exc of staleExceptions) {
        discrepancies.push({
          id: `dq-att-02-${exc.id}`,
          domain: 'ATTENDANCE',
          checkCode: 'DQ-ATT-02',
          checkName: 'Unresolved Attendance Exception Past 48h SLA',
          severity: 'INFO',
          recordReference: `ATT:${exc.employee.employeeCode}:${exc.date.toISOString().split('T')[0]}`,
          entityId: exc.id,
          description: `Daily summary remains in '${exc.status}' state beyond standard 48-hour resolution window.`,
          expectedValue: 'PRESENT, HALF_DAY, ABSENT, or ON_LEAVE',
          actualValue: exc.status,
          detectedAt: nowIso,
          suggestedRemediation:
            'Reporting manager must review and regularize missing punch exception.',
        });
      }
    }

    // -------------------------------------------------------------------------
    // DOMAIN 3: LEAVE BALANCES RECONCILIATION
    // -------------------------------------------------------------------------
    if (shouldRun('LEAVE')) {
      totalChecksEvaluated++;
      const currentYear = now.getFullYear();

      // Fetch all active balance accounts for the current year
      const balanceAccounts = await this.prisma.leaveBalanceAccount.findMany({
        where: { organizationId: orgId, leaveYear: currentYear },
        select: {
          id: true,
          employeeId: true,
          leaveTypeId: true,
          allocatedBalance: true,
          usedBalance: true,
          employee: { select: { employeeCode: true } },
          leaveType: { select: { name: true } },
        },
        take: 300,
      });

      for (const acc of balanceAccounts) {
        // DQ-LV-01: Compare usedBalance with sum of approved leave request chargeable days
        const approvedLeaves = await this.prisma.leaveRequest.findMany({
          where: {
            organizationId: orgId,
            employeeId: acc.employeeId,
            leaveTypeId: acc.leaveTypeId,
            status: 'APPROVED',
            startDate: { gte: new Date(`${currentYear}-01-01T00:00:00.000Z`) },
            endDate: { lte: new Date(`${currentYear}-12-31T23:59:59.999Z`) },
          },
          select: { chargeableDays: true },
        });

        const actualSumChargeable = approvedLeaves.reduce(
          (sum, l) => sum + Number(l.chargeableDays || 0),
          0,
        );
        const recordedUsed = Number(acc.usedBalance || 0);

        if (Math.abs(actualSumChargeable - recordedUsed) > 0.01) {
          discrepancies.push({
            id: `dq-lv-01-${acc.id}`,
            domain: 'LEAVE',
            checkCode: 'DQ-LV-01',
            checkName: 'Leave Balance Account Usage Ledger Mismatch',
            severity: 'CRITICAL',
            recordReference: `BAL:${acc.employee.employeeCode}:${acc.leaveType.name}`,
            entityId: acc.id,
            description: `Recorded usedBalance (${recordedUsed}) does not match the sum of approved leave request days (${actualSumChargeable}).`,
            expectedValue: actualSumChargeable,
            actualValue: recordedUsed,
            detectedAt: nowIso,
            suggestedRemediation:
              'Execute authoritative leave balance ledger reconciliation to align account usage balance with posted requests.',
          });
        }

        // DQ-LV-02: Overdrawn leave balance without overdraft authorization
        const allocated = Number(acc.allocatedBalance || 0);
        if (recordedUsed > allocated) {
          discrepancies.push({
            id: `dq-lv-02-${acc.id}`,
            domain: 'LEAVE',
            checkCode: 'DQ-LV-02',
            checkName: 'Leave Balance Overdrawn Exceeding Allocation',
            severity: 'WARNING',
            recordReference: `BAL:${acc.employee.employeeCode}:${acc.leaveType.name}`,
            entityId: acc.id,
            description: `Used balance (${recordedUsed}) exceeds allocated balance (${allocated}).`,
            expectedValue: `<= ${allocated}`,
            actualValue: recordedUsed,
            detectedAt: nowIso,
            suggestedRemediation:
              'Review employee policy assignment for advance leave allowance or record unapproved absence deductions.',
          });
        }
      }
    }

    // -------------------------------------------------------------------------
    // DOMAIN 4: REQUEST STATES RECONCILIATION
    // -------------------------------------------------------------------------
    if (shouldRun('REQUESTS')) {
      totalChecksEvaluated++;

      // Check DQ-REQ-01: Overlapping approved leave requests for the same employee
      const approvedLeaves = await this.prisma.leaveRequest.findMany({
        where: {
          organizationId: orgId,
          status: 'APPROVED',
          startDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        select: {
          id: true,
          employeeId: true,
          startDate: true,
          endDate: true,
          employee: { select: { employeeCode: true } },
        },
        orderBy: { startDate: 'asc' },
        take: 300,
      });

      // Group by employee and test adjacent intervals
      const leavesByEmp = new Map<string, typeof approvedLeaves>();
      for (const l of approvedLeaves) {
        const list = leavesByEmp.get(l.employeeId) || [];
        list.push(l);
        leavesByEmp.set(l.employeeId, list);
      }

      for (const [, list] of leavesByEmp.entries()) {
        for (let i = 0; i < list.length - 1; i++) {
          const a = list[i];
          const b = list[i + 1];
          if (a.endDate >= b.startDate) {
            discrepancies.push({
              id: `dq-req-01-${a.id}-${b.id}`,
              domain: 'REQUESTS',
              checkCode: 'DQ-REQ-01',
              checkName: 'Conflicting Overlapping Approved Leave Requests',
              severity: 'CRITICAL',
              recordReference: `REQ:${a.employee.employeeCode}`,
              entityId: a.id,
              description: `Overlapping leave request dates: [${a.startDate.toISOString().split('T')[0]} to ${a.endDate.toISOString().split('T')[0]}] conflicts with [${b.startDate.toISOString().split('T')[0]} to ${b.endDate.toISOString().split('T')[0]}].`,
              expectedValue: 'Non-overlapping date windows',
              actualValue: 'Overlapping calendar dates',
              detectedAt: nowIso,
              suggestedRemediation:
                'HR Administrator must cancel duplicate leave application and adjust the employee balance ledger.',
            });
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // DOMAIN 5: PERFORMANCE REVIEWS RECONCILIATION
    // -------------------------------------------------------------------------
    if (shouldRun('PERFORMANCE')) {
      totalChecksEvaluated++;

      // Check DQ-PM-01: Finalized reviews with missing or out-of-bounds overall score
      const finalizedReviews = await this.prisma.performanceReview.findMany({
        where: {
          organizationId: orgId,
          status: 'FINALIZED',
        },
        select: {
          id: true,
          overallScore: true,
          employee: { select: { employeeCode: true } },
          cycle: { select: { name: true } },
        },
        take: 200,
      });

      for (const rev of finalizedReviews) {
        if (rev.overallScore === null || rev.overallScore === undefined) {
          discrepancies.push({
            id: `dq-pm-01-${rev.id}`,
            domain: 'PERFORMANCE',
            checkCode: 'DQ-PM-01',
            checkName: 'Finalized Performance Review Missing Overall Score',
            severity: 'CRITICAL',
            recordReference: `REV:${rev.employee.employeeCode}:${rev.cycle.name}`,
            entityId: rev.id,
            description:
              'Performance review is marked FINALIZED but possesses no authoritative calculated rating score.',
            expectedValue: 'Rating score between 1.00 and 5.00',
            actualValue: 'NULL',
            detectedAt: nowIso,
            suggestedRemediation:
              'Reopen appraisal to execute manager rating submission and score calibration.',
          });
        } else if (rev.overallScore < 1.0 || rev.overallScore > 5.0) {
          discrepancies.push({
            id: `dq-pm-02-${rev.id}`,
            domain: 'PERFORMANCE',
            checkCode: 'DQ-PM-02',
            checkName: 'Performance Review Score Outside Approved Policy Scale',
            severity: 'CRITICAL',
            recordReference: `REV:${rev.employee.employeeCode}:${rev.cycle.name}`,
            entityId: rev.id,
            description: `Overall score ${rev.overallScore} falls outside approved [1.00 - 5.00] enterprise rating scale.`,
            expectedValue: '1.00 <= overallScore <= 5.00',
            actualValue: rev.overallScore,
            detectedAt: nowIso,
            suggestedRemediation:
              'Recalculate weighted section ratings according to approved rating policy formula.',
          });
        }
      }
    }

    // Filter by severity if requested
    const filteredDiscrepancies =
      query.severity && query.severity !== 'ALL'
        ? discrepancies.filter((d) => d.severity === query.severity)
        : discrepancies;

    // Summary aggregation by domain
    const summaryByDomain: Record<
      string,
      { total: number; critical: number; warning: number; info: number }
    > = {
      WORKFORCE: { total: 0, critical: 0, warning: 0, info: 0 },
      ATTENDANCE: { total: 0, critical: 0, warning: 0, info: 0 },
      LEAVE: { total: 0, critical: 0, warning: 0, info: 0 },
      REQUESTS: { total: 0, critical: 0, warning: 0, info: 0 },
      PERFORMANCE: { total: 0, critical: 0, warning: 0, info: 0 },
    };

    for (const d of discrepancies) {
      if (!summaryByDomain[d.domain]) {
        summaryByDomain[d.domain] = { total: 0, critical: 0, warning: 0, info: 0 };
      }
      summaryByDomain[d.domain].total++;
      if (d.severity === 'CRITICAL') summaryByDomain[d.domain].critical++;
      else if (d.severity === 'WARNING') summaryByDomain[d.domain].warning++;
      else if (d.severity === 'INFO') summaryByDomain[d.domain].info++;
    }

    const hasCritical = discrepancies.some((d) => d.severity === 'CRITICAL');
    const hasWarning = discrepancies.some((d) => d.severity === 'WARNING');

    const status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL_DISCREPANCIES' = hasCritical
      ? 'CRITICAL_DISCREPANCIES'
      : hasWarning
        ? 'DEGRADED'
        : 'HEALTHY';

    return {
      organizationId: orgId,
      executedAt: nowIso,
      totalChecksEvaluated,
      totalDiscrepanciesFound: filteredDiscrepancies.length,
      status,
      summaryByDomain,
      discrepancies: filteredDiscrepancies,
    };
  }
}
