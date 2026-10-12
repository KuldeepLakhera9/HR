import { Injectable, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AttendanceReportingService } from '../../attendance/attendance-reporting.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { DailyAttendanceReportQueryDto } from '../../attendance/dto/daily-attendance-report-query.dto';
import { MonthlyAttendanceReportQueryDto } from '../../attendance/dto/monthly-attendance-report-query.dto';
import {
  WeeklyAttendanceReportQueryDto,
  AttendanceExceptionsReportQueryDto,
} from '../dto/attendance-analytics-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AttendanceAnalyticsService {
  private readonly logger = new Logger(AttendanceAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
    private readonly attendanceReportingService: AttendanceReportingService,
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
        'Employees do not have permission to access attendance analytics reports',
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
   * Helper: Validate date boundaries to prevent unbounded database table scans.
   */
  private validateDateRange(startDate?: string, endDate?: string): void {
    if (startDate && endDate) {
      const s = new Date(startDate).getTime();
      const e = new Date(endDate).getTime();
      if (s > e) {
        throw new BadRequestException('startDate cannot be after endDate');
      }
      const daysDiff = (e - s) / (1000 * 60 * 60 * 24);
      if (daysDiff > 366) {
        throw new BadRequestException('Reporting date range cannot exceed 366 days');
      }
    }
  }

  /**
   * 1. Daily Attendance Report with manager scope enforcement and work mode indicators.
   */
  async getDailyReport(user: AuthenticatedUser, query: DailyAttendanceReportQueryDto) {
    this.validateDateRange(query.startDate, query.endDate);
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);

    // If manager, validate or enforce employee scope
    let effectiveQuery = { ...query };
    if (scopedEmployeeIds) {
      if (query.employeeId) {
        if (!scopedEmployeeIds.includes(query.employeeId)) {
          throw new ForbiddenException(
            'Requested employee is outside your authorized reporting hierarchy',
          );
        }
      } else {
        // If query has no single employee, filter down by manager team scope
        return this.getScopedDailyReport(user.organizationId, scopedEmployeeIds, query, scopeType);
      }
    }

    const report = await this.attendanceReportingService.getDailyReport(
      user.organizationId,
      effectiveQuery,
    );
    return {
      ...report,
      metadata: {
        scopeType,
        scopedEmployeeCount: scopedEmployeeIds ? scopedEmployeeIds.length : null,
      },
    };
  }

  /**
   * Custom daily report fetcher for manager team multi-employee array scoping.
   */
  private async getScopedDailyReport(
    organizationId: string,
    scopedEmployeeIds: string[],
    query: DailyAttendanceReportQueryDto,
    scopeType: 'TEAM' | 'ORGANIZATION',
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const skip = (page - 1) * limit;

    const todayStr = new Date().toISOString().split('T')[0];
    const defaultStartStr = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const startDateStr = query.startDate || defaultStartStr;
    const endDateStr = query.endDate || todayStr;

    const startUtc = new Date(`${startDateStr}T00:00:00.000Z`);
    const endUtc = new Date(`${endDateStr}T23:59:59.999Z`);

    const where: Prisma.AttendanceDailySummaryWhereInput = {
      organizationId,
      employeeId: { in: scopedEmployeeIds },
      date: { gte: startUtc, lte: endUtc },
    };

    if (query.shiftId) where.shiftId = query.shiftId;
    if (query.status && query.status !== 'ALL') {
      const statuses = query.status.split(',').map((s) => s.trim() as any);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (query.branchId || query.departmentId) {
      where.employee = {
        employment: {
          ...(query.branchId ? { branchId: query.branchId } : {}),
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
      };
    }

    const [paginatedRecords, totalCount, allSummaries] = await Promise.all([
      this.prisma.attendanceDailySummary.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
              user: { select: { email: true } },
              employment: {
                select: {
                  branch: { select: { id: true, name: true, code: true } },
                  department: { select: { id: true, name: true, code: true } },
                  designation: { select: { id: true, title: true, code: true } },
                },
              },
            },
          },
          shift: {
            select: {
              id: true,
              name: true,
              code: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      }),
      this.prisma.attendanceDailySummary.count({ where }),
      this.prisma.attendanceDailySummary.findMany({
        where,
        select: {
          date: true,
          status: true,
          primaryAttendanceMode: true,
          totalWorkMinutes: true,
          totalBreakMinutes: true,
          lateMinutes: true,
          earlyExitMinutes: true,
          overtimeMinutes: true,
          employee: {
            select: {
              employment: {
                select: {
                  branch: { select: { id: true, name: true } },
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // Headcount rollups
    const headcount = {
      present: 0,
      late: 0,
      halfDay: 0,
      absent: 0,
      onLeave: 0,
      holiday: 0,
      weekOff: 0,
      incomplete: 0,
      pendingReview: 0,
      notScheduled: 0,
    };
    const byMode = { office: 0, officialVisit: 0, workFromHome: 0, total: 0 };
    let totalWorkMinutes = 0;
    let totalBreakMinutes = 0;
    let totalLateMinutes = 0;
    let totalEarlyExitMinutes = 0;
    let totalOvertimeMinutes = 0;

    const dateMap = new Map<string, any>();
    const deptMap = new Map<string, any>();
    const branchMap = new Map<string, any>();

    for (const r of allSummaries) {
      totalWorkMinutes += r.totalWorkMinutes || 0;
      totalBreakMinutes += r.totalBreakMinutes || 0;
      totalLateMinutes += r.lateMinutes || 0;
      totalEarlyExitMinutes += r.earlyExitMinutes || 0;
      totalOvertimeMinutes += r.overtimeMinutes || 0;

      const m = r.primaryAttendanceMode;
      if (m === 'OFFICIAL_VISIT') byMode.officialVisit++;
      else if (m === 'WFH') byMode.workFromHome++;
      else byMode.office++;
      byMode.total++;

      const st = r.status as string;
      if (st === 'PRESENT') headcount.present++;
      else if (st === 'LATE') headcount.late++;
      else if (st === 'HALF_DAY') headcount.halfDay++;
      else if (st === 'ABSENT') headcount.absent++;
      else if (st === 'ON_LEAVE') headcount.onLeave++;
      else if (st === 'HOLIDAY') headcount.holiday++;
      else if (st === 'WEEK_OFF' || st === 'WEEKEND_OFF') headcount.weekOff++;
      else if (st === 'INCOMPLETE') headcount.incomplete++;
      else if (st === 'PENDING_REVIEW') headcount.pendingReview++;
      else headcount.notScheduled++;

      // Date group
      const dStr = r.date.toISOString().split('T')[0];
      let dAgg = dateMap.get(dStr);
      if (!dAgg) {
        dAgg = {
          date: dStr,
          present: 0,
          late: 0,
          halfDay: 0,
          absent: 0,
          onLeave: 0,
          incomplete: 0,
          workMinutes: 0,
        };
        dateMap.set(dStr, dAgg);
      }
      if (st === 'PRESENT') dAgg.present++;
      else if (st === 'LATE') dAgg.late++;
      else if (st === 'HALF_DAY') dAgg.halfDay++;
      else if (st === 'ABSENT') dAgg.absent++;
      else if (st === 'ON_LEAVE') dAgg.onLeave++;
      else if (st === 'INCOMPLETE') dAgg.incomplete++;
      dAgg.workMinutes += r.totalWorkMinutes || 0;

      // Department group
      const dept = r.employee?.employment?.department;
      if (dept) {
        let deptAgg = deptMap.get(dept.id);
        if (!deptAgg) {
          deptAgg = {
            departmentId: dept.id,
            departmentName: dept.name,
            totalRecords: 0,
            present: 0,
            absent: 0,
            late: 0,
            workMinutes: 0,
          };
          deptMap.set(dept.id, deptAgg);
        }
        deptAgg.totalRecords++;
        if (st === 'PRESENT') deptAgg.present++;
        else if (st === 'LATE') {
          deptAgg.present++;
          deptAgg.late++;
        } else if (st === 'ABSENT') deptAgg.absent++;
        deptAgg.workMinutes += r.totalWorkMinutes || 0;
      }

      // Branch group
      const branch = r.employee?.employment?.branch;
      if (branch) {
        let branchAgg = branchMap.get(branch.id);
        if (!branchAgg) {
          branchAgg = {
            branchId: branch.id,
            branchName: branch.name,
            totalRecords: 0,
            present: 0,
            absent: 0,
            late: 0,
            workMinutes: 0,
          };
          branchMap.set(branch.id, branchAgg);
        }
        branchAgg.totalRecords++;
        if (st === 'PRESENT') branchAgg.present++;
        else if (st === 'LATE') {
          branchAgg.present++;
          branchAgg.late++;
        } else if (st === 'ABSENT') branchAgg.absent++;
        branchAgg.workMinutes += r.totalWorkMinutes || 0;
      }
    }

    const attendedCount = headcount.present + headcount.late + headcount.halfDay;
    const scheduledWorkingDays =
      attendedCount + headcount.absent + headcount.onLeave + headcount.incomplete;
    const totalWorkHours = Math.round((totalWorkMinutes / 60) * 100) / 100;
    const avgWorkHours =
      attendedCount > 0 ? Math.round((totalWorkMinutes / attendedCount / 60) * 100) / 100 : 0;
    const avgLateMinutes =
      headcount.late > 0 ? Math.round((totalLateMinutes / headcount.late) * 10) / 10 : 0;
    const onTimeRate =
      headcount.present + headcount.late > 0
        ? Math.round((headcount.present / (headcount.present + headcount.late)) * 1000) / 10
        : 0;
    const attendanceRate =
      scheduledWorkingDays > 0
        ? Math.round(
            ((headcount.present + headcount.late + headcount.halfDay * 0.5) /
              scheduledWorkingDays) *
              1000,
          ) / 10
        : 0;

    const records = paginatedRecords.map((r) => {
      const workHours = Math.floor((r.totalWorkMinutes || 0) / 60);
      const workMinutes = (r.totalWorkMinutes || 0) % 60;
      return {
        id: r.id,
        date: r.date.toISOString().split('T')[0],
        employee: {
          id: r.employee.id,
          employeeCode: r.employee.employeeCode,
          displayName: r.employee.displayName,
          email: r.employee.user?.email || null,
          department: r.employee.employment?.department?.name || null,
          designation: r.employee.employment?.designation?.title || null,
          branch: r.employee.employment?.branch?.name || null,
        },
        shift: r.shift
          ? {
              id: r.shift.id,
              name: r.shift.name,
              code: r.shift.code,
              timing: `${r.shift.startTime} - ${r.shift.endTime}`,
            }
          : null,
        firstCheckIn: r.firstCheckIn ? r.firstCheckIn.toISOString() : null,
        lastCheckOut: r.lastCheckOut ? r.lastCheckOut.toISOString() : null,
        totalWorkMinutes: r.totalWorkMinutes,
        workHoursFormatted: `${workHours}h ${workMinutes}m`,
        totalBreakMinutes: r.totalBreakMinutes,
        lateMinutes: r.lateMinutes,
        earlyExitMinutes: r.earlyExitMinutes,
        overtimeMinutes: r.overtimeMinutes,
        status: r.status,
        attendanceMode: r.primaryAttendanceMode || 'OFFICE',
        officialVisitId: r.officialVisitId || null,
        wfhRequestId: r.wfhRequestId || null,
        leaveRequestId: r.leaveRequestId || null,
        isCorrected: r.isCorrected,
      };
    });

    const aggregations = {
      byDate: Array.from(dateMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date: d.date,
          present: d.present + d.late,
          late: d.late,
          halfDay: d.halfDay,
          absent: d.absent,
          onLeave: d.onLeave,
          incomplete: d.incomplete,
          totalWorkHours: Math.round((d.workMinutes / 60) * 100) / 100,
          avgWorkHours:
            d.present + d.late + d.halfDay > 0
              ? Math.round((d.workMinutes / (d.present + d.late + d.halfDay) / 60) * 100) / 100
              : 0,
        })),
      byDepartment: Array.from(deptMap.values()).map((d) => ({
        ...d,
        attendanceRate:
          d.totalRecords > 0 ? Math.round((d.present / d.totalRecords) * 1000) / 10 : 0,
        totalWorkHours: Math.round((d.workMinutes / 60) * 100) / 100,
        isSuppressed: d.totalRecords < 5,
      })),
      byBranch: Array.from(branchMap.values()).map((b) => ({
        ...b,
        attendanceRate:
          b.totalRecords > 0 ? Math.round((b.present / b.totalRecords) * 1000) / 10 : 0,
        totalWorkHours: Math.round((b.workMinutes / 60) * 100) / 100,
      })),
      byStatus: Object.entries(headcount).map(([statusKey, count]) => ({
        status: statusKey.toUpperCase(),
        count,
        percentage:
          allSummaries.length > 0 ? Math.round((count / allSummaries.length) * 1000) / 10 : 0,
      })),
    };

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
        totalDays: Math.max(
          1,
          Math.round((endUtc.getTime() - startUtc.getTime()) / (24 * 60 * 60 * 1000)),
        ),
      },
      summary: {
        totalRecords: allSummaries.length,
        headcount,
        workingHours: {
          totalWorkHours,
          totalWorkMinutes,
          totalBreakMinutes,
          totalOvertimeMinutes,
          totalOvertimeHours: Math.round((totalOvertimeMinutes / 60) * 100) / 100,
          totalLateMinutes,
          totalEarlyExitMinutes,
          avgWorkHours,
          avgLateMinutes,
          onTimeRate,
          attendanceRate,
        },
        byMode,
      },
      aggregations,
      records,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      metadata: {
        scopeType,
        scopedEmployeeCount: scopedEmployeeIds.length,
      },
    };
  }

  /**
   * 2. Weekly Attendance Report with 7-day day-of-week matrix, shifts, and indicators.
   */
  async getWeeklyReport(user: AuthenticatedUser, query: WeeklyAttendanceReportQueryDto) {
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { timezone: true },
    });
    const timezone = org?.timezone || 'Asia/Kolkata';

    // Resolve 7-day week window (default: current week starting Monday)
    let startStr = query.startDate;
    if (!startStr) {
      const now = new Date();
      const day = now.getDay(); // 0 is Sunday
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now.setDate(now.getDate() + diffToMonday));
      startStr = monday.toISOString().split('T')[0];
    }

    const startDate = new Date(`${startStr}T00:00:00.000Z`);
    const endDate = query.endDate
      ? new Date(`${query.endDate}T23:59:59.999Z`)
      : new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000 + (24 * 60 * 60 * 1000 - 1));
    const endStr = endDate.toISOString().split('T')[0];

    // Build Prisma query
    const where: Prisma.AttendanceDailySummaryWhereInput = {
      organizationId: user.organizationId,
      date: { gte: startDate, lte: endDate },
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

    if (query.shiftId) where.shiftId = query.shiftId;
    if (query.branchId || query.departmentId) {
      where.employee = {
        employment: {
          ...(query.branchId ? { branchId: query.branchId } : {}),
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
      };
    }

    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where,
      orderBy: [{ date: 'asc' }],
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            displayName: true,
            employment: {
              select: {
                branch: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
                designation: { select: { id: true, title: true } },
              },
            },
          },
        },
        shift: {
          select: {
            id: true,
            name: true,
            code: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    // 1. Day of week breakdown (7 days)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const daysMap = new Map<
      string,
      {
        date: string;
        dayName: string;
        present: number;
        late: number;
        halfDay: number;
        absent: number;
        onLeave: number;
        weekOff: number;
        holiday: number;
        incomplete: number;
        workMinutes: number;
      }
    >();

    // Pre-populate days
    let curDate = new Date(startDate.getTime());
    while (curDate <= endDate) {
      const dStr = curDate.toISOString().split('T')[0];
      const dayName = dayNames[curDate.getUTCDay()];
      daysMap.set(dStr, {
        date: dStr,
        dayName,
        present: 0,
        late: 0,
        halfDay: 0,
        absent: 0,
        onLeave: 0,
        weekOff: 0,
        holiday: 0,
        incomplete: 0,
        workMinutes: 0,
      });
      curDate = new Date(curDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // 2. Shift rollup map
    const shiftMap = new Map<
      string,
      {
        shiftId: string;
        shiftName: string;
        shiftCode: string;
        timings: string;
        scheduled: number;
        present: number;
        late: number;
        halfDay: number;
        workMinutes: number;
      }
    >();

    // 3. Employee weekly rollup map
    const empRollupMap = new Map<
      string,
      {
        employeeId: string;
        employeeCode: string;
        displayName: string;
        department: string;
        branch: string;
        scheduledDays: number;
        presentDays: number;
        lateCount: number;
        halfDays: number;
        absentDays: number;
        leaveDays: number;
        weekOffDays: number;
        holidayDays: number;
        incompleteDays: number;
        workMinutes: number;
        overtimeMinutes: number;
        modeCounts: { office: number; wfh: number; officialVisit: number };
      }
    >();

    let totalScheduledDays = 0;
    let totalPresentDays = 0;
    let totalLateCount = 0;
    let totalHalfDays = 0;
    let totalAbsentDays = 0;
    let totalLeaveDays = 0;
    let totalWeekOffDays = 0;
    let totalHolidayDays = 0;
    let totalIncompleteDays = 0;
    let totalWorkMinutes = 0;
    let totalOvertimeMinutes = 0;

    for (const r of summaries) {
      const dStr = r.date.toISOString().split('T')[0];
      const dayEntry = daysMap.get(dStr);
      const st = r.status as string;

      totalWorkMinutes += r.totalWorkMinutes || 0;
      totalOvertimeMinutes += r.overtimeMinutes || 0;

      if (st === 'PRESENT') {
        totalPresentDays++;
        totalScheduledDays++;
        if (dayEntry) dayEntry.present++;
      } else if (st === 'LATE') {
        totalPresentDays++;
        totalLateCount++;
        totalScheduledDays++;
        if (dayEntry) dayEntry.late++;
      } else if (st === 'HALF_DAY') {
        totalHalfDays++;
        totalScheduledDays++;
        if (dayEntry) dayEntry.halfDay++;
      } else if (st === 'ABSENT') {
        totalAbsentDays++;
        totalScheduledDays++;
        if (dayEntry) dayEntry.absent++;
      } else if (st === 'ON_LEAVE') {
        totalLeaveDays++;
        totalScheduledDays++;
        if (dayEntry) dayEntry.onLeave++;
      } else if (st === 'WEEK_OFF' || st === 'WEEKEND_OFF') {
        totalWeekOffDays++;
        if (dayEntry) dayEntry.weekOff++;
      } else if (st === 'HOLIDAY') {
        totalHolidayDays++;
        if (dayEntry) dayEntry.holiday++;
      } else if (st === 'INCOMPLETE') {
        totalIncompleteDays++;
        totalScheduledDays++;
        if (dayEntry) dayEntry.incomplete++;
      }
      if (dayEntry) dayEntry.workMinutes += r.totalWorkMinutes || 0;

      // Shift grouping
      if (r.shift) {
        let sEntry = shiftMap.get(r.shift.id);
        if (!sEntry) {
          sEntry = {
            shiftId: r.shift.id,
            shiftName: r.shift.name,
            shiftCode: r.shift.code,
            timings: `${r.shift.startTime} - ${r.shift.endTime}`,
            scheduled: 0,
            present: 0,
            late: 0,
            halfDay: 0,
            workMinutes: 0,
          };
          shiftMap.set(r.shift.id, sEntry);
        }
        if (st !== 'WEEK_OFF' && st !== 'WEEKEND_OFF' && st !== 'HOLIDAY') {
          sEntry.scheduled++;
          if (st === 'PRESENT') sEntry.present++;
          else if (st === 'LATE') {
            sEntry.present++;
            sEntry.late++;
          } else if (st === 'HALF_DAY') sEntry.halfDay++;
        }
        sEntry.workMinutes += r.totalWorkMinutes || 0;
      }

      // Employee grouping
      let eEntry = empRollupMap.get(r.employeeId);
      if (!eEntry) {
        eEntry = {
          employeeId: r.employee.id,
          employeeCode: r.employee.employeeCode,
          displayName: r.employee.displayName,
          department: r.employee.employment?.department?.name || 'Unassigned',
          branch: r.employee.employment?.branch?.name || 'Unassigned',
          scheduledDays: 0,
          presentDays: 0,
          lateCount: 0,
          halfDays: 0,
          absentDays: 0,
          leaveDays: 0,
          weekOffDays: 0,
          holidayDays: 0,
          incompleteDays: 0,
          workMinutes: 0,
          overtimeMinutes: 0,
          modeCounts: { office: 0, wfh: 0, officialVisit: 0 },
        };
        empRollupMap.set(r.employeeId, eEntry);
      }
      eEntry.workMinutes += r.totalWorkMinutes || 0;
      eEntry.overtimeMinutes += r.overtimeMinutes || 0;
      if (r.primaryAttendanceMode === 'WFH') eEntry.modeCounts.wfh++;
      else if (r.primaryAttendanceMode === 'OFFICIAL_VISIT') eEntry.modeCounts.officialVisit++;
      else eEntry.modeCounts.office++;

      if (st === 'PRESENT') {
        eEntry.presentDays++;
        eEntry.scheduledDays++;
      } else if (st === 'LATE') {
        eEntry.presentDays++;
        eEntry.lateCount++;
        eEntry.scheduledDays++;
      } else if (st === 'HALF_DAY') {
        eEntry.halfDays++;
        eEntry.scheduledDays++;
      } else if (st === 'ABSENT') {
        eEntry.absentDays++;
        eEntry.scheduledDays++;
      } else if (st === 'ON_LEAVE') {
        eEntry.leaveDays++;
        eEntry.scheduledDays++;
      } else if (st === 'WEEK_OFF' || st === 'WEEKEND_OFF') {
        eEntry.weekOffDays++;
      } else if (st === 'HOLIDAY') {
        eEntry.holidayDays++;
      } else if (st === 'INCOMPLETE') {
        eEntry.incompleteDays++;
        eEntry.scheduledDays++;
      }
    }

    const attendedEquivalent = totalPresentDays + totalHalfDays * 0.5;
    const weeklyAttendanceRate =
      totalScheduledDays > 0
        ? Math.round((attendedEquivalent / totalScheduledDays) * 1000) / 10
        : 0;
    const onTimeRate =
      totalPresentDays > 0
        ? Math.round(((totalPresentDays - totalLateCount) / totalPresentDays) * 1000) / 10
        : 0;

    const byDayOfWeek = Array.from(daysMap.values()).map((d) => {
      const dayAttended = d.present + d.late + d.halfDay * 0.5;
      const dayScheduled = dayAttended + d.absent + d.onLeave + d.incomplete;
      return {
        date: d.date,
        dayName: d.dayName,
        present: d.present,
        late: d.late,
        halfDay: d.halfDay,
        absent: d.absent,
        onLeave: d.onLeave,
        weekOff: d.weekOff,
        holiday: d.holiday,
        incomplete: d.incomplete,
        totalWorkHours: Math.round((d.workMinutes / 60) * 100) / 100,
        attendanceRate: dayScheduled > 0 ? Math.round((dayAttended / dayScheduled) * 1000) / 10 : 0,
      };
    });

    const byShift = Array.from(shiftMap.values()).map((s) => {
      const attended = s.present + s.halfDay * 0.5;
      return {
        ...s,
        totalWorkHours: Math.round((s.workMinutes / 60) * 100) / 100,
        attendanceRate: s.scheduled > 0 ? Math.round((attended / s.scheduled) * 1000) / 10 : 0,
      };
    });

    const employeeSummaries = Array.from(empRollupMap.values()).map((e) => {
      const att = e.presentDays + e.halfDays * 0.5;
      return {
        ...e,
        totalWorkHours: Math.round((e.workMinutes / 60) * 100) / 100,
        totalOvertimeHours: Math.round((e.overtimeMinutes / 60) * 100) / 100,
        attendanceRate: e.scheduledDays > 0 ? Math.round((att / e.scheduledDays) * 1000) / 10 : 0,
      };
    });

    return {
      period: {
        startDate: startStr,
        endDate: endStr,
        timezone,
      },
      summary: {
        totalEmployees: empRollupMap.size,
        totalScheduledDays,
        totalPresentDays,
        totalLateCount,
        totalHalfDays,
        totalAbsentDays,
        totalLeaveDays,
        totalWeekOffDays,
        totalHolidayDays,
        totalIncompleteDays,
        totalWorkHours: Math.round((totalWorkMinutes / 60) * 100) / 100,
        totalOvertimeHours: Math.round((totalOvertimeMinutes / 60) * 100) / 100,
        weeklyAttendanceRate,
        onTimeRate,
      },
      byDayOfWeek,
      byShift,
      employeeSummaries,
      metadata: {
        scopeType,
        scopedEmployeeCount: scopedEmployeeIds ? scopedEmployeeIds.length : null,
        rulesSummary:
          'Attendance Rate denominator excludes Week-Offs and Holidays. Approved leave and half-days accounted per approved dictionary.',
      },
    };
  }

  /**
   * 3. Monthly Attendance Report with manager scope validation.
   */
  async getMonthlyReport(user: AuthenticatedUser, query: MonthlyAttendanceReportQueryDto) {
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);

    if (scopedEmployeeIds && query.employeeId) {
      if (!scopedEmployeeIds.includes(query.employeeId)) {
        throw new ForbiddenException(
          'Requested employee is outside your authorized reporting hierarchy',
        );
      }
    }

    const report = await this.attendanceReportingService.getMonthlyReport(
      user.organizationId,
      query,
    );

    // If manager, filter employeeSummaries strictly to authorized team
    if (scopedEmployeeIds) {
      report.employeeSummaries = report.employeeSummaries.filter((e) =>
        scopedEmployeeIds.includes(e.employee.id),
      );
      report.summary.totalEmployees = report.employeeSummaries.length;
    }

    return {
      ...report,
      metadata: {
        scopeType,
        scopedEmployeeCount: scopedEmployeeIds ? scopedEmployeeIds.length : null,
      },
    };
  }

  /**
   * 4. Supported Late-Arrival, Missing-Check-Out, Geofence, and Exception Reports.
   */
  async getExceptionsReport(user: AuthenticatedUser, query: AttendanceExceptionsReportQueryDto) {
    this.validateDateRange(query.startDate, query.endDate);
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const skip = (page - 1) * limit;

    const todayStr = new Date().toISOString().split('T')[0];
    const defaultStartStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const startDateStr = query.startDate || defaultStartStr;
    const endDateStr = query.endDate || todayStr;

    const startUtc = new Date(`${startDateStr}T00:00:00.000Z`);
    const endUtc = new Date(`${endDateStr}T23:59:59.999Z`);

    const where: Prisma.AttendanceExceptionWhereInput = {
      organizationId: user.organizationId,
      date: { gte: startUtc, lte: endUtc },
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

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }
    if (query.exceptionType) {
      where.exceptionType = query.exceptionType as any;
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.branchId || query.departmentId) {
      where.employee = {
        employment: {
          ...(query.branchId ? { branchId: query.branchId } : {}),
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
      };
    }

    // Also count incomplete daily summaries to distinguish unfinalized incomplete sessions from confirmed exceptions
    const incompleteWhere: Prisma.AttendanceDailySummaryWhereInput = {
      organizationId: user.organizationId,
      date: { gte: startUtc, lte: endUtc },
      status: 'INCOMPLETE',
      ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
    };

    const [exceptions, totalCount, allExceptionsForAgg, incompleteSummariesCount] =
      await Promise.all([
        this.prisma.attendanceException.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                displayName: true,
                employment: {
                  select: {
                    branch: { select: { id: true, name: true } },
                    department: { select: { id: true, name: true } },
                    designation: { select: { id: true, title: true } },
                  },
                },
              },
            },
            resolvedBy: {
              select: { id: true, email: true },
            },
          },
        }),
        this.prisma.attendanceException.count({ where }),
        this.prisma.attendanceException.findMany({
          where,
          select: {
            id: true,
            exceptionType: true,
            severity: true,
            status: true,
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
        }),
        this.prisma.attendanceDailySummary.count({ where: incompleteWhere }),
      ]);

    // Breakdown aggregations
    const typeCountMap = new Map<string, number>();
    const severityCountMap = new Map<string, number>();
    const statusCountMap = new Map<string, number>();
    const deptCountMap = new Map<string, { id: string; name: string; count: number }>();

    for (const ex of allExceptionsForAgg) {
      // Type
      typeCountMap.set(ex.exceptionType, (typeCountMap.get(ex.exceptionType) || 0) + 1);
      // Severity
      severityCountMap.set(ex.severity, (severityCountMap.get(ex.severity) || 0) + 1);
      // Status
      statusCountMap.set(ex.status, (statusCountMap.get(ex.status) || 0) + 1);
      // Dept
      const dept = ex.employee?.employment?.department;
      if (dept) {
        const existing = deptCountMap.get(dept.id);
        if (existing) existing.count++;
        else deptCountMap.set(dept.id, { id: dept.id, name: dept.name, count: 1 });
      }
    }

    const items = exceptions.map((e) => ({
      id: e.id,
      date: e.date.toISOString().split('T')[0],
      employee: {
        id: e.employee.id,
        employeeCode: e.employee.employeeCode,
        displayName: e.employee.displayName,
        department: e.employee.employment?.department?.name || 'Unassigned',
        branch: e.employee.employment?.branch?.name || 'Unassigned',
        designation: e.employee.employment?.designation?.title || 'Unassigned',
      },
      exceptionType: e.exceptionType,
      severity: e.severity,
      status: e.status,
      resolved: e.resolved,
      resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
      resolvedByEmail: e.resolvedBy?.email || null,
      resolutionNotes: e.resolutionNotes || null,
      details: e.details,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
      },
      summary: {
        totalExceptions: totalCount,
        openExceptions: statusCountMap.get('OPEN') || 0,
        resolvedExceptions: statusCountMap.get('RESOLVED') || 0,
        dismissedExceptions: statusCountMap.get('DISMISSED') || 0,
        highSeverityCount: severityCountMap.get('HIGH') || 0,
        unfinalizedIncompleteSessionsCount: incompleteSummariesCount,
      },
      breakdowns: {
        byType: Array.from(typeCountMap.entries()).map(([type, count]) => ({
          type,
          count,
          percentage: totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0,
        })),
        bySeverity: Array.from(severityCountMap.entries()).map(([severity, count]) => ({
          severity,
          count,
          percentage: totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0,
        })),
        byDepartment: Array.from(deptCountMap.values()).map((d) => ({
          ...d,
          isSuppressed: scopeType === 'TEAM' && d.count < 5,
        })),
      },
      items,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      metadata: {
        scopeType,
        scopedEmployeeCount: scopedEmployeeIds ? scopedEmployeeIds.length : null,
        dataIntegrityRule:
          'Incomplete records represent unclosed or unfinalized sessions and are segregated from confirmed policy exceptions.',
      },
    };
  }
}
