import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DailyAttendanceReportFilterDto,
  DailyAttendanceReportResponse,
  DailyAttendanceReportRecord,
  DailyAttendanceReportSummary,
  DailyAttendanceReportAggregations,
  MonthlyAttendanceReportFilterDto,
  MonthlyAttendanceReportResponse,
  MonthlyEmployeeAttendanceSummary,
  MonthlyAttendanceReportSummary,
  MonthlyAttendanceReportAggregations,
  AttendanceDayStatus,
} from '@hrms/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class AttendanceReportingService {
  private readonly logger = new Logger(AttendanceReportingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a scoped Daily Attendance Report with working-hour summaries,
   * status counts, MIS-ready aggregations, and paginated records.
   */
  async getDailyReport(
    organizationId: string,
    query: DailyAttendanceReportFilterDto,
  ): Promise<DailyAttendanceReportResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const skip = (page - 1) * limit;

    // 1. Resolve date boundaries (default: last 30 days up to today)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const defaultStartStr = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const startDateStr = query.startDate || defaultStartStr;
    const endDateStr = query.endDate || todayStr;

    const startUtc = new Date(`${startDateStr}T00:00:00.000Z`);
    const endUtc = new Date(`${endDateStr}T23:59:59.999Z`);

    // 2. Build Prisma Filter Clause
    const where: Prisma.AttendanceDailySummaryWhereInput = {
      organizationId,
      date: {
        gte: startUtc,
        lte: endUtc,
      },
    };

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.shiftId) {
      where.shiftId = query.shiftId;
    }

    if (query.status && query.status !== 'ALL') {
      const statuses = query.status.split(',').map((s) => s.trim() as AttendanceDayStatus);
      if (statuses.length === 1) {
        where.status = statuses[0];
      } else {
        where.status = { in: statuses };
      }
    }

    if (query.branchId || query.departmentId) {
      where.employee = {
        employment: {
          ...(query.branchId ? { branchId: query.branchId } : {}),
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
      };
    }

    // 3. Concurrently fetch:
    //    a) Paginated records with employee and shift details
    //    b) Total record count for pagination
    //    c) All matching summaries for aggregate calculations (selecting only numeric/grouping fields for speed)
    const [paginatedRecords, totalCount, aggregateData] = await Promise.all([
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
                  branchId: true,
                  branch: { select: { id: true, name: true, code: true } },
                  departmentId: true,
                  department: { select: { id: true, name: true, code: true } },
                  designationId: true,
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
          id: true,
          date: true,
          status: true,
          totalWorkMinutes: true,
          totalBreakMinutes: true,
          lateMinutes: true,
          earlyExitMinutes: true,
          overtimeMinutes: true,
          employee: {
            select: {
              employment: {
                select: {
                  branchId: true,
                  branch: { select: { id: true, name: true } },
                  departmentId: true,
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // 4. Compute Comprehensive Summary Aggregates
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

    let totalWorkMinutes = 0;
    let totalBreakMinutes = 0;
    let totalLateMinutes = 0;
    let totalEarlyExitMinutes = 0;
    let totalOvertimeMinutes = 0;

    // Aggregation maps
    const dateMap = new Map<
      string,
      {
        present: number;
        late: number;
        halfDay: number;
        absent: number;
        onLeave: number;
        incomplete: number;
        workMinutes: number;
      }
    >();

    const deptMap = new Map<
      string,
      {
        name: string;
        total: number;
        present: number;
        absent: number;
        late: number;
        halfDay: number;
        workMinutes: number;
      }
    >();

    const branchMap = new Map<
      string,
      {
        name: string;
        total: number;
        present: number;
        absent: number;
        late: number;
        halfDay: number;
        workMinutes: number;
      }
    >();

    const statusMap = new Map<string, number>();

    for (const record of aggregateData) {
      const st = record.status;
      statusMap.set(st, (statusMap.get(st) || 0) + 1);

      totalWorkMinutes += record.totalWorkMinutes || 0;
      totalBreakMinutes += record.totalBreakMinutes || 0;
      totalLateMinutes += record.lateMinutes || 0;
      totalEarlyExitMinutes += record.earlyExitMinutes || 0;
      totalOvertimeMinutes += record.overtimeMinutes || 0;

      // Classify headcount metrics
      switch (st) {
        case 'PRESENT':
          headcount.present++;
          break;
        case 'LATE':
          headcount.late++;
          break;
        case 'HALF_DAY':
          headcount.halfDay++;
          break;
        case 'ABSENT':
          headcount.absent++;
          break;
        case 'ON_LEAVE':
          headcount.onLeave++;
          break;
        case 'HOLIDAY':
          headcount.holiday++;
          break;
        case 'WEEK_OFF':
        case 'WEEKEND_OFF':
          headcount.weekOff++;
          break;
        case 'INCOMPLETE':
          headcount.incomplete++;
          break;
        case 'PENDING_REVIEW':
          headcount.pendingReview++;
          break;
        default:
          headcount.notScheduled++;
          break;
      }

      // Group by Date
      const dStr = record.date.toISOString().split('T')[0];
      let dAgg = dateMap.get(dStr);
      if (!dAgg) {
        dAgg = {
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
      dAgg.workMinutes += record.totalWorkMinutes || 0;

      // Group by Department
      const dept = record.employee?.employment?.department;
      const deptId = dept?.id || record.employee?.employment?.departmentId;
      if (dept && deptId) {
        let deptAgg = deptMap.get(deptId);
        if (!deptAgg) {
          deptAgg = {
            name: dept.name,
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            halfDay: 0,
            workMinutes: 0,
          };
          deptMap.set(deptId, deptAgg);
        }
        deptAgg.total++;
        if (st === 'PRESENT') deptAgg.present++;
        else if (st === 'LATE') {
          deptAgg.present++;
          deptAgg.late++;
        } else if (st === 'HALF_DAY') deptAgg.halfDay++;
        else if (st === 'ABSENT') deptAgg.absent++;
        deptAgg.workMinutes += record.totalWorkMinutes || 0;
      }

      // Group by Branch
      const branch = record.employee?.employment?.branch;
      const branchId = branch?.id || record.employee?.employment?.branchId;
      if (branch && branchId) {
        let branchAgg = branchMap.get(branchId);
        if (!branchAgg) {
          branchAgg = {
            name: branch.name,
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            halfDay: 0,
            workMinutes: 0,
          };
          branchMap.set(branchId, branchAgg);
        }
        branchAgg.total++;
        if (st === 'PRESENT') branchAgg.present++;
        else if (st === 'LATE') {
          branchAgg.present++;
          branchAgg.late++;
        } else if (st === 'HALF_DAY') branchAgg.halfDay++;
        else if (st === 'ABSENT') branchAgg.absent++;
        branchAgg.workMinutes += record.totalWorkMinutes || 0;
      }
    }

    // Working hours & KPI calculations
    const attendedCount = headcount.present + headcount.late + headcount.halfDay;
    const scheduledWorkingDays =
      attendedCount + headcount.absent + headcount.onLeave + headcount.incomplete;

    const totalWorkHours = Math.round((totalWorkMinutes / 60) * 100) / 100;
    const totalOvertimeHours = Math.round((totalOvertimeMinutes / 60) * 100) / 100;
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

    const summary: DailyAttendanceReportSummary = {
      totalRecords: aggregateData.length,
      headcount,
      workingHours: {
        totalWorkHours,
        totalWorkMinutes,
        totalBreakMinutes,
        totalOvertimeMinutes,
        totalOvertimeHours,
        totalLateMinutes,
        totalEarlyExitMinutes,
        avgWorkHours,
        avgLateMinutes,
        onTimeRate,
        attendanceRate,
      },
    };

    // Build MIS chart aggregations
    const aggregations: DailyAttendanceReportAggregations = {
      byDate: Array.from(dateMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, d]) => {
          const attended = d.present + d.late + d.halfDay;
          return {
            date,
            present: d.present + d.late,
            late: d.late,
            halfDay: d.halfDay,
            absent: d.absent,
            onLeave: d.onLeave,
            incomplete: d.incomplete,
            totalWorkHours: Math.round((d.workMinutes / 60) * 100) / 100,
            avgWorkHours:
              attended > 0 ? Math.round((d.workMinutes / attended / 60) * 100) / 100 : 0,
          };
        }),
      byDepartment: Array.from(deptMap.entries()).map(([deptId, d]) => {
        const attended = d.present + d.halfDay * 0.5;
        return {
          departmentId: deptId,
          departmentName: d.name,
          totalRecords: d.total,
          present: d.present,
          absent: d.absent,
          late: d.late,
          attendanceRate: d.total > 0 ? Math.round((attended / d.total) * 1000) / 10 : 0,
          totalWorkHours: Math.round((d.workMinutes / 60) * 100) / 100,
        };
      }),
      byBranch: Array.from(branchMap.entries()).map(([branchId, b]) => {
        const attended = b.present + b.halfDay * 0.5;
        return {
          branchId,
          branchName: b.name,
          totalRecords: b.total,
          present: b.present,
          absent: b.absent,
          late: b.late,
          attendanceRate: b.total > 0 ? Math.round((attended / b.total) * 1000) / 10 : 0,
          totalWorkHours: Math.round((b.workMinutes / 60) * 100) / 100,
        };
      }),
      byStatus: Array.from(statusMap.entries()).map(([status, count]) => ({
        status,
        count,
        percentage:
          aggregateData.length > 0 ? Math.round((count / aggregateData.length) * 1000) / 10 : 0,
      })),
    };

    // Format individual records
    const records: DailyAttendanceReportRecord[] = paginatedRecords.map((r: any) => {
      const emp = r.employee;
      const h = Math.floor(r.totalWorkMinutes / 60);
      const m = r.totalWorkMinutes % 60;
      return {
        id: r.id,
        date: r.date.toISOString().split('T')[0],
        employee: {
          id: emp.id,
          employeeCode: emp.employeeCode,
          displayName: emp.displayName,
          email: emp.user?.email || null,
          department: emp.employment?.department?.name || null,
          designation: emp.employment?.designation?.title || null,
          branch: emp.employment?.branch?.name || null,
        },
        shift: r.shift
          ? {
              id: r.shift.id,
              name: r.shift.name,
              code: r.shift.code,
              startTime: r.shift.startTime,
              endTime: r.shift.endTime,
            }
          : null,
        firstCheckIn: r.firstCheckIn ? r.firstCheckIn.toISOString() : null,
        lastCheckOut: r.lastCheckOut ? r.lastCheckOut.toISOString() : null,
        totalWorkMinutes: r.totalWorkMinutes,
        workHoursFormatted: `${h}h ${m}m`,
        totalBreakMinutes: r.totalBreakMinutes,
        lateMinutes: r.lateMinutes,
        earlyExitMinutes: r.earlyExitMinutes,
        overtimeMinutes: r.overtimeMinutes,
        status: r.status,
        isCorrected: r.isCorrected,
      };
    });

    const diffDays = Math.max(
      1,
      Math.round((endUtc.getTime() - startUtc.getTime()) / (24 * 60 * 60 * 1000)),
    );

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
        totalDays: diffDays,
      },
      summary,
      aggregations,
      records,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  }

  /**
   * Generates a scoped Monthly Attendance Report with monthly employee rollups,
   * working days calculations, department/branch breakdowns, and MIS daily trends.
   */
  async getMonthlyReport(
    organizationId: string,
    query: MonthlyAttendanceReportFilterDto,
  ): Promise<MonthlyAttendanceReportResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const skip = (page - 1) * limit;

    const now = new Date();
    const year = Number(query.year) || now.getUTCFullYear();
    const month = Number(query.month) || now.getUTCMonth() + 1; // 1-indexed

    // Calculate month boundaries in UTC
    const startUtc = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endUtc = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999));

    const startDateStr = startUtc.toISOString().split('T')[0];
    const endDateStr = endUtc.toISOString().split('T')[0];

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const monthName = `${monthNames[month - 1]} ${year}`;

    // 1. Build Base Filter for Employees
    const employeeWhere: Prisma.EmployeeWhereInput = {
      organizationId,
      isActive: true,
    };

    if (query.employeeId) {
      employeeWhere.id = query.employeeId;
    }

    if (query.branchId || query.departmentId) {
      employeeWhere.employment = {
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      };
    }

    // 2. Concurrently fetch:
    //    a) Total matching employee count
    //    b) Paginated employees with employment relations
    //    c) All daily summaries for this organization in the month (scoped by employee filters)
    const summaryWhere: Prisma.AttendanceDailySummaryWhereInput = {
      organizationId,
      date: {
        gte: startUtc,
        lte: endUtc,
      },
    };

    if (query.employeeId) {
      summaryWhere.employeeId = query.employeeId;
    }
    if (query.shiftId) {
      summaryWhere.shiftId = query.shiftId;
    }
    if (query.status && query.status !== 'ALL') {
      summaryWhere.status = query.status as AttendanceDayStatus;
    }
    if (query.branchId || query.departmentId) {
      summaryWhere.employee = {
        employment: {
          ...(query.branchId ? { branchId: query.branchId } : {}),
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
      };
    }

    const [totalEmployees, paginatedEmployees, allMonthSummaries] = await Promise.all([
      this.prisma.employee.count({ where: employeeWhere }),
      this.prisma.employee.findMany({
        where: employeeWhere,
        skip,
        take: limit,
        orderBy: { displayName: 'asc' },
        include: {
          user: { select: { email: true } },
          employment: {
            include: {
              branch: { select: { id: true, name: true, code: true } },
              department: { select: { id: true, name: true, code: true } },
              designation: { select: { id: true, title: true, code: true } },
            },
          },
        },
      }),
      this.prisma.attendanceDailySummary.findMany({
        where: summaryWhere,
        select: {
          id: true,
          employeeId: true,
          date: true,
          status: true,
          totalWorkMinutes: true,
          lateMinutes: true,
          earlyExitMinutes: true,
          overtimeMinutes: true,
          employee: {
            select: {
              employment: {
                select: {
                  branchId: true,
                  branch: { select: { id: true, name: true } },
                  departmentId: true,
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // 3. Index summaries by employeeId and by dayNumber
    const summariesByEmployee = new Map<string, typeof allMonthSummaries>();
    const dailyTrendMap = new Map<number, { present: number; absent: number; late: number }>();

    for (let d = 1; d <= daysInMonth; d++) {
      dailyTrendMap.set(d, { present: 0, absent: 0, late: 0 });
    }

    // Organization-level rollups
    let totalScheduledDays = 0;
    let totalPresentDays = 0;
    let totalAbsentDays = 0;
    let totalHalfDays = 0;
    let totalLeaveDays = 0;
    let totalLateCount = 0;
    let totalEarlyExitCount = 0;
    let totalWorkMinutes = 0;
    let totalOvertimeMinutes = 0;

    const deptRollupMap = new Map<
      string,
      {
        name: string;
        employees: Set<string>;
        scheduled: number;
        present: number;
        halfDay: number;
        workMinutes: number;
      }
    >();

    const branchRollupMap = new Map<
      string,
      {
        name: string;
        employees: Set<string>;
        scheduled: number;
        present: number;
        halfDay: number;
        workMinutes: number;
      }
    >();

    for (const record of allMonthSummaries) {
      let list = summariesByEmployee.get(record.employeeId);
      if (!list) {
        list = [];
        summariesByEmployee.set(record.employeeId, list);
      }
      list.push(record);

      const dayNum = record.date.getUTCDate();
      const trend = dailyTrendMap.get(dayNum);
      const st = record.status;

      totalWorkMinutes += record.totalWorkMinutes || 0;
      totalOvertimeMinutes += record.overtimeMinutes || 0;

      if (record.lateMinutes > 0) totalLateCount++;
      if (record.earlyExitMinutes > 0) totalEarlyExitCount++;

      if (st === 'PRESENT') {
        totalPresentDays++;
        totalScheduledDays++;
        if (trend) trend.present++;
      } else if (st === 'LATE') {
        totalPresentDays++;
        totalScheduledDays++;
        if (trend) {
          trend.present++;
          trend.late++;
        }
      } else if (st === 'HALF_DAY') {
        totalHalfDays++;
        totalScheduledDays++;
        if (trend) trend.present++;
      } else if (st === 'ABSENT') {
        totalAbsentDays++;
        totalScheduledDays++;
        if (trend) trend.absent++;
      } else if (st === 'ON_LEAVE') {
        totalLeaveDays++;
        totalScheduledDays++;
      } else if (st === 'INCOMPLETE') {
        totalScheduledDays++;
      }

      // Department & Branch tracking
      const dept = record.employee?.employment?.department;
      const deptId = dept?.id || record.employee?.employment?.departmentId;
      if (dept && deptId) {
        let dObj = deptRollupMap.get(deptId);
        if (!dObj) {
          dObj = {
            name: dept.name,
            employees: new Set(),
            scheduled: 0,
            present: 0,
            halfDay: 0,
            workMinutes: 0,
          };
          deptRollupMap.set(deptId, dObj);
        }
        dObj.employees.add(record.employeeId);
        dObj.workMinutes += record.totalWorkMinutes || 0;
        if (['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'INCOMPLETE'].includes(st)) {
          dObj.scheduled++;
          if (st === 'PRESENT' || st === 'LATE') dObj.present++;
          else if (st === 'HALF_DAY') dObj.halfDay++;
        }
      }

      const branch = record.employee?.employment?.branch;
      const branchId = branch?.id || record.employee?.employment?.branchId;
      if (branch && branchId) {
        let bObj = branchRollupMap.get(branchId);
        if (!bObj) {
          bObj = {
            name: branch.name,
            employees: new Set(),
            scheduled: 0,
            present: 0,
            halfDay: 0,
            workMinutes: 0,
          };
          branchRollupMap.set(branchId, bObj);
        }
        bObj.employees.add(record.employeeId);
        bObj.workMinutes += record.totalWorkMinutes || 0;
        if (['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'INCOMPLETE'].includes(st)) {
          bObj.scheduled++;
          if (st === 'PRESENT' || st === 'LATE') bObj.present++;
          else if (st === 'HALF_DAY') bObj.halfDay++;
        }
      }
    }

    // 4. Compute Employee Rollup for the Paginated Page
    const employeeSummaries: MonthlyEmployeeAttendanceSummary[] = paginatedEmployees.map(
      (emp: any) => {
        const empRecords = summariesByEmployee.get(emp.id) || [];
        let scheduled = 0;
        let present = 0;
        let half = 0;
        let absent = 0;
        let leave = 0;
        let weekOff = 0;
        let holiday = 0;
        let incomplete = 0;
        let lateCount = 0;
        let earlyExitCount = 0;
        let workMins = 0;
        let otMins = 0;

        for (const r of empRecords) {
          workMins += r.totalWorkMinutes || 0;
          otMins += r.overtimeMinutes || 0;
          if (r.lateMinutes > 0) lateCount++;
          if (r.earlyExitMinutes > 0) earlyExitCount++;

          switch (r.status) {
            case 'PRESENT':
              present++;
              scheduled++;
              break;
            case 'LATE':
              present++;
              scheduled++;
              break;
            case 'HALF_DAY':
              half++;
              scheduled++;
              break;
            case 'ABSENT':
              absent++;
              scheduled++;
              break;
            case 'ON_LEAVE':
              leave++;
              scheduled++;
              break;
            case 'WEEK_OFF':
            case 'WEEKEND_OFF':
              weekOff++;
              break;
            case 'HOLIDAY':
              holiday++;
              break;
            case 'INCOMPLETE':
              incomplete++;
              scheduled++;
              break;
            default:
              break;
          }
        }

        const attendedEquivalent = present + half * 0.5;
        const attendancePercentage =
          scheduled > 0 ? Math.round((attendedEquivalent / scheduled) * 1000) / 10 : 0;
        const totalWorkHours = Math.round((workMins / 60) * 100) / 100;
        const totalOvertimeHours = Math.round((otMins / 60) * 100) / 100;
        const avgDailyWorkHours =
          present + half > 0 ? Math.round((workMins / (present + half) / 60) * 100) / 100 : 0;

        return {
          employee: {
            id: emp.id,
            employeeCode: emp.employeeCode,
            displayName: emp.displayName,
            email: emp.user?.email || null,
            department: emp.employment?.department?.name || null,
            designation: emp.employment?.designation?.title || null,
            branch: emp.employment?.branch?.name || null,
          },
          scheduledDays: scheduled,
          presentDays: present,
          halfDays: half,
          absentDays: absent,
          leaveDays: leave,
          weekOffDays: weekOff,
          holidayDays: holiday,
          incompleteDays: incomplete,
          lateArrivalsCount: lateCount,
          earlyDeparturesCount: earlyExitCount,
          totalWorkMinutes: workMins,
          totalWorkHours,
          totalOvertimeMinutes: otMins,
          totalOvertimeHours,
          avgDailyWorkHours,
          attendancePercentage,
        };
      },
    );

    // 5. Build Org Summary
    const totalWorkHours = Math.round((totalWorkMinutes / 60) * 100) / 100;
    const totalOvertimeHours = Math.round((totalOvertimeMinutes / 60) * 100) / 100;
    const avgAttendanceRate =
      totalScheduledDays > 0
        ? Math.round(((totalPresentDays + totalHalfDays * 0.5) / totalScheduledDays) * 1000) / 10
        : 0;
    const avgWorkHoursPerEmployee =
      totalEmployees > 0 ? Math.round((totalWorkHours / totalEmployees) * 100) / 100 : 0;

    // Estimate working days in month (standard working days: Monday-Friday)
    let workingDaysCount = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = dayDate.getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysCount++;
      }
    }

    const summary: MonthlyAttendanceReportSummary = {
      totalEmployees,
      totalScheduledDays,
      totalPresentDays,
      totalAbsentDays,
      totalHalfDays,
      totalLeaveDays,
      totalLateCount,
      totalEarlyExitCount,
      totalWorkHours,
      totalOvertimeHours,
      avgAttendanceRate,
      avgWorkHoursPerEmployee,
    };

    // 6. Build MIS Aggregations
    const aggregations: MonthlyAttendanceReportAggregations = {
      byDepartment: Array.from(deptRollupMap.entries()).map(([deptId, d]) => {
        const attended = d.present + d.halfDay * 0.5;
        return {
          departmentId: deptId,
          departmentName: d.name,
          employeeCount: d.employees.size,
          avgAttendancePercentage:
            d.scheduled > 0 ? Math.round((attended / d.scheduled) * 1000) / 10 : 0,
          totalWorkHours: Math.round((d.workMinutes / 60) * 100) / 100,
        };
      }),
      byBranch: Array.from(branchRollupMap.entries()).map(([branchId, b]) => {
        const attended = b.present + b.halfDay * 0.5;
        return {
          branchId,
          branchName: b.name,
          employeeCount: b.employees.size,
          avgAttendancePercentage:
            b.scheduled > 0 ? Math.round((attended / b.scheduled) * 1000) / 10 : 0,
          totalWorkHours: Math.round((b.workMinutes / 60) * 100) / 100,
        };
      }),
      dailyTrend: Array.from(dailyTrendMap.entries()).map(([dayNumber, t]) => {
        const dDate = new Date(Date.UTC(year, month - 1, dayNumber));
        return {
          date: dDate.toISOString().split('T')[0],
          dayNumber,
          presentCount: t.present,
          absentCount: t.absent,
          lateCount: t.late,
        };
      }),
    };

    return {
      period: {
        year,
        month,
        monthName,
        daysInMonth,
        workingDaysCount,
        startDate: startDateStr,
        endDate: endDateStr,
      },
      summary,
      aggregations,
      employeeSummaries,
      pagination: {
        page,
        limit,
        total: totalEmployees,
        totalPages: Math.ceil(totalEmployees / limit) || 1,
      },
    };
  }
}
