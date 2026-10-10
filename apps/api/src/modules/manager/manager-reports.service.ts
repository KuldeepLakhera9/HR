import { Injectable, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  ManagerTeamAttendanceReportQueryDto,
  ManagerTeamExceptionReportQueryDto,
  ManagerTeamApprovalReportQueryDto,
  ManagerTeamAvailabilityReportQueryDto,
  ReportFormat,
  ReportScope,
} from './dto/manager-reports-query.dto';
import {
  AttendanceDayStatus,
  AttendanceExceptionType,
  AttendanceMode,
  LeaveRequestStatus,
  Prisma,
  VisitStatus,
  WfhStatus,
} from '@prisma/client';
import { getTimezoneParts } from '../attendance/utils/policy-evaluator.util';

export interface ValidatedDateRange {
  startDateStr: string;
  endDateStr: string;
  startUtc: Date;
  endUtc: Date;
  diffDays: number;
}

@Injectable()
export class ManagerReportsService {
  private readonly logger = new Logger(ManagerReportsService.name);
  private static readonly MAX_REPORT_DAYS = 92; // 3 months max to prevent unbounded result sets

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
  ) {}

  /**
   * Enforces manager hierarchy scope and permitted organizational filters.
   * Prevents unauthorized data disclosure through manipulated query parameters.
   */
  async resolveManagerTeamScope(
    user: AuthenticatedUser,
    scope: ReportScope = ReportScope.ALL,
    requestedEmployeeId?: string,
    departmentId?: string,
    branchId?: string,
  ): Promise<{
    managerEmployee: { id: string; displayName: string; employeeCode: string } | null;
    teamMemberIds: string[];
    timezone: string;
  }> {
    // 1. Resolve manager employee record
    const managerEmployee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        displayName: true,
        employeeCode: true,
      },
    });

    const isHrOrAdmin = user.roles.includes('ADMIN') || user.roles.includes('HR');

    if (!managerEmployee && !isHrOrAdmin) {
      throw new ForbiddenException(
        'Access denied: You do not possess an active employee profile to supervise a team.',
      );
    }

    // 2. Resolve organization timezone
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { timezone: true },
    });
    const timezone = org?.timezone || 'Asia/Kolkata';

    // 3. Resolve reporting hierarchy team IDs
    let teamMemberIds: string[] = [];

    if (managerEmployee) {
      if (scope === ReportScope.DIRECT) {
        const directReports = await this.hierarchyService.getDirectReports(
          managerEmployee.id,
          user.organizationId,
        );
        teamMemberIds = directReports.map((e) => e.id);
      } else {
        const hierarchy = await this.hierarchyService.getTeam(
          managerEmployee.id,
          user.organizationId,
        );
        teamMemberIds = hierarchy.allMemberIds;
      }
    } else if (isHrOrAdmin) {
      const allActive = await this.prisma.employee.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { id: true },
        take: 500,
      });
      teamMemberIds = allActive.map((e) => e.id);
    }

    // 4. Validate employeeId scope boundary
    if (requestedEmployeeId) {
      if (!teamMemberIds.includes(requestedEmployeeId)) {
        throw new ForbiddenException(
          'Access denied: The requested employee is outside your authorized reporting hierarchy scope.',
        );
      }
      teamMemberIds = [requestedEmployeeId];
    }

    // 5. Apply permitted organizational filters (department / branch) within team scope
    if ((departmentId || branchId) && teamMemberIds.length > 0) {
      const filtered = await this.prisma.employee.findMany({
        where: {
          id: { in: teamMemberIds },
          organizationId: user.organizationId,
          employment: {
            ...(departmentId && departmentId !== 'ALL' ? { departmentId } : {}),
            ...(branchId && branchId !== 'ALL' ? { branchId } : {}),
          },
        },
        select: { id: true },
      });
      teamMemberIds = filtered.map((e) => e.id);
    }

    return { managerEmployee, teamMemberIds, timezone };
  }

  /**
   * Validates date boundaries, formats, order and bounds.
   * Restricts unreasonable date ranges to prevent DoS and unbounded resource exhaustion.
   */
  validateDateRange(
    timezone: string,
    startDateStr?: string,
    endDateStr?: string,
    maxDays = ManagerReportsService.MAX_REPORT_DAYS,
  ): ValidatedDateRange {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    // Resolve defaults if missing
    const now = new Date();
    const tzNow = getTimezoneParts(now, timezone);
    const todayStr = `${tzNow.year}-${String(tzNow.month).padStart(2, '0')}-${String(tzNow.day).padStart(2, '0')}`;

    // Default start date is 29 days before today (30-day window)
    const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const tzStart = getTimezoneParts(thirtyDaysAgo, timezone);
    const defaultStartStr = `${tzStart.year}-${String(tzStart.month).padStart(2, '0')}-${String(tzStart.day).padStart(2, '0')}`;

    const resolvedStart = startDateStr || defaultStartStr;
    const resolvedEnd = endDateStr || todayStr;

    if (!dateRegex.test(resolvedStart)) {
      throw new BadRequestException(
        `Invalid startDate format '${resolvedStart}'. Expected YYYY-MM-DD.`,
      );
    }
    if (!dateRegex.test(resolvedEnd)) {
      throw new BadRequestException(
        `Invalid endDate format '${resolvedEnd}'. Expected YYYY-MM-DD.`,
      );
    }

    const startYear = parseInt(resolvedStart.slice(0, 4), 10);
    const endYear = parseInt(resolvedEnd.slice(0, 4), 10);
    if (startYear < 2000 || startYear > 2100 || endYear < 2000 || endYear > 2100) {
      throw new BadRequestException('Date year must be within the reasonable window 2000 to 2100.');
    }

    const startUtc = new Date(`${resolvedStart}T00:00:00.000Z`);
    const endUtc = new Date(`${resolvedEnd}T23:59:59.999Z`);

    if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
      throw new BadRequestException('Unparseable calendar date supplied.');
    }

    if (startUtc > endUtc) {
      throw new BadRequestException(
        `startDate (${resolvedStart}) cannot be later than endDate (${resolvedEnd}).`,
      );
    }

    const diffMs = endUtc.getTime() - startUtc.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > maxDays) {
      throw new BadRequestException(
        `Date range exceeds maximum permitted window of ${maxDays} days. Requested: ${diffDays} days.`,
      );
    }

    return {
      startDateStr: resolvedStart,
      endDateStr: resolvedEnd,
      startUtc,
      endUtc,
      diffDays,
    };
  }

  /**
   * Formats 2D string/number table into RFC 4180 compliant CSV string.
   */
  private formatCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
    const escapeCell = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'number') return String(val);
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headerLine = headers.join(',');
    const dataLines = rows.map((row) => row.map(escapeCell).join(','));
    return [headerLine, ...dataLines].join('\n');
  }

  // ===========================================================================
  // 1. TEAM ATTENDANCE REPORT
  // ===========================================================================
  async getTeamAttendanceReport(
    user: AuthenticatedUser,
    query: ManagerTeamAttendanceReportQueryDto,
  ) {
    const { managerEmployee, teamMemberIds, timezone } = await this.resolveManagerTeamScope(
      user,
      query.scope,
      query.employeeId,
      query.departmentId,
      query.branchId,
    );

    const { startDateStr, endDateStr, startUtc, endUtc } = this.validateDateRange(
      timezone,
      query.startDate,
      query.endDate,
    );

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const isCsv = query.format === ReportFormat.CSV;

    // Fast-path: Empty team
    if (teamMemberIds.length === 0) {
      if (isCsv) {
        return {
          success: true,
          data: {
            csv: 'Record ID,Date,Employee Code,Employee Name,Department,Designation,Branch,Status,Attendance Mode,First Check-In,Last Check-Out,Work Hours,Overtime Hours,Late Minutes',
            filename: `team-attendance-report-${startDateStr}-to-${endDateStr}.csv`,
            totalRecords: 0,
          },
        };
      }
      return {
        success: true,
        reportType: 'ATTENDANCE',
        manager: managerEmployee,
        startDate: startDateStr,
        endDate: endDateStr,
        timezone,
        pagination: { page, limit, total: 0, totalPages: 0 },
        aggregations: {
          totalRecords: 0,
          totalWorkHours: 0,
          averageDailyWorkHours: 0,
          totalOvertimeHours: 0,
          totalLateMinutes: 0,
          statusCounts: {},
          modeCounts: {},
        },
        items: [],
      };
    }

    // Build filter clause
    const where: Prisma.AttendanceDailySummaryWhereInput = {
      organizationId: user.organizationId,
      employeeId: { in: teamMemberIds },
      date: { gte: startUtc, lte: endUtc },
    };

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as AttendanceDayStatus;
    }

    if (query.mode && query.mode !== 'ALL') {
      where.primaryAttendanceMode = query.mode as AttendanceMode;
    }

    // Concurrently fetch aggregations and total count (avoiding N+1 and unbounded memory)
    const [aggResult, statusGroups, modeGroups, totalCount] = await Promise.all([
      this.prisma.attendanceDailySummary.aggregate({
        where,
        _sum: {
          totalWorkMinutes: true,
          overtimeMinutes: true,
          lateMinutes: true,
          earlyExitMinutes: true,
        },
        _count: { _all: true },
      }),
      this.prisma.attendanceDailySummary.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.attendanceDailySummary.groupBy({
        by: ['primaryAttendanceMode'],
        where,
        _count: { _all: true },
      }),
      this.prisma.attendanceDailySummary.count({ where }),
    ]);

    const totalRecords = totalCount;
    const totalWorkMinutes = aggResult._sum.totalWorkMinutes || 0;
    const totalOvertimeMinutes = aggResult._sum.overtimeMinutes || 0;
    const totalLateMinutes = aggResult._sum.lateMinutes || 0;

    const totalWorkHours = Math.round((totalWorkMinutes / 60) * 10) / 10;
    const totalOvertimeHours = Math.round((totalOvertimeMinutes / 60) * 10) / 10;
    const averageDailyWorkHours =
      totalRecords > 0 ? Math.round((totalWorkMinutes / totalRecords / 60) * 10) / 10 : 0;

    const statusCounts: Record<string, number> = {};
    for (const group of statusGroups) {
      statusCounts[group.status] = group._count._all;
    }

    const modeCounts: Record<string, number> = {};
    for (const group of modeGroups) {
      modeCounts[group.primaryAttendanceMode] = group._count._all;
    }

    // Data selector fields (authorized, sanitized fields only)
    const selectFields = {
      id: true,
      date: true,
      firstCheckIn: true,
      lastCheckOut: true,
      totalWorkMinutes: true,
      totalBreakMinutes: true,
      lateMinutes: true,
      earlyExitMinutes: true,
      overtimeMinutes: true,
      status: true,
      primaryAttendanceMode: true,
      isCorrected: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          displayName: true,
          employment: {
            select: {
              department: { select: { name: true } },
              designation: { select: { title: true } },
              branch: { select: { name: true } },
            },
          },
        },
      },
      shift: {
        select: {
          name: true,
          startTime: true,
          endTime: true,
        },
      },
    };

    // If CSV export, fetch bounded set (up to 5,000 records)
    if (isCsv) {
      const records = await this.prisma.attendanceDailySummary.findMany({
        where,
        take: 5000,
        orderBy: [{ date: 'desc' }, { employee: { displayName: 'asc' } }],
        select: selectFields,
      });

      const headers = [
        'Record ID',
        'Date',
        'Employee Code',
        'Employee Name',
        'Department',
        'Designation',
        'Branch',
        'Status',
        'Attendance Mode',
        'First Check-In',
        'Last Check-Out',
        'Work Hours',
        'Overtime Hours',
        'Late Minutes',
      ];

      const rows = records.map((r) => [
        r.id,
        r.date.toISOString().split('T')[0],
        r.employee.employeeCode,
        r.employee.displayName,
        r.employee.employment?.department?.name || 'Unassigned',
        r.employee.employment?.designation?.title || 'Unassigned',
        r.employee.employment?.branch?.name || 'Main HQ',
        r.status,
        r.primaryAttendanceMode,
        r.firstCheckIn ? r.firstCheckIn.toISOString() : '-',
        r.lastCheckOut ? r.lastCheckOut.toISOString() : '-',
        Math.round((r.totalWorkMinutes / 60) * 10) / 10,
        Math.round((r.overtimeMinutes / 60) * 10) / 10,
        r.lateMinutes,
      ]);

      const csv = this.formatCsv(headers, rows);
      return {
        success: true,
        data: {
          csv,
          filename: `team-attendance-report-${startDateStr}-to-${endDateStr}.csv`,
          totalRecords: records.length,
        },
      };
    }

    // JSON Paginated View
    const skip = (page - 1) * limit;
    const paginatedRecords = await this.prisma.attendanceDailySummary.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: 'desc' }, { employee: { displayName: 'asc' } }],
      select: selectFields,
    });

    const items = paginatedRecords.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split('T')[0],
      employeeId: r.employee.id,
      employeeCode: r.employee.employeeCode,
      employeeName: r.employee.displayName,
      department: r.employee.employment?.department?.name || 'Unassigned',
      designation: r.employee.employment?.designation?.title || 'Unassigned',
      branch: r.employee.employment?.branch?.name || 'Main HQ',
      status: r.status,
      primaryAttendanceMode: r.primaryAttendanceMode,
      firstCheckIn: r.firstCheckIn ? r.firstCheckIn.toISOString() : null,
      lastCheckOut: r.lastCheckOut ? r.lastCheckOut.toISOString() : null,
      totalWorkMinutes: r.totalWorkMinutes,
      workHours: Math.round((r.totalWorkMinutes / 60) * 10) / 10,
      totalBreakMinutes: r.totalBreakMinutes,
      lateMinutes: r.lateMinutes,
      earlyExitMinutes: r.earlyExitMinutes,
      overtimeMinutes: r.overtimeMinutes,
      isCorrected: r.isCorrected,
      shiftName: r.shift?.name || 'Standard Shift',
    }));

    return {
      success: true,
      reportType: 'ATTENDANCE',
      manager: managerEmployee,
      startDate: startDateStr,
      endDate: endDateStr,
      timezone,
      pagination: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
      aggregations: {
        totalRecords,
        totalWorkHours,
        averageDailyWorkHours,
        totalOvertimeHours,
        totalLateMinutes,
        statusCounts,
        modeCounts,
      },
      items,
    };
  }

  // ===========================================================================
  // 2. TEAM EXCEPTION REPORT
  // ===========================================================================
  async getTeamExceptionReport(user: AuthenticatedUser, query: ManagerTeamExceptionReportQueryDto) {
    const { managerEmployee, teamMemberIds, timezone } = await this.resolveManagerTeamScope(
      user,
      query.scope,
      query.employeeId,
      query.departmentId,
      query.branchId,
    );

    const { startDateStr, endDateStr, startUtc, endUtc } = this.validateDateRange(
      timezone,
      query.startDate,
      query.endDate,
    );

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const isCsv = query.format === ReportFormat.CSV;

    if (teamMemberIds.length === 0) {
      if (isCsv) {
        return {
          success: true,
          data: {
            csv: 'Exception ID,Date,Employee Code,Employee Name,Department,Exception Type,Severity,Status,Resolved At,Resolved By,Resolution Notes',
            filename: `team-exceptions-report-${startDateStr}-to-${endDateStr}.csv`,
            totalRecords: 0,
          },
        };
      }
      return {
        success: true,
        reportType: 'EXCEPTIONS',
        manager: managerEmployee,
        startDate: startDateStr,
        endDate: endDateStr,
        timezone,
        pagination: { page, limit, total: 0, totalPages: 0 },
        aggregations: {
          totalExceptions: 0,
          resolvedCount: 0,
          openCount: 0,
          byType: {},
          bySeverity: {},
          byStatus: {},
        },
        items: [],
      };
    }

    const where: Prisma.AttendanceExceptionWhereInput = {
      organizationId: user.organizationId,
      employeeId: { in: teamMemberIds },
      date: { gte: startUtc, lte: endUtc },
    };

    if (query.exceptionType && query.exceptionType !== 'ALL') {
      where.exceptionType = query.exceptionType as AttendanceExceptionType;
    }

    if (query.severity && query.severity !== 'ALL') {
      where.severity = query.severity;
    }

    if (query.status && query.status !== 'ALL') {
      if (query.status === 'RESOLVED') {
        where.resolved = true;
      } else if (query.status === 'OPEN') {
        where.resolved = false;
      } else {
        where.status = query.status;
      }
    }

    // Parallel Aggregations (bounded, no N+1)
    const [totalExceptions, typeGroups, severityGroups, statusGroups] = await Promise.all([
      this.prisma.attendanceException.count({ where }),
      this.prisma.attendanceException.groupBy({
        by: ['exceptionType'],
        where,
        _count: { _all: true },
      }),
      this.prisma.attendanceException.groupBy({
        by: ['severity'],
        where,
        _count: { _all: true },
      }),
      this.prisma.attendanceException.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ]);

    const byType: Record<string, number> = {};
    for (const g of typeGroups) byType[g.exceptionType] = g._count._all;

    const bySeverity: Record<string, number> = {};
    for (const g of severityGroups) bySeverity[g.severity] = g._count._all;

    const byStatus: Record<string, number> = {};
    let resolvedCount = 0;
    let openCount = 0;
    for (const g of statusGroups) {
      byStatus[g.status] = g._count._all;
      if (g.status === 'RESOLVED') resolvedCount += g._count._all;
      else openCount += g._count._all;
    }

    const selectFields = {
      id: true,
      date: true,
      exceptionType: true,
      severity: true,
      status: true,
      resolved: true,
      resolvedAt: true,
      resolutionNotes: true,
      details: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          displayName: true,
          employment: {
            select: {
              department: { select: { name: true } },
              designation: { select: { title: true } },
            },
          },
        },
      },
      resolvedBy: {
        select: {
          firstName: true,
          lastName: true,
          employeeCode: true,
        },
      },
    };

    if (isCsv) {
      const records = await this.prisma.attendanceException.findMany({
        where,
        take: 5000,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        select: selectFields,
      });

      const headers = [
        'Exception ID',
        'Date',
        'Employee Code',
        'Employee Name',
        'Department',
        'Exception Type',
        'Severity',
        'Status',
        'Resolved At',
        'Resolved By',
        'Resolution Notes',
      ];

      const rows = records.map((r) => [
        r.id,
        r.date.toISOString().split('T')[0],
        r.employee.employeeCode,
        r.employee.displayName,
        r.employee.employment?.department?.name || 'Unassigned',
        r.exceptionType,
        r.severity,
        r.status,
        r.resolvedAt ? r.resolvedAt.toISOString() : '-',
        r.resolvedBy ? `${r.resolvedBy.firstName} ${r.resolvedBy.lastName}` : '-',
        r.resolutionNotes || '-',
      ]);

      const csv = this.formatCsv(headers, rows);
      return {
        success: true,
        data: {
          csv,
          filename: `team-exceptions-report-${startDateStr}-to-${endDateStr}.csv`,
          totalRecords: records.length,
        },
      };
    }

    const skip = (page - 1) * limit;
    const paginatedRecords = await this.prisma.attendanceException.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: selectFields,
    });

    const items = paginatedRecords.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split('T')[0],
      employeeId: r.employee.id,
      employeeCode: r.employee.employeeCode,
      employeeName: r.employee.displayName,
      department: r.employee.employment?.department?.name || 'Unassigned',
      designation: r.employee.employment?.designation?.title || 'Unassigned',
      exceptionType: r.exceptionType,
      severity: r.severity,
      status: r.status,
      resolved: r.resolved,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      resolvedByName: r.resolvedBy ? `${r.resolvedBy.firstName} ${r.resolvedBy.lastName}` : null,
      resolutionNotes: r.resolutionNotes,
      details: r.details,
    }));

    return {
      success: true,
      reportType: 'EXCEPTIONS',
      manager: managerEmployee,
      startDate: startDateStr,
      endDate: endDateStr,
      timezone,
      pagination: {
        page,
        limit,
        total: totalExceptions,
        totalPages: Math.ceil(totalExceptions / limit),
      },
      aggregations: {
        totalExceptions,
        resolvedCount,
        openCount,
        byType,
        bySeverity,
        byStatus,
      },
      items,
    };
  }

  // ===========================================================================
  // 3. TEAM APPROVAL ACTIVITY REPORT
  // ===========================================================================
  async getTeamApprovalReport(user: AuthenticatedUser, query: ManagerTeamApprovalReportQueryDto) {
    const { managerEmployee, teamMemberIds, timezone } = await this.resolveManagerTeamScope(
      user,
      query.scope,
      query.employeeId,
      query.departmentId,
      query.branchId,
    );

    const { startDateStr, endDateStr, startUtc, endUtc } = this.validateDateRange(
      timezone,
      query.startDate,
      query.endDate,
    );

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const isCsv = query.format === ReportFormat.CSV;
    const typeFilter = (query.type || 'ALL').toUpperCase();
    const decisionFilter = (query.decision || 'ALL').toUpperCase();

    if (teamMemberIds.length === 0) {
      if (isCsv) {
        return {
          success: true,
          data: {
            csv: 'Request ID,Type,Employee Code,Employee Name,Department,Designation,Dates,Duration,Status,Decision,Approver,Decided At,Turnaround Hours',
            filename: `team-approvals-report-${startDateStr}-to-${endDateStr}.csv`,
            totalRecords: 0,
          },
        };
      }
      return {
        success: true,
        reportType: 'APPROVALS',
        manager: managerEmployee,
        startDate: startDateStr,
        endDate: endDateStr,
        timezone,
        pagination: { page, limit, total: 0, totalPages: 0 },
        aggregations: {
          totalRequests: 0,
          approvedCount: 0,
          rejectedCount: 0,
          submittedCount: 0,
          cancelledCount: 0,
          leaveCount: 0,
          wfhCount: 0,
          visitCount: 0,
          averageTurnaroundHours: 0,
        },
        items: [],
      };
    }

    // 1. Concurrently fetch matching records for Leave, WFH, and Official Visits
    // Bounded queries per entity type
    const fetchLeaves =
      typeFilter === 'ALL' || typeFilter === 'LEAVE'
        ? this.prisma.leaveRequest.findMany({
            where: {
              organizationId: user.organizationId,
              employeeId: { in: teamMemberIds },
              createdAt: { gte: startUtc, lte: endUtc },
              ...(decisionFilter === 'APPROVED' ? { status: LeaveRequestStatus.APPROVED } : {}),
              ...(decisionFilter === 'REJECTED' ? { status: LeaveRequestStatus.REJECTED } : {}),
            },
            take: 2000,
            select: {
              id: true,
              startDate: true,
              endDate: true,
              chargeableDays: true,
              durationType: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              leaveType: { select: { name: true, code: true } },
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  displayName: true,
                  employment: {
                    select: {
                      department: { select: { name: true } },
                      designation: { select: { title: true } },
                    },
                  },
                },
              },
              approvals: {
                take: 1,
                orderBy: { decidedAt: 'desc' },
                select: {
                  decision: true,
                  comments: true,
                  decidedAt: true,
                  approver: { select: { firstName: true, lastName: true } },
                },
              },
            },
          })
        : Promise.resolve([]);

    const fetchWfh =
      typeFilter === 'ALL' || typeFilter === 'WFH'
        ? this.prisma.wfhRequest.findMany({
            where: {
              organizationId: user.organizationId,
              employeeId: { in: teamMemberIds },
              createdAt: { gte: startUtc, lte: endUtc },
              ...(decisionFilter === 'APPROVED' ? { status: WfhStatus.APPROVED } : {}),
              ...(decisionFilter === 'REJECTED' ? { status: WfhStatus.REJECTED } : {}),
            },
            take: 2000,
            select: {
              id: true,
              startDate: true,
              endDate: true,
              durationType: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  displayName: true,
                  employment: {
                    select: {
                      department: { select: { name: true } },
                      designation: { select: { title: true } },
                    },
                  },
                },
              },
              approvals: {
                take: 1,
                orderBy: { decidedAt: 'desc' },
                select: {
                  decision: true,
                  comments: true,
                  decidedAt: true,
                  approver: { select: { firstName: true, lastName: true } },
                },
              },
            },
          })
        : Promise.resolve([]);

    const fetchVisits =
      typeFilter === 'ALL' || typeFilter === 'VISIT' || typeFilter === 'OFFICIAL_VISIT'
        ? this.prisma.officialVisit.findMany({
            where: {
              organizationId: user.organizationId,
              employeeId: { in: teamMemberIds },
              createdAt: { gte: startUtc, lte: endUtc },
              ...(decisionFilter === 'APPROVED' ? { status: VisitStatus.APPROVED } : {}),
              ...(decisionFilter === 'REJECTED' ? { status: VisitStatus.REJECTED } : {}),
            },
            take: 2000,
            select: {
              id: true,
              startDate: true,
              endDate: true,
              title: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  displayName: true,
                  employment: {
                    select: {
                      department: { select: { name: true } },
                      designation: { select: { title: true } },
                    },
                  },
                },
              },
              approvals: {
                take: 1,
                orderBy: { decidedAt: 'desc' },
                select: {
                  decision: true,
                  comments: true,
                  decidedAt: true,
                  approver: { select: { firstName: true, lastName: true } },
                },
              },
            },
          })
        : Promise.resolve([]);

    const [leaves, wfhs, visits] = await Promise.all([fetchLeaves, fetchWfh, fetchVisits]);

    // Map into unified activity records
    const unifiedList: Array<{
      id: string;
      type: 'LEAVE' | 'WFH' | 'VISIT';
      typeLabel: string;
      requestId: string;
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      department: string;
      designation: string;
      startDate: string;
      endDate: string;
      durationLabel: string;
      status: string;
      submittedAt: string;
      decision: string | null;
      decidedAt: string | null;
      approverName: string | null;
      comments: string | null;
      turnaroundHours: number | null;
      createdAtDate: Date;
    }> = [];

    for (const r of leaves) {
      const approval = r.approvals[0];
      let turnaroundHours: number | null = null;
      if (approval?.decidedAt) {
        const diff = approval.decidedAt.getTime() - r.createdAt.getTime();
        turnaroundHours = Math.max(0, Math.round((diff / (1000 * 60 * 60)) * 10) / 10);
      }
      unifiedList.push({
        id: `LEAVE_${r.id}`,
        type: 'LEAVE',
        typeLabel: `Leave (${r.leaveType.name})`,
        requestId: r.id,
        employeeId: r.employee.id,
        employeeCode: r.employee.employeeCode,
        employeeName: r.employee.displayName,
        department: r.employee.employment?.department?.name || 'Unassigned',
        designation: r.employee.employment?.designation?.title || 'Unassigned',
        startDate: r.startDate.toISOString().split('T')[0],
        endDate: r.endDate.toISOString().split('T')[0],
        durationLabel: `${Number(r.chargeableDays)} day(s)`,
        status: r.status,
        submittedAt: r.createdAt.toISOString(),
        decision: approval ? approval.decision : null,
        decidedAt: approval ? approval.decidedAt.toISOString() : null,
        approverName: approval
          ? `${approval.approver.firstName} ${approval.approver.lastName}`
          : null,
        comments: approval?.comments || null,
        turnaroundHours,
        createdAtDate: r.createdAt,
      });
    }

    for (const r of wfhs) {
      const approval = r.approvals[0];
      let turnaroundHours: number | null = null;
      if (approval?.decidedAt) {
        const diff = approval.decidedAt.getTime() - r.createdAt.getTime();
        turnaroundHours = Math.max(0, Math.round((diff / (1000 * 60 * 60)) * 10) / 10);
      }
      unifiedList.push({
        id: `WFH_${r.id}`,
        type: 'WFH',
        typeLabel: 'Work From Home',
        requestId: r.id,
        employeeId: r.employee.id,
        employeeCode: r.employee.employeeCode,
        employeeName: r.employee.displayName,
        department: r.employee.employment?.department?.name || 'Unassigned',
        designation: r.employee.employment?.designation?.title || 'Unassigned',
        startDate: r.startDate.toISOString().split('T')[0],
        endDate: r.endDate.toISOString().split('T')[0],
        durationLabel: r.durationType.replace('_', ' '),
        status: r.status,
        submittedAt: r.createdAt.toISOString(),
        decision: approval ? approval.decision : null,
        decidedAt: approval ? approval.decidedAt.toISOString() : null,
        approverName: approval
          ? `${approval.approver.firstName} ${approval.approver.lastName}`
          : null,
        comments: approval?.comments || null,
        turnaroundHours,
        createdAtDate: r.createdAt,
      });
    }

    for (const r of visits) {
      const approval = r.approvals[0];
      let turnaroundHours: number | null = null;
      if (approval?.decidedAt) {
        const diff = approval.decidedAt.getTime() - r.createdAt.getTime();
        turnaroundHours = Math.max(0, Math.round((diff / (1000 * 60 * 60)) * 10) / 10);
      }
      unifiedList.push({
        id: `VISIT_${r.id}`,
        type: 'VISIT',
        typeLabel: 'Official Visit',
        requestId: r.id,
        employeeId: r.employee.id,
        employeeCode: r.employee.employeeCode,
        employeeName: r.employee.displayName,
        department: r.employee.employment?.department?.name || 'Unassigned',
        designation: r.employee.employment?.designation?.title || 'Unassigned',
        startDate: r.startDate.toISOString().split('T')[0],
        endDate: r.endDate.toISOString().split('T')[0],
        durationLabel: r.title,
        status: r.status,
        submittedAt: r.createdAt.toISOString(),
        decision: approval ? approval.decision : null,
        decidedAt: approval ? approval.decidedAt.toISOString() : null,
        approverName: approval
          ? `${approval.approver.firstName} ${approval.approver.lastName}`
          : null,
        comments: approval?.comments || null,
        turnaroundHours,
        createdAtDate: r.createdAt,
      });
    }

    // Sort descending by submission date
    unifiedList.sort((a, b) => b.createdAtDate.getTime() - a.createdAtDate.getTime());

    // Compute aggregations across the complete matching set
    const totalRequests = unifiedList.length;
    let approvedCount = 0;
    let rejectedCount = 0;
    let submittedCount = 0;
    let cancelledCount = 0;
    let leaveCount = 0;
    let wfhCount = 0;
    let visitCount = 0;
    let turnaroundSum = 0;
    let decidedCount = 0;

    for (const item of unifiedList) {
      if (item.status === 'APPROVED') approvedCount++;
      else if (item.status === 'REJECTED') rejectedCount++;
      else if (item.status === 'SUBMITTED') submittedCount++;
      else if (item.status === 'CANCELLED') cancelledCount++;

      if (item.type === 'LEAVE') leaveCount++;
      else if (item.type === 'WFH') wfhCount++;
      else if (item.type === 'VISIT') visitCount++;

      if (item.turnaroundHours !== null) {
        turnaroundSum += item.turnaroundHours;
        decidedCount++;
      }
    }

    const averageTurnaroundHours =
      decidedCount > 0 ? Math.round((turnaroundSum / decidedCount) * 10) / 10 : 0;

    if (isCsv) {
      const headers = [
        'Request ID',
        'Type',
        'Employee Code',
        'Employee Name',
        'Department',
        'Designation',
        'Dates',
        'Duration',
        'Status',
        'Decision',
        'Approver',
        'Decided At',
        'Turnaround Hours',
      ];

      const rows = unifiedList.map((r) => [
        r.requestId,
        r.type,
        r.employeeCode,
        r.employeeName,
        r.department,
        r.designation,
        `${r.startDate} to ${r.endDate}`,
        r.durationLabel,
        r.status,
        r.decision || '-',
        r.approverName || '-',
        r.decidedAt || '-',
        r.turnaroundHours !== null ? r.turnaroundHours : '-',
      ]);

      const csv = this.formatCsv(headers, rows);
      return {
        success: true,
        data: {
          csv,
          filename: `team-approvals-report-${startDateStr}-to-${endDateStr}.csv`,
          totalRecords: unifiedList.length,
        },
      };
    }

    const skip = (page - 1) * limit;
    const paginatedItems = unifiedList.slice(skip, skip + limit);

    return {
      success: true,
      reportType: 'APPROVALS',
      manager: managerEmployee,
      startDate: startDateStr,
      endDate: endDateStr,
      timezone,
      pagination: {
        page,
        limit,
        total: totalRequests,
        totalPages: Math.ceil(totalRequests / limit),
      },
      aggregations: {
        totalRequests,
        approvedCount,
        rejectedCount,
        submittedCount,
        cancelledCount,
        leaveCount,
        wfhCount,
        visitCount,
        averageTurnaroundHours,
      },
      items: paginatedItems,
    };
  }

  // ===========================================================================
  // 4. TEAM AVAILABILITY REPORT
  // ===========================================================================
  async getTeamAvailabilityReport(
    user: AuthenticatedUser,
    query: ManagerTeamAvailabilityReportQueryDto,
  ) {
    const { managerEmployee, teamMemberIds, timezone } = await this.resolveManagerTeamScope(
      user,
      query.scope,
      query.employeeId,
      query.departmentId,
      query.branchId,
    );

    const { startDateStr, endDateStr, startUtc, endUtc, diffDays } = this.validateDateRange(
      timezone,
      query.startDate,
      query.endDate,
    );

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const isCsv = query.format === ReportFormat.CSV;
    const minAvailability =
      query.minAvailabilityPct !== undefined ? Number(query.minAvailabilityPct) : null;

    if (teamMemberIds.length === 0) {
      if (isCsv) {
        return {
          success: true,
          data: {
            csv: 'Employee Code,Employee Name,Department,Designation,Branch,Scheduled Days,Office Days,WFH Days,Visit Days,Leave Days,Absent Days,Availability %',
            filename: `team-availability-report-${startDateStr}-to-${endDateStr}.csv`,
            totalRecords: 0,
          },
        };
      }
      return {
        success: true,
        reportType: 'AVAILABILITY',
        manager: managerEmployee,
        startDate: startDateStr,
        endDate: endDateStr,
        timezone,
        pagination: { page, limit, total: 0, totalPages: 0 },
        aggregations: {
          totalTeamMembers: 0,
          averageTeamAvailabilityPct: 0,
          totalScheduledDays: 0,
          totalPresentOfficeDays: 0,
          totalWfhDays: 0,
          totalVisitDays: 0,
          totalLeaveDays: 0,
          totalAbsentDays: 0,
        },
        items: [],
      };
    }

    // 1. Fetch employees in scope
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: teamMemberIds },
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        employeeCode: true,
        displayName: true,
        employment: {
          select: {
            department: { select: { name: true } },
            designation: { select: { title: true } },
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: { displayName: 'asc' },
    });

    // 2. Fetch parallel attendance summaries and approvals for all team members in period (bounded parallel query)
    const [attendanceSummaries, holidays] = await Promise.all([
      this.prisma.attendanceDailySummary.findMany({
        where: {
          organizationId: user.organizationId,
          employeeId: { in: teamMemberIds },
          date: { gte: startUtc, lte: endUtc },
        },
        select: {
          employeeId: true,
          date: true,
          status: true,
          primaryAttendanceMode: true,
        },
      }),
      this.prisma.holiday.count({
        where: {
          organizationId: user.organizationId,
          date: { gte: startUtc, lte: endUtc },
        },
      }),
    ]);

    // Group summaries by employeeId
    const summariesByEmployee = new Map<string, typeof attendanceSummaries>();
    for (const s of attendanceSummaries) {
      if (!summariesByEmployee.has(s.employeeId)) {
        summariesByEmployee.set(s.employeeId, []);
      }
      summariesByEmployee.get(s.employeeId)!.push(s);
    }

    // 3. Compute availability metrics per employee
    const scheduledDaysApproximation = Math.max(1, diffDays - holidays);

    const employeeAvailabilityList = employees.map((emp) => {
      const records = summariesByEmployee.get(emp.id) || [];

      let officeDays = 0;
      let wfhDays = 0;
      let visitDays = 0;
      let leaveDays = 0;
      let absentDays = 0;

      for (const rec of records) {
        if (rec.status === 'ON_LEAVE') {
          leaveDays++;
        } else if (rec.status === 'ABSENT') {
          absentDays++;
        } else if (
          rec.primaryAttendanceMode === 'OFFICE' &&
          (rec.status === 'PRESENT' || rec.status === 'LATE' || rec.status === 'HALF_DAY')
        ) {
          officeDays++;
        } else if (
          rec.primaryAttendanceMode === 'WFH' &&
          (rec.status === 'PRESENT' || rec.status === 'LATE' || rec.status === 'HALF_DAY')
        ) {
          wfhDays++;
        } else if (
          rec.primaryAttendanceMode === 'OFFICIAL_VISIT' &&
          (rec.status === 'PRESENT' || rec.status === 'LATE' || rec.status === 'HALF_DAY')
        ) {
          visitDays++;
        }
      }

      const activeDutyDays = officeDays + wfhDays + visitDays;
      const scheduledDays = Math.max(
        activeDutyDays + leaveDays + absentDays,
        scheduledDaysApproximation,
      );

      const availabilityPct =
        scheduledDays > 0
          ? Math.min(100, Math.round((activeDutyDays / scheduledDays) * 1000) / 10)
          : 100;

      return {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        employeeName: emp.displayName,
        department: emp.employment?.department?.name || 'Unassigned',
        designation: emp.employment?.designation?.title || 'Unassigned',
        branch: emp.employment?.branch?.name || 'Main HQ',
        scheduledDays,
        officeDays,
        wfhDays,
        visitDays,
        leaveDays,
        absentDays,
        availabilityPct,
      };
    });

    // Optional filtering by minAvailabilityPct
    const filteredList =
      minAvailability !== null
        ? employeeAvailabilityList.filter((e) => e.availabilityPct >= minAvailability)
        : employeeAvailabilityList;

    // Aggregations
    const totalTeamMembers = filteredList.length;
    let sumAvailability = 0;
    let totalScheduledDays = 0;
    let totalPresentOfficeDays = 0;
    let totalWfhDays = 0;
    let totalVisitDays = 0;
    let totalLeaveDays = 0;
    let totalAbsentDays = 0;

    for (const e of filteredList) {
      sumAvailability += e.availabilityPct;
      totalScheduledDays += e.scheduledDays;
      totalPresentOfficeDays += e.officeDays;
      totalWfhDays += e.wfhDays;
      totalVisitDays += e.visitDays;
      totalLeaveDays += e.leaveDays;
      totalAbsentDays += e.absentDays;
    }

    const averageTeamAvailabilityPct =
      totalTeamMembers > 0 ? Math.round((sumAvailability / totalTeamMembers) * 10) / 10 : 0;

    if (isCsv) {
      const headers = [
        'Employee Code',
        'Employee Name',
        'Department',
        'Designation',
        'Branch',
        'Scheduled Days',
        'Office Days',
        'WFH Days',
        'Visit Days',
        'Leave Days',
        'Absent Days',
        'Availability %',
      ];

      const rows = filteredList.map((e) => [
        e.employeeCode,
        e.employeeName,
        e.department,
        e.designation,
        e.branch,
        e.scheduledDays,
        e.officeDays,
        e.wfhDays,
        e.visitDays,
        e.leaveDays,
        e.absentDays,
        `${e.availabilityPct}%`,
      ]);

      const csv = this.formatCsv(headers, rows);
      return {
        success: true,
        data: {
          csv,
          filename: `team-availability-report-${startDateStr}-to-${endDateStr}.csv`,
          totalRecords: filteredList.length,
        },
      };
    }

    const skip = (page - 1) * limit;
    const paginatedItems = filteredList.slice(skip, skip + limit);

    return {
      success: true,
      reportType: 'AVAILABILITY',
      manager: managerEmployee,
      startDate: startDateStr,
      endDate: endDateStr,
      timezone,
      pagination: {
        page,
        limit,
        total: totalTeamMembers,
        totalPages: Math.ceil(totalTeamMembers / limit),
      },
      aggregations: {
        totalTeamMembers,
        averageTeamAvailabilityPct,
        totalScheduledDays,
        totalPresentOfficeDays,
        totalWfhDays,
        totalVisitDays,
        totalLeaveDays,
        totalAbsentDays,
      },
      items: paginatedItems,
    };
  }
}
