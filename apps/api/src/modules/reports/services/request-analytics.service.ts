import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { RequestAnalyticsQueryDto } from '../dto/request-analytics-query.dto';
import { Prisma, LeaveRequestStatus, WfhStatus, VisitStatus } from '@prisma/client';

@Injectable()
export class RequestAnalyticsService {
  private readonly logger = new Logger(RequestAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
  ) {}

  /**
   * Resolves permitted employee scope based on user role and reporting hierarchy.
   */
  async resolveScopedEmployeeIds(
    user: AuthenticatedUser,
  ): Promise<{ scopedEmployeeIds: string[] | null; scopeType: 'ORGANIZATION' | 'TEAM' }> {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    const isManager = user.roles.includes('MANAGER');

    if (!isAdminOrHr && !isManager) {
      throw new ForbiddenException(
        'Employees do not have permission to access request analytics reports',
      );
    }

    if (isAdminOrHr) {
      return { scopedEmployeeIds: null, scopeType: 'ORGANIZATION' };
    }

    // Manager role scoping
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
    return {
      scopedEmployeeIds: teamIds.length > 0 ? teamIds : [managerEmp.id],
      scopeType: 'TEAM',
    };
  }

  /**
   * Helper: Calculate working days between two dates excluding weekends (Sat/Sun).
   */
  private calculateWorkingDays(startDate: Date, endDate: Date): number {
    let workingDays = 0;
    const cur = new Date(startDate.getTime());
    while (cur <= endDate) {
      const day = cur.getUTCDay();
      if (day !== 0 && day !== 6) {
        workingDays++;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return workingDays;
  }

  /**
   * Helper: Calculate working hours turnaround between submission and decision.
   * Assuming standard 8 business hours/day (Mon-Fri).
   */
  private calculateWorkingHoursTurnaround(createdAt: Date, decidedAt: Date): number {
    const start = new Date(createdAt.getTime());
    const end = new Date(decidedAt.getTime());
    if (end <= start) return 0;

    const diffCalendarMs = end.getTime() - start.getTime();
    const diffCalendarHours = diffCalendarMs / (1000 * 60 * 60);

    // If decided on the same calendar day, cap to business day length (8 hrs)
    if (start.toISOString().split('T')[0] === end.toISOString().split('T')[0]) {
      return Math.min(8, Math.round(diffCalendarHours * 10) / 10);
    }

    // Otherwise, calculate business days
    const bizDays = this.calculateWorkingDays(start, end);
    return Math.max(1, bizDays * 8);
  }

  /**
   * 1. Approved Leave Utilization by Type & Authoritative Balance Summaries.
   */
  async getLeaveUtilizationReport(user: AuthenticatedUser, query: RequestAnalyticsQueryDto) {
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);

    const today = new Date();
    const year = today.getUTCFullYear();
    const defaultStart = `${year}-01-01`;
    const defaultEnd = today.toISOString().split('T')[0];

    const startDateStr = query.startDate || defaultStart;
    const endDateStr = query.endDate || defaultEnd;
    const startUtc = new Date(`${startDateStr}T00:00:00.000Z`);
    const endUtc = new Date(`${endDateStr}T23:59:59.999Z`);

    // Build leave request where clause
    const where: Prisma.LeaveRequestWhereInput = {
      organizationId: user.organizationId,
      startDate: { lte: endUtc },
      endDate: { gte: startUtc },
    };

    if (scopedEmployeeIds) {
      if (query.employeeId) {
        if (!scopedEmployeeIds.includes(query.employeeId)) {
          throw new ForbiddenException(
            'Requested employee is outside your authorized reporting hierarchy',
          );
        }
        where.employeeId = query.employeeId;
      } else {
        where.employeeId = { in: scopedEmployeeIds };
      }
    } else if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.leaveTypeId) where.leaveTypeId = query.leaveTypeId;
    if (query.status && query.status !== 'ALL') {
      where.status = query.status as LeaveRequestStatus;
    }
    if (query.departmentId || query.branchId) {
      where.employee = {
        employment: {
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
      };
    }

    // Balance accounts query
    const balanceWhere: Prisma.LeaveBalanceAccountWhereInput = {
      organizationId: user.organizationId,
      leaveYear: year,
      ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
    };

    const [allRequests, balanceAccounts] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: {
          leaveType: { select: { id: true, name: true, code: true, color: true } },
          employee: {
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
              employment: {
                select: {
                  department: { select: { id: true, name: true } },
                  branch: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.leaveBalanceAccount.findMany({
        where: balanceWhere,
        include: {
          leaveType: { select: { id: true, name: true, code: true, color: true } },
        },
      }),
    ]);

    // Aggregate Utilization Metrics
    let totalApprovedChargeableDays = 0;
    let totalCalendarDays = 0;
    let totalWorkingDays = 0;
    let totalPendingDays = 0;
    let totalRejectedDays = 0;
    let totalCancelledDays = 0;

    const byTypeMap = new Map<
      string,
      {
        leaveTypeId: string;
        leaveTypeName: string;
        code: string;
        color: string;
        approvedChargeableDays: number;
        calendarDays: number;
        workingDays: number;
        requestCount: number;
        approvedCount: number;
        pendingCount: number;
        cancelledCount: number;
      }
    >();

    const byDeptMap = new Map<
      string,
      { departmentId: string; departmentName: string; approvedDays: number; requestCount: number }
    >();

    for (const req of allRequests) {
      const chgDays = Number(req.chargeableDays);
      const start = req.startDate < startUtc ? startUtc : req.startDate;
      const end = req.endDate > endUtc ? endUtc : req.endDate;
      const calDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      const wrkDays = this.calculateWorkingDays(start, end);

      if (req.status === LeaveRequestStatus.APPROVED) {
        totalApprovedChargeableDays += chgDays;
        totalCalendarDays += calDays;
        totalWorkingDays += wrkDays;
      } else if (req.status === LeaveRequestStatus.SUBMITTED) {
        totalPendingDays += chgDays;
      } else if (req.status === LeaveRequestStatus.REJECTED) {
        totalRejectedDays += chgDays;
      } else if (req.status === LeaveRequestStatus.CANCELLED) {
        totalCancelledDays += chgDays;
      }

      // Group by Leave Type
      let tEntry = byTypeMap.get(req.leaveTypeId);
      if (!tEntry) {
        tEntry = {
          leaveTypeId: req.leaveType.id,
          leaveTypeName: req.leaveType.name,
          code: req.leaveType.code,
          color: req.leaveType.color || '#f59e0b',
          approvedChargeableDays: 0,
          calendarDays: 0,
          workingDays: 0,
          requestCount: 0,
          approvedCount: 0,
          pendingCount: 0,
          cancelledCount: 0,
        };
        byTypeMap.set(req.leaveTypeId, tEntry);
      }
      tEntry.requestCount++;
      if (req.status === LeaveRequestStatus.APPROVED) {
        tEntry.approvedChargeableDays += chgDays;
        tEntry.calendarDays += calDays;
        tEntry.workingDays += wrkDays;
        tEntry.approvedCount++;
      } else if (req.status === LeaveRequestStatus.SUBMITTED) {
        tEntry.pendingCount++;
      } else if (req.status === LeaveRequestStatus.CANCELLED) {
        tEntry.cancelledCount++;
      }

      // Group by Department
      const dept = req.employee?.employment?.department;
      if (dept) {
        let dEntry = byDeptMap.get(dept.id);
        if (!dEntry) {
          dEntry = {
            departmentId: dept.id,
            departmentName: dept.name,
            approvedDays: 0,
            requestCount: 0,
          };
          byDeptMap.set(dept.id, dEntry);
        }
        dEntry.requestCount++;
        if (req.status === LeaveRequestStatus.APPROVED) {
          dEntry.approvedDays += chgDays;
        }
      }
    }

    // Aggregate Authoritative Balance Accounts Summary
    let totalOpeningBalance = 0;
    let totalAccruedBalance = 0;
    let totalAllocatedBalance = 0;
    let totalUsedBalance = 0;
    let totalPendingBalance = 0;
    let totalClosingBalance = 0;

    const balancesByTypeMap = new Map<
      string,
      {
        leaveTypeId: string;
        leaveTypeName: string;
        opening: number;
        accrued: number;
        allocated: number;
        used: number;
        pending: number;
        closing: number;
      }
    >();

    for (const b of balanceAccounts) {
      const op = Number(b.openingBalance);
      const ac = Number(b.accruedBalance);
      const al = Number(b.allocatedBalance);
      const us = Number(b.usedBalance);
      const pe = Number(b.pendingBalance);
      const cl = Number(b.closingBalance);

      totalOpeningBalance += op;
      totalAccruedBalance += ac;
      totalAllocatedBalance += al;
      totalUsedBalance += us;
      totalPendingBalance += pe;
      totalClosingBalance += cl;

      let bEntry = balancesByTypeMap.get(b.leaveTypeId);
      if (!bEntry) {
        bEntry = {
          leaveTypeId: b.leaveTypeId,
          leaveTypeName: b.leaveType.name,
          opening: 0,
          accrued: 0,
          allocated: 0,
          used: 0,
          pending: 0,
          closing: 0,
        };
        balancesByTypeMap.set(b.leaveTypeId, bEntry);
      }
      bEntry.opening += op;
      bEntry.accrued += ac;
      bEntry.allocated += al;
      bEntry.used += us;
      bEntry.pending += pe;
      bEntry.closing += cl;
    }

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
        leaveYear: year,
      },
      utilizationSummary: {
        totalRequests: allRequests.length,
        approvedChargeableDays: Math.round(totalApprovedChargeableDays * 100) / 100,
        calendarDays: totalCalendarDays,
        workingDays: totalWorkingDays,
        pendingChargeableDays: Math.round(totalPendingDays * 100) / 100,
        rejectedChargeableDays: Math.round(totalRejectedDays * 100) / 100,
        cancelledChargeableDays: Math.round(totalCancelledDays * 100) / 100,
      },
      balanceSummary: {
        totalAccounts: balanceAccounts.length,
        totalOpeningBalance: Math.round(totalOpeningBalance * 100) / 100,
        totalAccruedBalance: Math.round(totalAccruedBalance * 100) / 100,
        totalAllocatedBalance: Math.round(totalAllocatedBalance * 100) / 100,
        totalUsedBalance: Math.round(totalUsedBalance * 100) / 100,
        totalPendingBalance: Math.round(totalPendingBalance * 100) / 100,
        totalClosingBalance: Math.round(totalClosingBalance * 100) / 100,
        balancesByType: Array.from(balancesByTypeMap.values()).map((b) => ({
          ...b,
          opening: Math.round(b.opening * 100) / 100,
          accrued: Math.round(b.accrued * 100) / 100,
          allocated: Math.round(b.allocated * 100) / 100,
          used: Math.round(b.used * 100) / 100,
          pending: Math.round(b.pending * 100) / 100,
          closing: Math.round(b.closing * 100) / 100,
        })),
      },
      byLeaveType: Array.from(byTypeMap.values()).map((t) => ({
        ...t,
        approvedChargeableDays: Math.round(t.approvedChargeableDays * 100) / 100,
      })),
      byDepartment: Array.from(byDeptMap.values()).map((d) => ({
        ...d,
        approvedDays: Math.round(d.approvedDays * 100) / 100,
        isSuppressed: scopeType === 'TEAM' && d.requestCount < 5,
      })),
      metadata: {
        scopeType,
        scopedEmployeeCount: scopedEmployeeIds ? scopedEmployeeIds.length : null,
        accountingRule:
          'Pending requests reserve balance without posted balance deduction. Cancelled requests do not count toward utilization.',
      },
    };
  }

  /**
   * 2. Unified Request Volumes, WFH, and Official-Visit Outcomes.
   */
  async getRequestVolumesReport(user: AuthenticatedUser, query: RequestAnalyticsQueryDto) {
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);

    const today = new Date();
    const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const defaultEnd = today.toISOString().split('T')[0];

    const startDateStr = query.startDate || defaultStart;
    const endDateStr = query.endDate || defaultEnd;
    const startUtc = new Date(`${startDateStr}T00:00:00.000Z`);
    const endUtc = new Date(`${endDateStr}T23:59:59.999Z`);

    const baseWhere = {
      organizationId: user.organizationId,
      createdAt: { gte: startUtc, lte: endUtc },
      ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    };

    const reqType = query.requestType || 'ALL';

    // Concurrently fetch requests across Leave, WFH, and Official Visits
    const [leaveRequests, wfhRequests, visitRequests] = await Promise.all([
      reqType === 'ALL' || reqType === 'LEAVE'
        ? this.prisma.leaveRequest.findMany({
            where: {
              ...baseWhere,
              ...(query.status && query.status !== 'ALL'
                ? { status: query.status as LeaveRequestStatus }
                : {}),
            },
            select: {
              id: true,
              status: true,
              chargeableDays: true,
              createdAt: true,
              employee: {
                select: {
                  employment: {
                    select: {
                      department: { select: { id: true, name: true } },
                      branch: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve(
            [] as Array<{
              id: string;
              status: string;
              chargeableDays: any;
              createdAt: Date;
              employee: any;
            }>,
          ),
      reqType === 'ALL' || reqType === 'WFH'
        ? this.prisma.wfhRequest.findMany({
            where: {
              ...baseWhere,
              ...(query.status && query.status !== 'ALL'
                ? { status: query.status as WfhStatus }
                : {}),
            },
            select: {
              id: true,
              status: true,
              startDate: true,
              endDate: true,
              durationType: true,
              createdAt: true,
              employee: {
                select: {
                  employment: {
                    select: {
                      department: { select: { id: true, name: true } },
                      branch: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve(
            [] as Array<{
              id: string;
              status: string;
              startDate: Date;
              endDate: Date;
              durationType: any;
              createdAt: Date;
              employee: any;
            }>,
          ),
      reqType === 'ALL' || reqType === 'OFFICIAL_VISIT'
        ? this.prisma.officialVisit.findMany({
            where: {
              ...baseWhere,
              ...(query.status && query.status !== 'ALL'
                ? { status: query.status as VisitStatus }
                : {}),
            },
            select: {
              id: true,
              status: true,
              expectedDurationDays: true,
              purpose: true,
              createdAt: true,
              destinations: { select: { destinationName: true, isGeofenceRequired: true } },
              employee: {
                select: {
                  employment: {
                    select: {
                      department: { select: { id: true, name: true } },
                      branch: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve(
            [] as Array<{
              id: string;
              status: string;
              expectedDurationDays: number;
              purpose: string;
              createdAt: Date;
              destinations: any[];
              employee: any;
            }>,
          ),
    ]);

    // Compute Summaries for each request category
    const summarizeCategory = (items: Array<{ status: string }>) => {
      let submitted = 0;
      let approved = 0;
      let rejected = 0;
      let cancelled = 0;

      for (const item of items) {
        if (item.status === 'SUBMITTED' || item.status === 'DRAFT') submitted++;
        else if (
          item.status === 'APPROVED' ||
          item.status === 'COMPLETED' ||
          item.status === 'IN_PROGRESS'
        )
          approved++;
        else if (item.status === 'REJECTED') rejected++;
        else if (item.status === 'CANCELLED') cancelled++;
      }

      const total = items.length;
      const decided = approved + rejected;
      const approvalRate = decided > 0 ? Math.round((approved / decided) * 1000) / 10 : 0;
      const cancellationRate = total > 0 ? Math.round((cancelled / total) * 1000) / 10 : 0;

      return {
        total,
        submitted,
        approved,
        rejected,
        cancelled,
        approvalRate,
        cancellationRate,
      };
    };

    const leaveSummary = summarizeCategory(leaveRequests);
    const wfhSummary = summarizeCategory(wfhRequests);
    const visitSummary = summarizeCategory(visitRequests);

    const totalRequests = leaveSummary.total + wfhSummary.total + visitSummary.total;
    const totalApproved = leaveSummary.approved + wfhSummary.approved + visitSummary.approved;
    const totalPending = leaveSummary.submitted + wfhSummary.submitted + visitSummary.submitted;
    const totalDecided =
      totalApproved + leaveSummary.rejected + wfhSummary.rejected + visitSummary.rejected;
    const overallApprovalRate =
      totalDecided > 0 ? Math.round((totalApproved / totalDecided) * 1000) / 10 : 0;

    // Additional WFH Specifics
    let wfhTotalDays = 0;
    for (const w of wfhRequests) {
      if (w.status === 'APPROVED' || w.status === 'COMPLETED') {
        const cal = Math.max(
          1,
          Math.round((w.endDate.getTime() - w.startDate.getTime()) / 86400000) + 1,
        );
        wfhTotalDays += w.durationType === 'FULL_DAY' ? cal : cal * 0.5;
      }
    }

    // Additional Visit Specifics
    let visitTotalDurationDays = 0;
    let destinationsCount = 0;
    for (const v of visitRequests) {
      if (v.status === 'APPROVED' || v.status === 'COMPLETED' || v.status === 'IN_PROGRESS') {
        visitTotalDurationDays += v.expectedDurationDays || 1;
      }
      destinationsCount += v.destinations?.length || 0;
    }

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
      },
      overallSummary: {
        totalRequests,
        totalPending,
        totalApproved,
        totalRejected: leaveSummary.rejected + wfhSummary.rejected + visitSummary.rejected,
        totalCancelled: leaveSummary.cancelled + wfhSummary.cancelled + visitSummary.cancelled,
        overallApprovalRate,
      },
      leaveMetrics: {
        ...leaveSummary,
        totalChargeableDaysRequested:
          Math.round(
            leaveRequests.reduce((acc: number, r: any) => acc + Number(r.chargeableDays || 0), 0) *
              100,
          ) / 100,
      },
      wfhMetrics: {
        ...wfhSummary,
        totalApprovedDays: Math.round(wfhTotalDays * 10) / 10,
      },
      officialVisitMetrics: {
        ...visitSummary,
        totalDurationDays: Math.round(visitTotalDurationDays * 10) / 10,
        destinationsCount,
      },
      metadata: {
        scopeType,
        scopedEmployeeCount: scopedEmployeeIds ? scopedEmployeeIds.length : null,
      },
    };
  }

  /**
   * 3. Pending Request Aging & Approval Turnaround Analysis.
   */
  async getApprovalTurnaroundReport(user: AuthenticatedUser, query: RequestAnalyticsQueryDto) {
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);

    const now = new Date();
    const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const defaultEnd = now.toISOString().split('T')[0];

    const startDateStr = query.startDate || defaultStart;
    const endDateStr = query.endDate || defaultEnd;
    const startUtc = new Date(`${startDateStr}T00:00:00.000Z`);
    const endUtc = new Date(`${endDateStr}T23:59:59.999Z`);

    const baseWhere = {
      organizationId: user.organizationId,
      createdAt: { gte: startUtc, lte: endUtc },
      ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    };

    // Query requests with their approval decision histories
    const [leaveReqs, wfhReqs, visitReqs] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: baseWhere,
        include: {
          approvals: {
            orderBy: { decidedAt: 'desc' },
            select: { id: true, decision: true, decidedAt: true, approverId: true },
          },
          employee: {
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
              employment: { select: { department: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
      this.prisma.wfhRequest.findMany({
        where: baseWhere,
        include: {
          approvals: {
            orderBy: { decidedAt: 'desc' },
            select: { id: true, decision: true, decidedAt: true, approverId: true },
          },
          employee: {
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
              employment: { select: { department: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
      this.prisma.officialVisit.findMany({
        where: baseWhere,
        include: {
          approvals: {
            orderBy: { decidedAt: 'desc' },
            select: { id: true, decision: true, decidedAt: true, approverId: true },
          },
          employee: {
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
              employment: { select: { department: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
    ]);

    // Unify all requests into normalized workflow items
    const allItems: Array<{
      id: string;
      requestType: 'LEAVE' | 'WFH' | 'OFFICIAL_VISIT';
      status: string;
      createdAt: Date;
      decidedAt: Date | null;
      employee: any;
      departmentName: string;
    }> = [
      ...leaveReqs.map((r) => ({
        id: r.id,
        requestType: 'LEAVE' as const,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.approvals[0]?.decidedAt || null,
        employee: r.employee,
        departmentName: r.employee?.employment?.department?.name || 'Unassigned',
      })),
      ...wfhReqs.map((r) => ({
        id: r.id,
        requestType: 'WFH' as const,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.approvals[0]?.decidedAt || null,
        employee: r.employee,
        departmentName: r.employee?.employment?.department?.name || 'Unassigned',
      })),
      ...visitReqs.map((r) => ({
        id: r.id,
        requestType: 'OFFICIAL_VISIT' as const,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.approvals[0]?.decidedAt || null,
        employee: r.employee,
        departmentName: r.employee?.employment?.department?.name || 'Unassigned',
      })),
    ];

    // 1. Pending Aging Calculations
    const pendingBrackets = {
      under24Hours: 0,
      oneToThreeDays: 0,
      fourToSevenDays: 0,
      overSevenDays: 0,
    };
    let totalPendingAgingHours = 0;
    let pendingCount = 0;
    const pendingItems: Array<any> = [];

    // 2. Turnaround Calculations (Decided Requests)
    const turnaroundCalendarHoursList: number[] = [];
    const turnaroundWorkingHoursList: number[] = [];

    for (const item of allItems) {
      if (item.status === 'SUBMITTED' || item.status === 'DRAFT') {
        pendingCount++;
        const ageHours = Math.max(0, (now.getTime() - item.createdAt.getTime()) / (1000 * 60 * 60));
        totalPendingAgingHours += ageHours;

        if (ageHours < 24) pendingBrackets.under24Hours++;
        else if (ageHours <= 72) pendingBrackets.oneToThreeDays++;
        else if (ageHours <= 168) pendingBrackets.fourToSevenDays++;
        else pendingBrackets.overSevenDays++;

        pendingItems.push({
          id: item.id,
          requestType: item.requestType,
          employeeCode: item.employee?.employeeCode,
          displayName: item.employee?.displayName,
          department: item.departmentName,
          submittedAt: item.createdAt.toISOString(),
          ageHours: Math.round(ageHours * 10) / 10,
          ageDays: Math.round((ageHours / 24) * 10) / 10,
          isOverdue: ageHours > 72,
        });
      } else if (item.decidedAt) {
        // Multi-stage approval rule: evaluate single completed request using final decidedAt
        const calHours = Math.max(
          0,
          (item.decidedAt.getTime() - item.createdAt.getTime()) / (1000 * 60 * 60),
        );
        const wrkHours = this.calculateWorkingHoursTurnaround(item.createdAt, item.decidedAt);

        turnaroundCalendarHoursList.push(calHours);
        turnaroundWorkingHoursList.push(wrkHours);
      }
    }

    // Turnaround statistical metrics
    turnaroundCalendarHoursList.sort((a, b) => a - b);
    const countDecided = turnaroundCalendarHoursList.length;

    const avgCalendarHours =
      countDecided > 0
        ? Math.round((turnaroundCalendarHoursList.reduce((a, b) => a + b, 0) / countDecided) * 10) /
          10
        : 0;
    const avgWorkingHours =
      countDecided > 0
        ? Math.round((turnaroundWorkingHoursList.reduce((a, b) => a + b, 0) / countDecided) * 10) /
          10
        : 0;

    const medianCalendarHours =
      countDecided > 0
        ? Math.round(turnaroundCalendarHoursList[Math.floor(countDecided / 2)] * 10) / 10
        : 0;
    const p90CalendarHours =
      countDecided > 0
        ? Math.round(turnaroundCalendarHoursList[Math.floor(countDecided * 0.9)] * 10) / 10
        : 0;

    const fastestTurnaroundHours =
      countDecided > 0 ? Math.round(turnaroundCalendarHoursList[0] * 10) / 10 : 0;
    const slowestTurnaroundHours =
      countDecided > 0 ? Math.round(turnaroundCalendarHoursList[countDecided - 1] * 10) / 10 : 0;

    const avgPendingAgingHours =
      pendingCount > 0 ? Math.round((totalPendingAgingHours / pendingCount) * 10) / 10 : 0;

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
      },
      pendingAging: {
        totalPendingRequests: pendingCount,
        avgPendingAgingHours,
        avgPendingAgingDays: Math.round((avgPendingAgingHours / 24) * 10) / 10,
        brackets: {
          under24Hours: pendingBrackets.under24Hours,
          oneToThreeDays: pendingBrackets.oneToThreeDays,
          fourToSevenDays: pendingBrackets.fourToSevenDays,
          overSevenDays: pendingBrackets.overSevenDays,
        },
        pendingRoster: pendingItems.slice(0, 50),
      },
      turnaroundMetrics: {
        totalDecidedRequests: countDecided,
        avgCalendarHours,
        avgWorkingHours,
        medianCalendarHours,
        p90CalendarHours,
        fastestTurnaroundHours,
        slowestTurnaroundHours,
      },
      metadata: {
        scopeType,
        scopedEmployeeCount: scopedEmployeeIds ? scopedEmployeeIds.length : null,
        methodology:
          'Turnaround is measured from submission to final decision. Multi-stage approvals are counted once per completed request.',
      },
    };
  }
}
