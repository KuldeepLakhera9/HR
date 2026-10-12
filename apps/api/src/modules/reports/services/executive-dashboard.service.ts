import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { ExecutiveDashboardQueryDto } from '../dto/executive-dashboard-query.dto';
import { ExecutiveDashboardSummaryDto } from '@hrms/types';

@Injectable()
export class ExecutiveDashboardService {
  private readonly logger = new Logger(ExecutiveDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
  ) {}

  /**
   * Generates server-authoritative Executive Dashboard metrics, distributions, and trend data.
   * Enforces strict RBAC and organizational / reporting hierarchy data scoping.
   */
  async getDashboardSummary(
    user: AuthenticatedUser,
    query: ExecutiveDashboardQueryDto,
  ): Promise<{
    summary: ExecutiveDashboardSummaryDto;
    departmentBreakdown: Array<{
      departmentId: string;
      departmentName: string;
      headcount: number;
      percentage: number;
      isSuppressed: boolean;
    }>;
    branchBreakdown: Array<{
      branchId: string;
      branchName: string;
      headcount: number;
      percentage: number;
    }>;
    attendanceTrend: Array<{
      date: string;
      presentCount: number;
      leaveCount: number;
      absentCount: number;
      attendanceRate: number;
    }>;
    metadata: {
      scopeType: 'ORGANIZATION' | 'TEAM';
      appliedDepartmentId: string | null;
      appliedBranchId: string | null;
      filterEmployeeCount: number;
    };
  }> {
    // 1. Role Verification & Scoping
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    const isManager = user.roles.includes('MANAGER');

    if (!isAdminOrHr && !isManager) {
      throw new ForbiddenException(
        'Employees do not have access to the Executive Workforce Dashboard',
      );
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, timezone: true, code: true, name: true },
    });
    const timezone = org?.timezone || 'Asia/Kolkata';

    let scopedEmployeeIds: string[] | null = null;
    let scopeType: 'ORGANIZATION' | 'TEAM' = 'ORGANIZATION';

    if (isManager && !isAdminOrHr) {
      scopeType = 'TEAM';
      const managerEmp = await this.prisma.employee.findFirst({
        where: { userId: user.id, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!managerEmp) {
        throw new ForbiddenException('Manager employee profile not found');
      }
      const teamIds = await this.hierarchyService.getTeamMemberIds(
        managerEmp.id,
        user.organizationId,
      );
      scopedEmployeeIds = teamIds.length > 0 ? teamIds : [managerEmp.id];
    }

    // 2. Date Boundary Normalization
    const now = new Date();
    const asOfDateStr = query.asOfDate || now.toISOString().split('T')[0];
    const asOfUtcEnd = new Date(`${asOfDateStr}T23:59:59.999Z`);

    const defaultStart = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const startDateStr = query.startDate || defaultStart;
    const endDateStr = query.endDate || asOfDateStr;

    const startUtc = new Date(`${startDateStr}T00:00:00.000Z`);
    const endUtc = new Date(`${endDateStr}T23:59:59.999Z`);
    const periodDays = Math.max(
      1,
      Math.round((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    );

    // Common employee where clause for demographic filtering
    const baseEmpWhere: any = {
      organizationId: user.organizationId,
      deletedAt: null,
    };
    if (scopedEmployeeIds) {
      baseEmpWhere.id = { in: scopedEmployeeIds };
    }
    if (query.departmentId) {
      baseEmpWhere.employment = { ...baseEmpWhere.employment, departmentId: query.departmentId };
    }
    if (query.branchId) {
      baseEmpWhere.employment = { ...baseEmpWhere.employment, branchId: query.branchId };
    }

    // 3. Metric 1: Active Headcount Snapshot (M-WF-01)
    const activeHeadcountWhere = {
      ...baseEmpWhere,
      status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
      isActive: true,
      joiningDate: { lte: asOfUtcEnd },
      OR: [{ exitDate: null }, { exitDate: { gt: asOfUtcEnd } }],
    };

    // 3-5. Metrics 1-3 Headcount counts executed concurrently
    const [activeHeadcount, periodJoiners, periodExits, startHeadcount] = await Promise.all([
      // Metric 1: Active Headcount Snapshot (M-WF-01)
      this.prisma.employee.count({
        where: activeHeadcountWhere,
      }),
      // Metric 2: Period Joiners (M-WF-02)
      this.prisma.employee.count({
        where: {
          ...baseEmpWhere,
          joiningDate: { gte: startUtc, lte: endUtc },
        },
      }),
      // Metric 3: Period Exits (M-WF-03)
      this.prisma.employee.count({
        where: {
          ...baseEmpWhere,
          exitDate: { gte: startUtc, lte: endUtc },
          status: { in: ['RESIGNED', 'TERMINATED', 'EXITED'] },
        },
      }),
      // Headcount at start of period for average headcount calculation
      this.prisma.employee.count({
        where: {
          ...baseEmpWhere,
          status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
          isActive: true,
          joiningDate: { lte: startUtc },
          OR: [{ exitDate: null }, { exitDate: { gt: startUtc } }],
        },
      }),
    ]);

    const avgHeadcount = (startHeadcount + activeHeadcount) / 2;
    const annualizedAttritionRate =
      avgHeadcount > 0 && periodDays > 0
        ? Math.round((periodExits / avgHeadcount) * (365.25 / periodDays) * 10000) / 100
        : 0.0;

    // Single resolution for target employees when filtering by scope, department, or branch
    let targetEmployeeIds: string[] | null = null;
    if (scopedEmployeeIds || query.departmentId || query.branchId) {
      const targetEmployees = await this.prisma.employee.findMany({
        where: baseEmpWhere,
        select: { id: true },
      });
      targetEmployeeIds = targetEmployees.map((e) => e.id);
    }

    // 6. Attendance Query Where
    const attendanceWhere: any = {
      organizationId: user.organizationId,
      date: { gte: startUtc, lte: endUtc },
      ...(targetEmployeeIds ? { employeeId: { in: targetEmployeeIds } } : {}),
    };

    // 7. Leave Account Query Where
    const currentYear = new Date(asOfDateStr).getFullYear();
    const leaveAccountWhere: any = {
      organizationId: user.organizationId,
      leaveYear: currentYear,
      ...(targetEmployeeIds ? { employeeId: { in: targetEmployeeIds } } : {}),
    };

    // 8. Workflow Request Query Where (with manager team scope enforcement)
    const decidedWhere: any = {
      organizationId: user.organizationId,
      status: { in: ['APPROVED', 'REJECTED'] },
      updatedAt: { gte: startUtc, lte: endUtc },
      ...(targetEmployeeIds ? { employeeId: { in: targetEmployeeIds } } : {}),
    };

    const pendingWhere: any = {
      organizationId: user.organizationId,
      status: 'SUBMITTED',
      ...(targetEmployeeIds ? { employeeId: { in: targetEmployeeIds } } : {}),
    };

    // Parallel fetch of domain metrics and department/branch active roster
    const [
      attendanceSummaries,
      leaveAccounts,
      decidedLeaves,
      decidedWfh,
      pendingLeaves,
      pendingWfh,
      activeCycle,
      activeEmployees,
    ] = await Promise.all([
      this.prisma.attendanceDailySummary.findMany({
        where: attendanceWhere,
        select: {
          date: true,
          status: true,
          primaryAttendanceMode: true,
          firstCheckIn: true,
          lateMinutes: true,
          totalWorkMinutes: true,
        },
      }),
      this.prisma.leaveBalanceAccount.findMany({
        where: leaveAccountWhere,
        select: { allocatedBalance: true, usedBalance: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: decidedWhere,
        select: { createdAt: true, updatedAt: true },
      }),
      this.prisma.wfhRequest.findMany({
        where: decidedWhere,
        select: { createdAt: true, updatedAt: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: pendingWhere,
        select: { createdAt: true },
      }),
      this.prisma.wfhRequest.findMany({
        where: pendingWhere,
        select: { createdAt: true },
      }),
      this.prisma.reviewCycle.findFirst({
        where: {
          organizationId: user.organizationId,
          status: {
            in: [
              'GOAL_SETTING',
              'SELF_ASSESSMENT',
              'MANAGER_REVIEW',
              'HR_CALIBRATION',
              'FINALIZED',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          participants: {
            select: { id: true, employeeId: true, status: true },
          },
          reviews: {
            select: { id: true, employeeId: true, status: true },
          },
        },
      }),
      this.prisma.employee.findMany({
        where: activeHeadcountWhere,
        select: {
          employment: {
            select: {
              department: { select: { id: true, name: true } },
              branch: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    let presentCount = 0;
    let halfDayCount = 0;
    let leaveCount = 0;
    let holidayCount = 0;
    let weekOffCount = 0;
    let onTimeCheckIns = 0;
    let totalPunches = 0;

    const dailyTrendMap = new Map<
      string,
      { present: number; leave: number; absent: number; totalWorking: number }
    >();

    for (const s of attendanceSummaries) {
      const dayKey = s.date.toISOString().split('T')[0];
      if (!dailyTrendMap.has(dayKey)) {
        dailyTrendMap.set(dayKey, { present: 0, leave: 0, absent: 0, totalWorking: 0 });
      }
      const dayBucket = dailyTrendMap.get(dayKey)!;

      if (s.status === 'PRESENT') {
        presentCount++;
        dayBucket.present += 1;
        dayBucket.totalWorking += 1;
      } else if (s.status === 'HALF_DAY') {
        halfDayCount++;
        dayBucket.present += 0.5;
        dayBucket.totalWorking += 1;
      } else if (s.status === 'ABSENT') {
        dayBucket.absent += 1;
        dayBucket.totalWorking += 1;
      } else if (s.status === 'ON_LEAVE') {
        leaveCount++;
        dayBucket.leave += 1;
      } else if (s.status === 'HOLIDAY') {
        holidayCount++;
      } else if (s.status === 'WEEK_OFF' || s.status === 'WEEKEND_OFF') {
        weekOffCount++;
      }

      if (s.firstCheckIn) {
        totalPunches++;
        if (s.lateMinutes === 0) onTimeCheckIns++;
      }
    }

    const totalEvaluatedDays = attendanceSummaries.length;
    const expectedWorkingDays = totalEvaluatedDays - (holidayCount + weekOffCount + leaveCount);

    const attendanceRate =
      expectedWorkingDays > 0
        ? Math.round(((presentCount + halfDayCount * 0.5) / expectedWorkingDays) * 1000) / 10
        : 0.0;

    const onTimeArrivalRate =
      totalPunches > 0 ? Math.round((onTimeCheckIns / totalPunches) * 1000) / 10 : 0.0;

    // Convert daily trend map to sorted list
    const attendanceTrend = Array.from(dailyTrendMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => {
        const rate =
          d.totalWorking > 0 ? Math.round((d.present / d.totalWorking) * 1000) / 10 : 100.0;
        return {
          date,
          presentCount: Math.round(d.present),
          leaveCount: d.leave,
          absentCount: d.absent,
          attendanceRate: rate,
        };
      });

    // 7. Leave Utilization (M-LV-01)
    const totalAllocated = leaveAccounts.reduce(
      (sum, acc) => sum + Number(acc.allocatedBalance || 0),
      0,
    );
    const totalConsumed = leaveAccounts.reduce((sum, acc) => sum + Number(acc.usedBalance || 0), 0);

    const leaveUtilizationRate =
      totalAllocated > 0 ? Math.round((totalConsumed / totalAllocated) * 1000) / 10 : 0.0;

    // 8. Workflow Approval Turnaround & Backlog (M-WF-01, M-WF-02)
    const allDecided = [...decidedLeaves, ...decidedWfh];
    let totalTatHours = 0;
    for (const d of allDecided) {
      const diffMs = d.updatedAt.getTime() - d.createdAt.getTime();
      totalTatHours += Math.max(0, diffMs / (1000 * 60 * 60));
    }
    const avgApprovalTurnaroundHours =
      allDecided.length > 0 ? Math.round((totalTatHours / allDecided.length) * 10) / 10 : 0.0;

    // Open/Pending Backlog
    const allPending = [...pendingLeaves, ...pendingWfh];
    const pendingCount = allPending.length;

    let slaBreachedPending = 0;
    const nowMs = now.getTime();
    for (const p of allPending) {
      const ageHours = (nowMs - p.createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours >= 48) slaBreachedPending++;
    }
    const slaBreachRatio =
      pendingCount > 0 ? Math.round((slaBreachedPending / pendingCount) * 1000) / 10 : 0.0;

    // 9. Performance Management Metrics (M-PM-01, M-PM-02)
    let cycleCompletionRate = 0.0;
    let overdueAppraisals = 0;

    if (activeCycle) {
      let eligibleParticipants = activeCycle.participants.filter(
        (p) => p.status !== 'EXEMPTED' && p.status !== 'WITHDRAWN',
      );
      if (scopedEmployeeIds) {
        eligibleParticipants = eligibleParticipants.filter((p) =>
          scopedEmployeeIds!.includes(p.employeeId),
        );
      }

      const finalizedReviews = activeCycle.reviews.filter((r) => {
        const matchesScope = scopedEmployeeIds ? scopedEmployeeIds.includes(r.employeeId) : true;
        return r.status === 'FINALIZED' && matchesScope;
      });

      if (eligibleParticipants.length > 0) {
        cycleCompletionRate =
          Math.round((finalizedReviews.length / eligibleParticipants.length) * 1000) / 10;
      }

      // Check overdue against cycle deadline
      const deadline = activeCycle.managerReviewDeadline || activeCycle.finalizationDeadline;
      if (deadline && deadline < now) {
        overdueAppraisals = eligibleParticipants.length - finalizedReviews.length;
      }
    }

    // 10. Department & Branch Distribution (with k-anonymity privacy check)
    const deptCountMap = new Map<string, { name: string; count: number }>();
    const branchCountMap = new Map<string, { name: string; count: number }>();

    for (const emp of activeEmployees) {
      const dept = emp.employment?.department;
      if (dept) {
        const cur = deptCountMap.get(dept.id) || { name: dept.name, count: 0 };
        cur.count++;
        deptCountMap.set(dept.id, cur);
      }
      const br = emp.employment?.branch;
      if (br) {
        const cur = branchCountMap.get(br.id) || { name: br.name, count: 0 };
        cur.count++;
        branchCountMap.set(br.id, cur);
      }
    }

    const totalDeptCount = activeEmployees.length;
    const departmentBreakdown = Array.from(deptCountMap.entries()).map(([id, d]) => {
      // Privacy suppression for cohorts < 5 when manager is viewing
      const isSuppressed = !isAdminOrHr && isManager && d.count > 0 && d.count < 5;
      return {
        departmentId: id,
        departmentName: isSuppressed ? 'Protected Cohort' : d.name,
        headcount: isSuppressed ? 0 : d.count,
        percentage: totalDeptCount > 0 ? Math.round((d.count / totalDeptCount) * 1000) / 10 : 0.0,
        isSuppressed,
      };
    });

    const branchBreakdown = Array.from(branchCountMap.entries()).map(([id, b]) => ({
      branchId: id,
      branchName: b.name,
      headcount: b.count,
      percentage: totalDeptCount > 0 ? Math.round((b.count / totalDeptCount) * 1000) / 10 : 0.0,
    }));

    // 11. Compose Structured KPI Cards
    const summary: ExecutiveDashboardSummaryDto = {
      asOfDate: asOfDateStr,
      timezone,
      dataFreshnessTimestamp: now.toISOString(),
      activeHeadcount: {
        metricId: 'M-WF-01',
        name: 'Active Headcount',
        value: activeHeadcount,
        formattedValue: activeHeadcount.toLocaleString(),
        unit: 'COUNT',
        isCalculable: true,
        asOfTimestamp: asOfUtcEnd.toISOString(),
        drillDownUrl: `/employees?status=ACTIVE`,
      },
      periodJoiners: {
        metricId: 'M-WF-02',
        name: 'Period Joiners',
        value: periodJoiners,
        formattedValue: periodJoiners.toLocaleString(),
        unit: 'COUNT',
        isCalculable: true,
        asOfTimestamp: endUtc.toISOString(),
        drillDownUrl: `/employees?filter=joiners`,
      },
      periodExits: {
        metricId: 'M-WF-03',
        name: 'Period Exits',
        value: periodExits,
        formattedValue: periodExits.toLocaleString(),
        unit: 'COUNT',
        isCalculable: true,
        asOfTimestamp: endUtc.toISOString(),
        drillDownUrl: `/employees?status=EXITED`,
      },
      annualizedAttritionRate: {
        metricId: 'M-WF-03',
        name: 'Annualized Attrition',
        value: annualizedAttritionRate,
        formattedValue: `${annualizedAttritionRate.toFixed(1)}%`,
        unit: 'PERCENTAGE',
        isCalculable: avgHeadcount > 0,
        asOfTimestamp: endUtc.toISOString(),
        drillDownUrl: `/reports?tab=workforce`,
      },
      attendanceRate: {
        metricId: 'M-ATT-01',
        name: 'Attendance Rate',
        value: attendanceRate,
        formattedValue: `${attendanceRate.toFixed(1)}%`,
        unit: 'PERCENTAGE',
        isCalculable: expectedWorkingDays > 0,
        asOfTimestamp: endUtc.toISOString(),
        drillDownUrl: `/attendance?tab=summary`,
      },
      onTimeArrivalRate: {
        metricId: 'M-ATT-02',
        name: 'On-Time Arrival Rate',
        value: onTimeArrivalRate,
        formattedValue: `${onTimeArrivalRate.toFixed(1)}%`,
        unit: 'PERCENTAGE',
        isCalculable: totalPunches > 0,
        asOfTimestamp: endUtc.toISOString(),
        drillDownUrl: `/attendance?filter=punctuality`,
      },
      leaveUtilizationRate: {
        metricId: 'M-LV-01',
        name: 'Leave Utilization',
        value: leaveUtilizationRate,
        formattedValue: `${leaveUtilizationRate.toFixed(1)}%`,
        unit: 'PERCENTAGE',
        isCalculable: totalAllocated > 0,
        asOfTimestamp: endUtc.toISOString(),
        drillDownUrl: `/leave?tab=reports`,
      },
      avgApprovalTurnaroundHours: {
        metricId: 'M-WF-01',
        name: 'Avg Approval TAT',
        value: avgApprovalTurnaroundHours,
        formattedValue: `${avgApprovalTurnaroundHours.toFixed(1)} hrs`,
        unit: 'HOURS',
        isCalculable: allDecided.length > 0,
        asOfTimestamp: endUtc.toISOString(),
        drillDownUrl: `/requests?tab=approvals`,
      },
      pendingApprovalsCount: {
        metricId: 'M-WF-02',
        name: 'Pending Approvals',
        value: pendingCount,
        formattedValue: pendingCount.toLocaleString(),
        unit: 'COUNT',
        isCalculable: true,
        asOfTimestamp: now.toISOString(),
        drillDownUrl: `/requests?filter=pending`,
      },
      slaBreachRatio: {
        metricId: 'M-WF-02',
        name: 'SLA Breach Ratio (>48h)',
        value: slaBreachRatio,
        formattedValue: `${slaBreachRatio.toFixed(1)}%`,
        unit: 'PERCENTAGE',
        isCalculable: pendingCount > 0,
        asOfTimestamp: now.toISOString(),
        drillDownUrl: `/requests?filter=breached`,
      },
      activeReviewCycleCompletionRate: {
        metricId: 'M-PM-01',
        name: 'Review Cycle Completion',
        value: activeCycle ? cycleCompletionRate : null,
        formattedValue: activeCycle ? `${cycleCompletionRate.toFixed(1)}%` : 'No Active Cycle',
        unit: 'PERCENTAGE',
        isCalculable: activeCycle !== null,
        asOfTimestamp: now.toISOString(),
        drillDownUrl: `/progress?tab=dashboards`,
      },
      overdueAppraisalsCount: {
        metricId: 'M-PM-02',
        name: 'Overdue Appraisals',
        value: overdueAppraisals,
        formattedValue: overdueAppraisals.toLocaleString(),
        unit: 'COUNT',
        isCalculable: true,
        asOfTimestamp: now.toISOString(),
        drillDownUrl: `/progress?tab=manager-reviews`,
      },
    };

    return {
      summary,
      departmentBreakdown,
      branchBreakdown,
      attendanceTrend,
      metadata: {
        scopeType,
        appliedDepartmentId: query.departmentId || null,
        appliedBranchId: query.branchId || null,
        filterEmployeeCount: activeHeadcount,
      },
    };
  }
}
