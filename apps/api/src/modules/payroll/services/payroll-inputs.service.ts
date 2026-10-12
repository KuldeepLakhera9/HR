import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  PayrollWorkSummary,
  PayrollLateSourceChangesReportDto,
  PayrollLateSourceChangeDto,
  PayrollAttendanceReconciliationResponseDto,
  PayrollAttendanceReconciliationItemDto,
} from '@hrms/types';
import * as crypto from 'crypto';

@Injectable()
export class PayrollInputsService {
  private readonly logger = new Logger(PayrollInputsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtains the applicable employee work summary for a payroll period
   * using canonical attendance, leave, WFH, official visit, holiday, and shift records.
   */
  async getEmployeeWorkSummary(
    organizationId: string,
    employeeId: string,
    period: {
      id: string;
      startDate: Date;
      endDate: Date;
      totalDays: number;
    },
  ): Promise<PayrollWorkSummary> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: {
        employment: {
          include: {
            branch: true,
            department: true,
            designation: true,
          },
        },
        shiftAssignments: {
          where: {
            organizationId,
            effectiveFrom: { lte: period.endDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.startDate } }],
          },
          include: { shift: true },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
    });

    if (!employee) {
      throw new BadRequestException(
        `Employee ${employeeId} not found in organization ${organizationId}`,
      );
    }

    const warnings: string[] = [];
    const pStart = new Date(period.startDate);
    const pEnd = new Date(period.endDate);

    // 1. Employee Lifecycle Boundaries (Joining and Exit Dates)
    const joiningDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
    const exitDate = employee.exitDate ? new Date(employee.exitDate) : null;

    let isMidPeriodJoiner = false;
    let isMidPeriodLeaver = false;

    // Normalize boundaries to midnight UTC
    const eligibleStart = new Date(pStart);
    if (joiningDate && joiningDate > pStart) {
      if (joiningDate > pEnd) {
        // Joined after this period ended -> 0 eligible days
        return this.buildIneligibleWorkSummary(
          employee,
          period,
          'Employee joining date is after the payroll period end date.',
        );
      }
      eligibleStart.setTime(joiningDate.getTime());
      isMidPeriodJoiner = true;
      warnings.push(
        `Mid-period joiner: joined on ${joiningDate.toISOString().split('T')[0]}, prorated from joining date.`,
      );
    }

    const eligibleEnd = new Date(pEnd);
    if (exitDate && exitDate < pEnd) {
      if (exitDate < pStart) {
        // Exited before this period began -> 0 eligible days
        return this.buildIneligibleWorkSummary(
          employee,
          period,
          'Employee exited before the payroll period start date.',
        );
      }
      eligibleEnd.setTime(exitDate.getTime());
      isMidPeriodLeaver = true;
      warnings.push(
        `Mid-period leaver: exit date on ${exitDate.toISOString().split('T')[0]}, prorated up to exit date.`,
      );
    }

    // Calculate eligible calendar days in period
    const msDiff = Math.max(0, eligibleEnd.getTime() - eligibleStart.getTime());
    const eligibleDaysInPeriod = Math.min(
      period.totalDays,
      Math.max(0, Math.floor(msDiff / (1000 * 60 * 60 * 24)) + 1),
    );

    // 2. Resolve Employee Shift & Weekly Off Rules
    const activeShift = employee.shiftAssignments[0]?.shift || null;
    const workDaysOfWeek: number[] =
      activeShift?.workDays && activeShift.workDays.length > 0
        ? activeShift.workDays
        : [1, 2, 3, 4, 5]; // Default: Mon(1) to Fri(5)

    // 3. Concurrently fetch Canonical Source Records for the period
    const branchId = employee.employment?.branchId;
    const [
      dailySummaries,
      approvedLeaves,
      approvedWfh,
      approvedVisits,
      holidays,
      pendingCorrections,
      attendanceExceptions,
    ] = await Promise.all([
      // Canonical Attendance Summaries
      this.prisma.attendanceDailySummary.findMany({
        where: {
          organizationId,
          employeeId,
          date: { gte: pStart, lte: pEnd },
        },
        orderBy: { date: 'asc' },
      }),
      // Canonical Approved Leaves
      this.prisma.leaveRequest.findMany({
        where: {
          organizationId,
          employeeId,
          status: 'APPROVED',
          startDate: { lte: pEnd },
          endDate: { gte: pStart },
        },
        include: { leaveType: true },
      }),
      // Canonical Approved WFH
      this.prisma.wfhRequest.findMany({
        where: {
          organizationId,
          employeeId,
          status: 'APPROVED',
          startDate: { lte: pEnd },
          endDate: { gte: pStart },
        },
      }),
      // Canonical Approved Official Visits
      this.prisma.officialVisit.findMany({
        where: {
          organizationId,
          employeeId,
          status: 'APPROVED',
          startDate: { lte: pEnd },
          endDate: { gte: pStart },
        },
      }),
      // Canonical Branch/Org Holidays
      this.prisma.holiday.findMany({
        where: {
          organizationId,
          date: { gte: pStart, lte: pEnd },
          OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
        },
      }),
      // Pending Attendance Corrections
      this.prisma.attendanceCorrectionRequest.findMany({
        where: {
          organizationId,
          employeeId,
          status: 'PENDING',
          targetDate: { gte: pStart, lte: pEnd },
        },
      }),
      // Unresolved Attendance Exceptions
      this.prisma.attendanceException.findMany({
        where: {
          organizationId,
          employeeId,
          resolved: false,
          date: { gte: pStart, lte: pEnd },
        },
      }),
    ]);

    // 4. Construct Day-by-Day Calendar Model for the Period
    const holidayDatesSet = new Set(
      holidays.map((h: any) => new Date(h.date).toISOString().split('T')[0]),
    );
    const summariesByDate = new Map<string, any>();
    dailySummaries.forEach((s: any) => {
      summariesByDate.set(new Date(s.date).toISOString().split('T')[0], s);
    });

    let officeWorkedDays = 0;
    let wfhDays = 0;
    let officialVisitDays = 0;
    let approvedPaidLeaveDays = 0;
    let approvedUnpaidLeaveDays = 0;
    let holidaysCount = 0;
    let weeklyOffsCount = 0;
    let halfDaysCount = 0;
    let absentDaysCount = 0;
    let missingAttendanceDays = 0;
    let expectedWorkdays = 0;

    // Track source IDs and max updatedAt for late change detection
    const attendanceSummaryIds: string[] = [];
    const leaveRequestIds: string[] = approvedLeaves.map((l: any) => l.id);
    const wfhRequestIds: string[] = approvedWfh.map((w: any) => w.id);
    const officialVisitIds: string[] = approvedVisits.map((v: any) => v.id);
    const holidayIds: string[] = holidays.map((h: any) => h.id);
    const unresolvedExceptionIds: string[] = [
      ...pendingCorrections.map((c: any) => c.id),
      ...attendanceExceptions.map((e: any) => e.id),
    ];

    let maxSourceUpdatedAt = new Date(0);
    const updateMaxTime = (d: Date | null | undefined) => {
      if (d && d.getTime() > maxSourceUpdatedAt.getTime()) {
        maxSourceUpdatedAt = new Date(d);
      }
    };

    dailySummaries.forEach((s: any) => {
      attendanceSummaryIds.push(s.id);
      updateMaxTime(s.updatedAt);
    });
    approvedLeaves.forEach((l: any) => updateMaxTime(l.updatedAt));
    approvedWfh.forEach((w: any) => updateMaxTime(w.updatedAt));
    approvedVisits.forEach((v: any) => updateMaxTime(v.updatedAt));
    pendingCorrections.forEach((c: any) => updateMaxTime(c.updatedAt));

    // Iterate through all days of the period
    const curDate = new Date(pStart);
    while (curDate <= pEnd) {
      const dateStr = curDate.toISOString().split('T')[0];
      const isWithinEligibleWindow = curDate >= eligibleStart && curDate <= eligibleEnd;

      // Determine day of week: JavaScript 0=Sun, 1=Mon, ..., 6=Sat
      // Shift workDays format: 1=Mon, ..., 7=Sun
      const jsDay = curDate.getUTCDay();
      const shiftDayOfWeek = jsDay === 0 ? 7 : jsDay;
      const isWeeklyOff = !workDaysOfWeek.includes(shiftDayOfWeek);
      const isHoliday = holidayDatesSet.has(dateStr);

      if (isWithinEligibleWindow) {
        if (!isWeeklyOff && !isHoliday) {
          expectedWorkdays++;
        }

        // Priority 1: Check Approved Official Visit
        const activeVisit = approvedVisits.find((v: any) => {
          const vs = new Date(v.startDate);
          const ve = new Date(v.endDate);
          return curDate >= vs && curDate <= ve;
        });

        // Priority 2: Check Approved WFH
        const activeWfh = approvedWfh.find((w: any) => {
          const ws = new Date(w.startDate);
          const we = new Date(w.endDate);
          return curDate >= ws && curDate <= we;
        });

        // Priority 3: Check Approved Leave
        const activeLeave = approvedLeaves.find((l: any) => {
          const ls = new Date(l.startDate);
          const le = new Date(l.endDate);
          return curDate >= ls && curDate <= le;
        });

        const dailySummary = summariesByDate.get(dateStr);

        if (activeVisit) {
          // Requirement 9: Do not assume an official visit should reduce pay
          officialVisitDays += 1.0;
        } else if (activeWfh) {
          // Requirement 9: Do not assume that WFH should reduce pay
          if (activeWfh.durationType === 'FIRST_HALF' || activeWfh.durationType === 'SECOND_HALF') {
            wfhDays += 0.5;
            officeWorkedDays += 0.5;
          } else {
            wfhDays += 1.0;
          }
        } else if (activeLeave) {
          const isHalf =
            activeLeave.durationType === 'FIRST_HALF' || activeLeave.durationType === 'SECOND_HALF';
          const leaveUnits = isHalf ? 0.5 : 1.0;

          if (activeLeave.leaveType?.isPaid) {
            approvedPaidLeaveDays += leaveUnits;
          } else {
            approvedUnpaidLeaveDays += leaveUnits;
          }
        } else if (isHoliday) {
          // Requirement 9: Holidays are paid days
          holidaysCount += 1.0;
        } else if (isWeeklyOff) {
          // Requirement 9: Weekly offs are paid days
          weeklyOffsCount += 1.0;
        } else if (dailySummary) {
          // Evaluate canonical daily attendance status
          switch (dailySummary.status) {
            case 'PRESENT':
              officeWorkedDays += 1.0;
              break;
            case 'LATE':
              officeWorkedDays += 1.0;
              break;
            case 'HALF_DAY':
              officeWorkedDays += 0.5;
              halfDaysCount += 0.5;
              // Uncovered half-day absence is treated as unpaid unless covered by leave
              break;
            case 'ABSENT':
              absentDaysCount += 1.0;
              break;
            case 'INCOMPLETE':
            case 'PENDING_REVIEW':
              // Surfaced as exception without automatically docking pay
              warnings.push(`Incomplete/pending attendance session on ${dateStr}`);
              break;
            default:
              officeWorkedDays += 1.0;
              break;
          }
        } else {
          // Requirement 9: "Do not assume that ... missing attendance should reduce pay."
          // Surfaces as missing attendance exception for HR investigation
          missingAttendanceDays++;
          warnings.push(
            `Missing attendance record for scheduled workday ${dateStr}. No automatic pay reduction applied.`,
          );
        }
      } else {
        // Outside eligible employee window (pre-hire or post-termination)
        // Does not add to recognized or paid days
      }

      curDate.setUTCDate(curDate.getUTCDate() + 1);
    }

    const recognizedWorkdays = officeWorkedDays + wfhDays + officialVisitDays;

    // Unresolved exceptions count (corrections, anomalies)
    const unresolvedExceptionCount = pendingCorrections.length + attendanceExceptions.length;

    if (pendingCorrections.length > 0) {
      warnings.push(
        `${pendingCorrections.length} pending attendance correction request(s) require review.`,
      );
    }
    if (attendanceExceptions.length > 0) {
      warnings.push(
        `${attendanceExceptions.length} unresolved attendance exception(s) require review.`,
      );
    }

    // 5. Approved Payroll Eligibility & Proration Rules
    // Only explicitly approved unpaid leave (LOP) and confirmed absent days reduce paid days.
    const uncoveredHalfDayLop = halfDaysCount;
    const lopDays = Math.min(
      eligibleDaysInPeriod,
      Number((approvedUnpaidLeaveDays + absentDaysCount + uncoveredHalfDayLop).toFixed(2)),
    );

    const paidDays = Math.max(0, Number((eligibleDaysInPeriod - lopDays).toFixed(2)));

    // 6. Traceable Cryptographic Source Hash
    const sourceElements = [
      ...attendanceSummaryIds.sort(),
      ...leaveRequestIds.sort(),
      ...wfhRequestIds.sort(),
      ...officialVisitIds.sort(),
      ...holidayIds.sort(),
      ...unresolvedExceptionIds.sort(),
      maxSourceUpdatedAt.toISOString(),
      `eligible:${eligibleDaysInPeriod}`,
      `paid:${paidDays}`,
      `lop:${lopDays}`,
    ].join('|');

    const sourceHash = crypto
      .createHash('sha256')
      .update(sourceElements)
      .digest('hex')
      .substring(0, 16);

    // 7. Overall Payroll Treatment Label
    let treatment = 'STANDARD_ATTENDANCE';
    if (isMidPeriodJoiner) treatment = 'MID_PERIOD_JOINER_PRORATION';
    else if (isMidPeriodLeaver) treatment = 'MID_PERIOD_LEAVER_PRORATION';
    else if (lopDays > 0) treatment = 'LOP_PRORATED';
    else if (wfhDays > 0 || officialVisitDays > 0) treatment = 'REMOTE_AND_FIELD_RECOGNIZED';

    return {
      employeeId,
      employeeCode: employee.employeeCode,
      periodId: period.id,
      startDate: pStart.toISOString(),
      endDate: pEnd.toISOString(),
      totalCalendarDays: period.totalDays,
      eligibleDaysInPeriod,
      joiningDate: employee.joiningDate?.toISOString() || null,
      exitDate: employee.exitDate?.toISOString() || null,
      isMidPeriodJoiner,
      isMidPeriodLeaver,
      expectedWorkdays,
      recognizedWorkdays: Number(recognizedWorkdays.toFixed(2)),
      officeWorkedDays: Number(officeWorkedDays.toFixed(2)),
      wfhDays: Number(wfhDays.toFixed(2)),
      officialVisitDays: Number(officialVisitDays.toFixed(2)),
      approvedPaidLeaveDays: Number(approvedPaidLeaveDays.toFixed(2)),
      approvedUnpaidLeaveDays: Number(approvedUnpaidLeaveDays.toFixed(2)),
      holidays: Number(holidaysCount.toFixed(2)),
      weeklyOffs: Number(weeklyOffsCount.toFixed(2)),
      halfDays: Number(halfDaysCount.toFixed(2)),
      absentDays: Number(absentDaysCount.toFixed(2)),
      unresolvedExceptionCount,
      missingAttendanceDays,
      paidDays,
      lopDays,
      sources: {
        attendanceSummaryIds,
        leaveRequestIds,
        wfhRequestIds,
        officialVisitIds,
        holidayIds,
        shiftId: activeShift?.id || null,
        shiftName: activeShift?.name || null,
        unresolvedExceptionIds,
        sourceHash,
        maxSourceUpdatedAt: maxSourceUpdatedAt.toISOString(),
      },
      warnings,
      isException: unresolvedExceptionCount > 0 || missingAttendanceDays > 0,
      exceptionReason:
        unresolvedExceptionCount > 0
          ? `${unresolvedExceptionCount} pending correction(s) or unresolved exception(s)`
          : missingAttendanceDays > 0
            ? `${missingAttendanceDays} missing attendance day(s) flagged for review`
            : null,
      treatment,
    };
  }

  /**
   * Detects late changes to attendance, leave, WFH, official visits, or corrections
   * that occurred after a payroll run was calculated.
   */
  async detectLateSourceChanges(
    organizationId: string,
    runId: string,
  ): Promise<PayrollLateSourceChangesReportDto> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      include: { period: true },
    });

    if (!run) {
      throw new BadRequestException(`Payroll run ${runId} not found`);
    }

    const snapshots = await this.prisma.employeePayrollSnapshot.findMany({
      where: { payrollRunId: runId, organizationId },
      select: {
        id: true,
        employeeId: true,
        employeeCode: true,
        employeeName: true,
        updatedAt: true,
        calculationInputSnapshot: true,
      },
    });

    const periodStart = new Date(run.period.startDate);
    const periodEnd = new Date(run.period.endDate);
    const changes: PayrollLateSourceChangeDto[] = [];
    const affectedEmployeesSet = new Set<string>();

    for (const snap of snapshots) {
      const snapCalcAt = snap.updatedAt;
      const empId = snap.employeeId;

      // Check for late Attendance updates
      const lateAttendance = await this.prisma.attendanceDailySummary.findMany({
        where: {
          organizationId,
          employeeId: empId,
          date: { gte: periodStart, lte: periodEnd },
          updatedAt: { gt: snapCalcAt },
        },
      });

      lateAttendance.forEach((att: any) => {
        affectedEmployeesSet.add(empId);
        changes.push({
          employeeId: empId,
          employeeCode: snap.employeeCode,
          employeeName: snap.employeeName,
          snapshotId: snap.id,
          calculatedAt: snapCalcAt.toISOString(),
          sourceType: 'ATTENDANCE',
          sourceRecordId: att.id,
          sourceDate: att.date.toISOString(),
          changeDescription: `Attendance daily summary updated (status: ${att.status}, total work minutes: ${att.totalWorkMinutes}) after calculation.`,
          sourceUpdatedAt: att.updatedAt.toISOString(),
        });
      });

      // Check for late Leave updates
      const lateLeaves = await this.prisma.leaveRequest.findMany({
        where: {
          organizationId,
          employeeId: empId,
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
          updatedAt: { gt: snapCalcAt },
        },
      });

      lateLeaves.forEach((lv: any) => {
        affectedEmployeesSet.add(empId);
        changes.push({
          employeeId: empId,
          employeeCode: snap.employeeCode,
          employeeName: snap.employeeName,
          snapshotId: snap.id,
          calculatedAt: snapCalcAt.toISOString(),
          sourceType: 'LEAVE',
          sourceRecordId: lv.id,
          sourceDate: lv.startDate.toISOString(),
          changeDescription: `Leave request updated/approved (status: ${lv.status}, days: ${lv.chargeableDays}) after calculation.`,
          sourceUpdatedAt: lv.updatedAt.toISOString(),
        });
      });

      // Check for late WFH updates
      const lateWfh = await this.prisma.wfhRequest.findMany({
        where: {
          organizationId,
          employeeId: empId,
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
          updatedAt: { gt: snapCalcAt },
        },
      });

      lateWfh.forEach((w: any) => {
        affectedEmployeesSet.add(empId);
        changes.push({
          employeeId: empId,
          employeeCode: snap.employeeCode,
          employeeName: snap.employeeName,
          snapshotId: snap.id,
          calculatedAt: snapCalcAt.toISOString(),
          sourceType: 'WFH',
          sourceRecordId: w.id,
          sourceDate: w.startDate.toISOString(),
          changeDescription: `WFH request updated (status: ${w.status}) after calculation.`,
          sourceUpdatedAt: w.updatedAt.toISOString(),
        });
      });

      // Check for late Official Visits
      const lateVisits = await this.prisma.officialVisit.findMany({
        where: {
          organizationId,
          employeeId: empId,
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
          updatedAt: { gt: snapCalcAt },
        },
      });

      lateVisits.forEach((v: any) => {
        affectedEmployeesSet.add(empId);
        changes.push({
          employeeId: empId,
          employeeCode: snap.employeeCode,
          employeeName: snap.employeeName,
          snapshotId: snap.id,
          calculatedAt: snapCalcAt.toISOString(),
          sourceType: 'OFFICIAL_VISIT',
          sourceRecordId: v.id,
          sourceDate: v.startDate.toISOString(),
          changeDescription: `Official visit updated (status: ${v.status}) after calculation.`,
          sourceUpdatedAt: v.updatedAt.toISOString(),
        });
      });

      // Check for late Attendance Corrections
      const lateCorrections = await this.prisma.attendanceCorrectionRequest.findMany({
        where: {
          organizationId,
          employeeId: empId,
          targetDate: { gte: periodStart, lte: periodEnd },
          updatedAt: { gt: snapCalcAt },
        },
      });

      lateCorrections.forEach((c: any) => {
        affectedEmployeesSet.add(empId);
        changes.push({
          employeeId: empId,
          employeeCode: snap.employeeCode,
          employeeName: snap.employeeName,
          snapshotId: snap.id,
          calculatedAt: snapCalcAt.toISOString(),
          sourceType: 'CORRECTION',
          sourceRecordId: c.id,
          sourceDate: c.date.toISOString(),
          changeDescription: `Attendance correction decision updated (status: ${c.status}) after calculation.`,
          sourceUpdatedAt: c.updatedAt.toISOString(),
        });
      });
    }

    const isRunLockedOrPublished = run.status === 'LOCKED' || run.status === 'PUBLISHED';
    const totalLateChanges = changes.length;

    return {
      runId,
      runStatus: run.status,
      totalLateChanges,
      affectedEmployeesCount: affectedEmployeesSet.size,
      requiresRecalculation: totalLateChanges > 0 && !isRunLockedOrPublished,
      requiresCorrectionRun: totalLateChanges > 0 && isRunLockedOrPublished,
      changes,
    };
  }

  /**
   * Generates a complete Attendance and Leave Payroll Reconciliation report
   * for all employees scoped in a payroll run.
   */
  async getPayrollAttendanceReconciliation(
    organizationId: string,
    runId: string,
  ): Promise<PayrollAttendanceReconciliationResponseDto> {
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
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new BadRequestException(`Payroll run ${runId} not found`);
    }

    const lateReport = await this.detectLateSourceChanges(organizationId, runId);
    const lateChangesMap = new Map<string, number>();
    lateReport.changes.forEach((c: any) => {
      lateChangesMap.set(c.employeeId, (lateChangesMap.get(c.employeeId) || 0) + 1);
    });

    let totalExpected = 0;
    let totalRecognized = 0;
    let totalPaidLeave = 0;
    let totalUnpaidLeave = 0;
    let totalExceptions = 0;

    const items: PayrollAttendanceReconciliationItemDto[] = run.snapshots.map((snap: any) => {
      const snapJson = (snap.calculationInputSnapshot as any) || {};
      const ws: Partial<PayrollWorkSummary> = snapJson.workSummary || {};

      const expectedWorkdays = ws.expectedWorkdays ?? Number(snap.workingDays);
      const recognizedWorkdays =
        ws.recognizedWorkdays ??
        Number(snap.paidDays) - (ws.approvedPaidLeaveDays ?? 0) - (ws.holidays ?? 0);
      const paidLeaveDays = ws.approvedPaidLeaveDays ?? 0;
      const unpaidLeaveDays = ws.approvedUnpaidLeaveDays ?? Number(snap.lopDays);
      const excCount = ws.unresolvedExceptionCount ?? (snap.isException ? 1 : 0);
      const lateCount = lateChangesMap.get(snap.employeeId) || 0;

      totalExpected += expectedWorkdays;
      totalRecognized += recognizedWorkdays;
      totalPaidLeave += paidLeaveDays;
      totalUnpaidLeave += unpaidLeaveDays;
      totalExceptions += excCount;

      return {
        employeeId: snap.employeeId,
        employeeCode: snap.employeeCode,
        employeeName: snap.employeeName,
        departmentName: snap.departmentName,
        calendarDays: Number(snap.calendarDays),
        eligibleDays: ws.eligibleDaysInPeriod ?? Number(snap.calendarDays),
        expectedWorkdays,
        recognizedWorkdays: Math.round(recognizedWorkdays * 100) / 100,
        officeWorkedDays: ws.officeWorkedDays ?? recognizedWorkdays,
        wfhDays: ws.wfhDays ?? 0,
        officialVisitDays: ws.officialVisitDays ?? 0,
        approvedPaidLeaveDays: paidLeaveDays,
        approvedUnpaidLeaveDays: unpaidLeaveDays,
        holidays: ws.holidays ?? 0,
        weeklyOffs: ws.weeklyOffs ?? 0,
        unresolvedExceptions: excCount,
        missingAttendanceDays: ws.missingAttendanceDays ?? 0,
        paidDays: Number(snap.paidDays),
        lopDays: Number(snap.lopDays),
        hasLateChanges: lateCount > 0,
        lateChangesCount: lateCount,
        treatment:
          ws.treatment || (Number(snap.lopDays) > 0 ? 'LOP_PRORATED' : 'STANDARD_ATTENDANCE'),
        warnings: ws.warnings || [],
        isException: snap.isException || excCount > 0 || (ws.missingAttendanceDays ?? 0) > 0,
        exceptionReason: snap.exceptionReason || ws.exceptionReason,
      };
    });

    return {
      runId: run.id,
      periodId: run.periodId,
      year: run.period.year,
      month: run.period.month,
      runStatus: run.status,
      totalEmployees: run.snapshots.length,
      totalExpectedWorkdays: Math.round(totalExpected * 100) / 100,
      totalRecognizedWorkdays: Math.round(totalRecognized * 100) / 100,
      totalPaidLeaveDays: Math.round(totalPaidLeave * 100) / 100,
      totalUnpaidLeaveDays: Math.round(totalUnpaidLeave * 100) / 100,
      totalExceptions,
      lateChangesDetected: lateReport.totalLateChanges,
      items,
    };
  }

  private buildIneligibleWorkSummary(
    employee: any,
    period: any,
    reason: string,
  ): PayrollWorkSummary {
    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      periodId: period.id,
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString(),
      totalCalendarDays: period.totalDays,
      eligibleDaysInPeriod: 0,
      joiningDate: employee.joiningDate?.toISOString() || null,
      exitDate: employee.exitDate?.toISOString() || null,
      isMidPeriodJoiner: false,
      isMidPeriodLeaver: false,
      expectedWorkdays: 0,
      recognizedWorkdays: 0,
      officeWorkedDays: 0,
      wfhDays: 0,
      officialVisitDays: 0,
      approvedPaidLeaveDays: 0,
      approvedUnpaidLeaveDays: 0,
      holidays: 0,
      weeklyOffs: 0,
      halfDays: 0,
      absentDays: 0,
      unresolvedExceptionCount: 0,
      missingAttendanceDays: 0,
      paidDays: 0,
      lopDays: period.totalDays,
      sources: {
        attendanceSummaryIds: [],
        leaveRequestIds: [],
        wfhRequestIds: [],
        officialVisitIds: [],
        holidayIds: [],
        shiftId: null,
        shiftName: null,
        unresolvedExceptionIds: [],
        sourceHash: 'INELIGIBLE',
        maxSourceUpdatedAt: new Date().toISOString(),
      },
      warnings: [reason],
      isException: true,
      exceptionReason: reason,
      treatment: 'INELIGIBLE_FOR_PERIOD',
    };
  }
}
