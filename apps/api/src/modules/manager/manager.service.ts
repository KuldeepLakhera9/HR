import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ManagerDashboardQueryDto } from './dto/manager-dashboard-query.dto';
import { TeamDirectoryQueryDto } from './dto/team-directory-query.dto';
import { getTimezoneParts } from '../attendance/utils/policy-evaluator.util';

export interface ManagerDashboardMetricSummary {
  teamHeadcount: number;
  presentCheckedIn: number;
  notDueYet: number;
  pendingCheckIn: number;
  onApprovedLeave: number;
  onApprovedWfh: number;
  onOfficialVisit: number;
  pendingApprovalsTotal: number;
  actionableExceptionsCount: number;
}

export interface ManagerRosterItem {
  id: string;
  employeeCode: string;
  displayName: string;
  profilePhoto: string | null;
  designation: string;
  department: string;
  workEmail: string | null;
  workPhone: string | null;
  status:
    | 'PRESENT_OFFICE'
    | 'PRESENT_WFH'
    | 'ON_LEAVE'
    | 'ON_WFH'
    | 'ON_VISIT'
    | 'NOT_DUE_YET'
    | 'PENDING_CHECK_IN';
  statusLabel: string;
  firstCheckInTime: string | null;
  lastCheckOutTime: string | null;
  activeSessionDurationMinutes: number;
  shiftName: string;
  shiftTiming: string;
  leaveTypeColor?: string | null;
  leaveTypeName?: string | null;
}

@Injectable()
export class ManagerService {
  private readonly logger = new Logger(ManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
  ) {}

  /**
   * Builds the authorized, aggregated Manager Dashboard overview for direct and indirect reports.
   * Enforces manager scope, timezone correctness, and mutually exclusive status counts (zero double-counting).
   */
  async getDashboardOverview(user: AuthenticatedUser, query: ManagerDashboardQueryDto) {
    // 1. Resolve manager employee profile
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

    // 3. Resolve target calculation date
    const now = new Date();
    const tzNow = getTimezoneParts(now, timezone);
    const todayStr = `${tzNow.year}-${String(tzNow.month).padStart(2, '0')}-${String(tzNow.day).padStart(2, '0')}`;
    const targetDateStr = query.targetDate ? query.targetDate : todayStr;

    const startOfDayUtc = new Date(`${targetDateStr}T00:00:00.000Z`);
    const endOfDayUtc = new Date(`${targetDateStr}T23:59:59.999Z`);

    // 4. Resolve reporting hierarchy team
    let teamMemberIds: string[] = [];
    let directReportsCount = 0;
    let indirectReportsCount = 0;

    if (managerEmployee) {
      const hierarchy = await this.hierarchyService.getTeam(
        managerEmployee.id,
        user.organizationId,
      );
      teamMemberIds = hierarchy.allMemberIds;
      directReportsCount = hierarchy.directReports.length;
      indirectReportsCount = hierarchy.indirectReports.length;
    } else if (isHrOrAdmin) {
      const allActive = await this.prisma.employee.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { id: true },
        take: 200,
      });
      teamMemberIds = allActive.map((e) => e.id);
    }

    // Fast-path: Empty team
    if (teamMemberIds.length === 0) {
      return {
        success: true,
        timestamp: new Date().toISOString(),
        targetDate: targetDateStr,
        timezone,
        manager: managerEmployee
          ? {
              id: managerEmployee.id,
              displayName: managerEmployee.displayName,
              employeeCode: managerEmployee.employeeCode,
            }
          : null,
        metrics: {
          teamHeadcount: 0,
          presentCheckedIn: 0,
          notDueYet: 0,
          pendingCheckIn: 0,
          onApprovedLeave: 0,
          onApprovedWfh: 0,
          onOfficialVisit: 0,
          pendingApprovalsTotal: 0,
          actionableExceptionsCount: 0,
        },
        pendingBreakdown: {
          leaves: 0,
          wfh: 0,
          visits: 0,
          corrections: 0,
          total: 0,
        },
        roster: [],
        exceptions: [],
        upcomingAbsences: [],
      };
    }

    // 5. Bounded Parallel Queries (avoid N+1)
    const [
      employees,
      attendanceSummaries,
      activeSessions,
      approvedLeaves,
      approvedWfh,
      approvedVisits,
      pendingLeavesCount,
      pendingWfhCount,
      pendingVisitsCount,
      pendingCorrectionsCount,
      openExceptions,
      upcomingLeaves,
      shiftAssignments,
    ] = await Promise.all([
      // A. Active subordinates
      this.prisma.employee.findMany({
        where: {
          id: { in: teamMemberIds },
          organizationId: user.organizationId,
          isActive: true,
        },
        select: {
          id: true,
          employeeCode: true,
          displayName: true,
          profilePhoto: true,
          employment: {
            select: {
              designation: { select: { title: true } },
              department: { select: { name: true } },
              branch: { select: { name: true } },
              workMode: true,
            },
          },
          contact: {
            select: {
              workEmail: true,
              phone: true,
            },
          },
        },
        orderBy: { displayName: 'asc' },
      }),

      // B. Attendance summaries for target date
      this.prisma.attendanceDailySummary.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          date: { gte: startOfDayUtc, lte: endOfDayUtc },
        },
      }),

      // C. Active open sessions
      this.prisma.attendanceSession.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          checkInTime: { gte: startOfDayUtc, lte: endOfDayUtc },
          checkOutTime: null,
        },
        orderBy: { checkInTime: 'desc' },
      }),

      // D. Approved leaves
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          status: 'APPROVED',
          startDate: { lte: endOfDayUtc },
          endDate: { gte: startOfDayUtc },
        },
        include: {
          leaveType: { select: { name: true, code: true, color: true } },
        },
      }),

      // E. Approved WFH
      this.prisma.wfhRequest.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          status: 'APPROVED',
          startDate: { lte: endOfDayUtc },
          endDate: { gte: startOfDayUtc },
        },
      }),

      // F. Approved Visits
      this.prisma.officialVisit.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          status: 'APPROVED',
          startDate: { lte: endOfDayUtc },
          endDate: { gte: startOfDayUtc },
        },
      }),

      // G. Pending approval queues
      this.prisma.leaveRequest.count({
        where: { employeeId: { in: teamMemberIds }, status: 'SUBMITTED' },
      }),
      this.prisma.wfhRequest.count({
        where: { employeeId: { in: teamMemberIds }, status: 'SUBMITTED' },
      }),
      this.prisma.officialVisit.count({
        where: { employeeId: { in: teamMemberIds }, status: 'SUBMITTED' },
      }),
      this.prisma.attendanceCorrectionRequest.count({
        where: { employeeId: { in: teamMemberIds }, status: 'PENDING' },
      }),

      // H. Open exceptions for target date
      this.prisma.attendanceException.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          status: 'OPEN',
          date: { gte: startOfDayUtc, lte: endOfDayUtc },
        },
        include: {
          employee: { select: { displayName: true, employeeCode: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // I. Upcoming approved leaves (next 7 days)
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          status: 'APPROVED',
          startDate: {
            gt: endOfDayUtc,
            lte: new Date(endOfDayUtc.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        include: {
          employee: { select: { displayName: true, employeeCode: true } },
          leaveType: { select: { name: true, code: true, color: true } },
        },
        orderBy: { startDate: 'asc' },
        take: 10,
      }),

      // J. Shift assignments
      this.prisma.shiftAssignment.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          organizationId: user.organizationId,
          effectiveFrom: { lte: endOfDayUtc },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: startOfDayUtc } }],
        },
        include: { shift: true },
      }),
    ]);

    // 6. Fast Lookup Maps
    const summaryByEmp = new Map(attendanceSummaries.map((s) => [s.employeeId, s]));
    const activeSessionByEmp = new Map(activeSessions.map((s) => [s.employeeId, s]));
    const leaveByEmp = new Map(approvedLeaves.map((l) => [l.employeeId, l]));
    const wfhByEmp = new Map(approvedWfh.map((w) => [w.employeeId, w]));
    const visitByEmp = new Map(approvedVisits.map((v) => [v.employeeId, v]));
    const shiftByEmp = new Map(shiftAssignments.map((sa) => [sa.employeeId, sa.shift]));

    // 7. Mutually Exclusive Evaluation (Zero double-counting)
    let presentCheckedIn = 0;
    let notDueYet = 0;
    let pendingCheckIn = 0;
    let onApprovedLeave = 0;
    let onApprovedWfh = 0;
    let onOfficialVisit = 0;

    const roster: ManagerRosterItem[] = [];

    const currentTzMinutes = tzNow.hour * 60 + tzNow.minute;
    const isTargetToday = targetDateStr === todayStr;

    for (const emp of employees) {
      const summary = summaryByEmp.get(emp.id);
      const activeSession = activeSessionByEmp.get(emp.id);
      const leave = leaveByEmp.get(emp.id);
      const wfh = wfhByEmp.get(emp.id);
      const visit = visitByEmp.get(emp.id);
      const shift = shiftByEmp.get(emp.id);

      const shiftStartTime = shift?.startTime || '09:00';
      const shiftEndTime = shift?.endTime || '18:00';
      const shiftName = shift?.name || 'General Shift';
      const shiftTiming = `${shiftStartTime} - ${shiftEndTime}`;

      const [shiftH, shiftM] = shiftStartTime.split(':').map(Number);
      const shiftStartMinutes = (shiftH || 9) * 60 + (shiftM || 0);

      let status: ManagerRosterItem['status'];
      let statusLabel: string;
      let leaveTypeColor: string | null = null;
      let leaveTypeName: string | null = null;

      const firstCheckInTime = summary?.firstCheckIn
        ? new Date(summary.firstCheckIn).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : activeSession
          ? new Date(activeSession.checkInTime).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
          : null;

      const lastCheckOutTime = summary?.lastCheckOut
        ? new Date(summary.lastCheckOut).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : null;

      let activeDurationMinutes = 0;
      if (activeSession) {
        activeDurationMinutes = Math.max(
          0,
          Math.floor((now.getTime() - new Date(activeSession.checkInTime).getTime()) / (1000 * 60)),
        );
      } else if (summary) {
        activeDurationMinutes = Number(summary.totalWorkMinutes) || 0;
      }

      // Priority 1: Approved Leave
      if (leave) {
        status = 'ON_LEAVE';
        statusLabel = `On Leave (${leave.leaveType.name})`;
        leaveTypeColor = leave.leaveType.color;
        leaveTypeName = leave.leaveType.name;
        onApprovedLeave++;
      }
      // Priority 2: Official Visit
      else if (visit) {
        status = 'ON_VISIT';
        statusLabel = 'Official Duty';
        onOfficialVisit++;
      }
      // Priority 3: Checked In (Present in Office or Present WFH)
      else if (activeSession || (summary && Number(summary.totalWorkMinutes) > 0)) {
        if (
          wfh ||
          activeSession?.attendanceMode === 'WFH' ||
          summary?.primaryAttendanceMode === 'WFH'
        ) {
          status = 'PRESENT_WFH';
          statusLabel = 'Checked In (WFH)';
        } else {
          status = 'PRESENT_OFFICE';
          statusLabel = 'Checked In (Office)';
        }
        presentCheckedIn++;
      }
      // Priority 4: Approved WFH (Scheduled for remote work but not yet punched in)
      else if (wfh) {
        status = 'ON_WFH';
        statusLabel = 'Remote (Scheduled)';
        onApprovedWfh++;
      }
      // Priority 5: Shift Timing Evaluation for employees who have not checked in
      else {
        if (isTargetToday && currentTzMinutes < shiftStartMinutes) {
          status = 'NOT_DUE_YET';
          statusLabel = `Shift starts at ${shiftStartTime}`;
          notDueYet++;
        } else {
          status = 'PENDING_CHECK_IN';
          statusLabel = 'Not Checked In';
          pendingCheckIn++;
        }
      }

      roster.push({
        id: emp.id,
        employeeCode: emp.employeeCode,
        displayName: emp.displayName,
        profilePhoto: emp.profilePhoto,
        designation: emp.employment?.designation?.title || 'Team Member',
        department: emp.employment?.department?.name || 'Department',
        workEmail: emp.contact?.workEmail || null,
        workPhone: emp.contact?.phone || null,
        status,
        statusLabel,
        firstCheckInTime,
        lastCheckOutTime,
        activeSessionDurationMinutes: activeDurationMinutes,
        shiftName,
        shiftTiming,
        leaveTypeColor,
        leaveTypeName,
      });
    }

    const pendingApprovalsTotal =
      pendingLeavesCount + pendingWfhCount + pendingVisitsCount + pendingCorrectionsCount;

    return {
      success: true,
      timestamp: new Date().toISOString(),
      targetDate: targetDateStr,
      timezone,
      manager: managerEmployee
        ? {
            id: managerEmployee.id,
            displayName: managerEmployee.displayName,
            employeeCode: managerEmployee.employeeCode,
            directReportsCount,
            indirectReportsCount,
          }
        : null,
      metrics: {
        teamHeadcount: employees.length,
        presentCheckedIn,
        notDueYet,
        pendingCheckIn,
        onApprovedLeave,
        onApprovedWfh,
        onOfficialVisit,
        pendingApprovalsTotal,
        actionableExceptionsCount: openExceptions.length,
      },
      pendingBreakdown: {
        leaves: pendingLeavesCount,
        wfh: pendingWfhCount,
        visits: pendingVisitsCount,
        corrections: pendingCorrectionsCount,
        total: pendingApprovalsTotal,
      },
      roster,
      exceptions: openExceptions.map((ex) => ({
        id: ex.id,
        employeeId: ex.employeeId,
        employeeCode: ex.employee?.employeeCode || '',
        employeeName: ex.employee?.displayName || '',
        exceptionType: ex.exceptionType,
        severity: ex.severity,
        details: ex.details,
        date: ex.date,
        createdAt: ex.createdAt,
      })),
      upcomingAbsences: upcomingLeaves.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        employeeCode: l.employee?.employeeCode || '',
        employeeName: l.employee?.displayName || '',
        leaveTypeName: l.leaveType?.name || 'Leave',
        leaveTypeColor: l.leaveType?.color || null,
        startDate: l.startDate,
        endDate: l.endDate,
        chargeableDays: Number(l.chargeableDays),
        reason: '[Approved Scheduled Absence]',
      })),
    };
  }

  /**
   * Retrieves the paginated, searchable, and filterable team directory for the authenticated manager.
   * Enforces object-level hierarchy authorization and privacy rules.
   */
  async getTeamDirectory(user: AuthenticatedUser, query: TeamDirectoryQueryDto) {
    // 1. Resolve manager profile
    const managerEmployee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
      },
      select: { id: true, displayName: true, employeeCode: true },
    });

    const isHrOrAdmin = user.roles.includes('ADMIN') || user.roles.includes('HR');

    if (!managerEmployee && !isHrOrAdmin) {
      throw new ForbiddenException(
        'Access denied: You do not possess an active employee profile to view a team directory.',
      );
    }

    // 2. Resolve reporting hierarchy team
    let teamMemberIds: string[] = [];

    if (managerEmployee) {
      const hierarchy = await this.hierarchyService.getTeam(
        managerEmployee.id,
        user.organizationId,
      );
      teamMemberIds = hierarchy.allMemberIds;
    } else if (isHrOrAdmin) {
      const allActive = await this.prisma.employee.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { id: true },
      });
      teamMemberIds = allActive.map((e) => e.id);
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    if (teamMemberIds.length === 0) {
      return {
        success: true,
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
        meta: {
          departments: [],
          branches: [],
        },
      };
    }

    // 3. Build Prisma Query Filter
    const whereClause: any = {
      id: { in: teamMemberIds },
      organizationId: user.organizationId,
      isActive: true,
    };

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      whereClause.OR = [
        { displayName: { contains: term, mode: 'insensitive' } },
        { employeeCode: { contains: term, mode: 'insensitive' } },
        { contact: { workEmail: { contains: term, mode: 'insensitive' } } },
        { employment: { designation: { title: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    if (query.departmentId && query.departmentId !== 'ALL') {
      whereClause.employment = {
        ...(whereClause.employment || {}),
        departmentId: query.departmentId,
      };
    }

    if (query.branchId && query.branchId !== 'ALL') {
      whereClause.employment = {
        ...(whereClause.employment || {}),
        branchId: query.branchId,
      };
    }

    if (query.workMode && query.workMode !== 'ALL') {
      whereClause.employment = {
        ...(whereClause.employment || {}),
        workMode: query.workMode,
      };
    }

    // 4. Determine Sorting
    const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';
    let orderBy: any = { displayName: sortOrder };

    if (query.sortBy === 'employeeCode') {
      orderBy = { employeeCode: sortOrder };
    } else if (query.sortBy === 'joiningDate') {
      orderBy = { joiningDate: sortOrder };
    } else if (query.sortBy === 'department') {
      orderBy = { employment: { department: { name: sortOrder } } };
    }

    // 5. Total count and paginated query
    const total = await this.prisma.employee.count({ where: whereClause });

    const employees = await this.prisma.employee.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy,
      select: {
        id: true,
        employeeCode: true,
        displayName: true,
        firstName: true,
        lastName: true,
        profilePhoto: true,
        status: true,
        gender: true,
        joiningDate: true,
        employment: {
          select: {
            designation: { select: { id: true, title: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
            branch: { select: { id: true, name: true, code: true } },
            workMode: true,
            employmentType: true,
            joiningDate: true,
            manager: {
              select: {
                id: true,
                displayName: true,
                employeeCode: true,
              },
            },
          },
        },
        contact: {
          select: {
            workEmail: true,
            phone: true,
          },
        },
      },
    });

    // 6. Resolve concise availability for returned employees
    const pageEmployeeIds = employees.map((e) => e.id);
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { timezone: true },
    });
    const timezone = org?.timezone || 'Asia/Kolkata';
    const now = new Date();
    const tzNow = getTimezoneParts(now, timezone);
    const todayStr = `${tzNow.year}-${String(tzNow.month).padStart(2, '0')}-${String(tzNow.day).padStart(2, '0')}`;
    const startOfDayUtc = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfDayUtc = new Date(`${todayStr}T23:59:59.999Z`);

    const [
      summaries,
      activeSessions,
      approvedLeaves,
      approvedWfh,
      approvedVisits,
      shiftAssignments,
      distinctDepartments,
      distinctBranches,
    ] = await Promise.all([
      this.prisma.attendanceDailySummary.findMany({
        where: {
          employeeId: { in: pageEmployeeIds },
          date: { gte: startOfDayUtc, lte: endOfDayUtc },
        },
      }),
      this.prisma.attendanceSession.findMany({
        where: {
          employeeId: { in: pageEmployeeIds },
          checkInTime: { gte: startOfDayUtc, lte: endOfDayUtc },
          checkOutTime: null,
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: pageEmployeeIds },
          status: 'APPROVED',
          startDate: { lte: endOfDayUtc },
          endDate: { gte: startOfDayUtc },
        },
        include: {
          leaveType: { select: { name: true, code: true, color: true } },
        },
      }),
      this.prisma.wfhRequest.findMany({
        where: {
          employeeId: { in: pageEmployeeIds },
          status: 'APPROVED',
          startDate: { lte: endOfDayUtc },
          endDate: { gte: startOfDayUtc },
        },
      }),
      this.prisma.officialVisit.findMany({
        where: {
          employeeId: { in: pageEmployeeIds },
          status: 'APPROVED',
          startDate: { lte: endOfDayUtc },
          endDate: { gte: startOfDayUtc },
        },
      }),
      this.prisma.shiftAssignment.findMany({
        where: {
          employeeId: { in: pageEmployeeIds },
          organizationId: user.organizationId,
          effectiveFrom: { lte: endOfDayUtc },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: startOfDayUtc } }],
        },
        include: { shift: true },
      }),
      this.prisma.department.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.branch.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const summaryMap = new Map(summaries.map((s) => [s.employeeId, s]));
    const sessionMap = new Map(activeSessions.map((s) => [s.employeeId, s]));
    const leaveMap = new Map(approvedLeaves.map((l) => [l.employeeId, l]));
    const wfhMap = new Map(approvedWfh.map((w) => [w.employeeId, w]));
    const visitMap = new Map(approvedVisits.map((v) => [v.employeeId, v]));
    const shiftMap = new Map(shiftAssignments.map((sa) => [sa.employeeId, sa.shift]));

    const currentTzMinutes = tzNow.hour * 60 + tzNow.minute;

    const items = employees.map((emp) => {
      const summary = summaryMap.get(emp.id);
      const activeSession = sessionMap.get(emp.id);
      const leave = leaveMap.get(emp.id);
      const wfh = wfhMap.get(emp.id);
      const visit = visitMap.get(emp.id);
      const shift = shiftMap.get(emp.id);

      const shiftStartTime = shift?.startTime || '09:00';
      const shiftEndTime = shift?.endTime || '18:00';
      const shiftName = shift?.name || 'General Shift';
      const shiftTiming = `${shiftStartTime} - ${shiftEndTime}`;

      const [shiftH, shiftM] = shiftStartTime.split(':').map(Number);
      const shiftStartMinutes = (shiftH || 9) * 60 + (shiftM || 0);

      let status: ManagerRosterItem['status'];
      let statusLabel: string;
      let leaveTypeColor: string | null = null;
      let leaveTypeName: string | null = null;

      if (leave) {
        status = 'ON_LEAVE';
        statusLabel = `On Leave (${leave.leaveType.name})`;
        leaveTypeColor = leave.leaveType.color;
        leaveTypeName = leave.leaveType.name;
      } else if (visit) {
        status = 'ON_VISIT';
        statusLabel = 'Official Duty';
      } else if (activeSession || (summary && Number(summary.totalWorkMinutes) > 0)) {
        if (
          wfh ||
          activeSession?.attendanceMode === 'WFH' ||
          summary?.primaryAttendanceMode === 'WFH'
        ) {
          status = 'PRESENT_WFH';
          statusLabel = 'Checked In (WFH)';
        } else {
          status = 'PRESENT_OFFICE';
          statusLabel = 'Checked In (Office)';
        }
      } else if (wfh) {
        status = 'ON_WFH';
        statusLabel = 'Remote (Scheduled)';
      } else {
        if (currentTzMinutes < shiftStartMinutes) {
          status = 'NOT_DUE_YET';
          statusLabel = `Shift starts at ${shiftStartTime}`;
        } else {
          status = 'PENDING_CHECK_IN';
          statusLabel = 'Not Checked In';
        }
      }

      return {
        id: emp.id,
        employeeCode: emp.employeeCode,
        displayName: emp.displayName,
        firstName: emp.firstName,
        lastName: emp.lastName,
        profilePhoto: emp.profilePhoto,
        status: emp.status,
        gender: emp.gender,
        joiningDate: emp.joiningDate,
        designation: emp.employment?.designation?.title || 'Team Member',
        department: emp.employment?.department?.name || 'Department',
        departmentId: emp.employment?.department?.id || null,
        branch: emp.employment?.branch?.name || 'Branch',
        branchId: emp.employment?.branch?.id || null,
        workMode: emp.employment?.workMode || 'OFFICE',
        employmentType: emp.employment?.employmentType || 'FULL_TIME',
        reportingManager: emp.employment?.manager
          ? {
              id: emp.employment.manager.id,
              displayName: emp.employment.manager.displayName,
              employeeCode: emp.employment.manager.employeeCode,
            }
          : null,
        workEmail: emp.contact?.workEmail || null,
        workPhone: emp.contact?.phone || null,
        availability: {
          status,
          statusLabel,
          shiftName,
          shiftTiming,
          leaveTypeColor,
          leaveTypeName,
          firstCheckIn: summary?.firstCheckIn || activeSession?.checkInTime || null,
          lastCheckOut: summary?.lastCheckOut || null,
          workMinutes: summary?.totalWorkMinutes || 0,
        },
      };
    });

    return {
      success: true,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      meta: {
        departments: distinctDepartments,
        branches: distinctBranches,
      },
    };
  }

  /**
   * Retrieves the authorized detail view for a team member within the manager's reporting scope.
   * Enforces object-level hierarchy authorization and privacy rules (redacting sensitive reasons & docs).
   */
  async getTeamMember(user: AuthenticatedUser, employeeId: string) {
    // 1. Resolve manager profile
    const managerEmployee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
      },
      select: { id: true, displayName: true, employeeCode: true },
    });

    const isHrOrAdmin = user.roles.includes('ADMIN') || user.roles.includes('HR');

    if (!managerEmployee && !isHrOrAdmin) {
      throw new ForbiddenException(
        'Access denied: You do not possess an active employee profile to view team members.',
      );
    }

    // 2. Fetch employee profile
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: user.organizationId,
        isActive: true,
      },
      include: {
        employment: {
          include: {
            designation: true,
            department: true,
            branch: true,
            manager: {
              select: { id: true, displayName: true, employeeCode: true },
            },
          },
        },
        contact: {
          select: {
            workEmail: true,
            phone: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found or inactive.');
    }

    // 3. Object-level hierarchy authorization check
    if (!isHrOrAdmin) {
      if (!managerEmployee) {
        throw new ForbiddenException(
          'Access denied: You do not possess a manager employee profile.',
        );
      }
      const hierarchy = await this.hierarchyService.getTeam(
        managerEmployee.id,
        user.organizationId,
      );

      if (!hierarchy.allMemberIds.includes(employeeId)) {
        throw new ForbiddenException(
          'Access denied: This employee is not within your authorized reporting hierarchy scope.',
        );
      }
    }

    // 4. Resolve organization timezone & dates
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { timezone: true },
    });
    const timezone = org?.timezone || 'Asia/Kolkata';

    const now = new Date();
    const tzNow = getTimezoneParts(now, timezone);
    const todayStr = `${tzNow.year}-${String(tzNow.month).padStart(2, '0')}-${String(tzNow.day).padStart(2, '0')}`;
    const startOfDayUtc = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfDayUtc = new Date(`${todayStr}T23:59:59.999Z`);
    const sevenDaysAgoUtc = new Date(startOfDayUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysLaterUtc = new Date(endOfDayUtc.getTime() + 14 * 24 * 60 * 60 * 1000);
    const currentYear = tzNow.year;

    // 5. Query attendance, balances, and scheduled absences in parallel
    const [
      todaySummary,
      activeSession,
      todayLeave,
      todayWfh,
      todayVisit,
      shiftAssignment,
      recentSummaries,
      upcomingLeaves,
      leaveBalances,
    ] = await Promise.all([
      this.prisma.attendanceDailySummary.findFirst({
        where: {
          employeeId,
          date: { gte: startOfDayUtc, lte: endOfDayUtc },
        },
      }),
      this.prisma.attendanceSession.findFirst({
        where: {
          employeeId,
          checkInTime: { gte: startOfDayUtc, lte: endOfDayUtc },
          checkOutTime: null,
        },
      }),
      this.prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { lte: endOfDayUtc },
          endDate: { gte: startOfDayUtc },
        },
        include: { leaveType: true },
      }),
      this.prisma.wfhRequest.findFirst({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { lte: endOfDayUtc },
          endDate: { gte: startOfDayUtc },
        },
      }),
      this.prisma.officialVisit.findFirst({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { lte: endOfDayUtc },
          endDate: { gte: startOfDayUtc },
        },
      }),
      this.prisma.shiftAssignment.findFirst({
        where: {
          employeeId,
          organizationId: user.organizationId,
          effectiveFrom: { lte: endOfDayUtc },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: startOfDayUtc } }],
        },
        include: { shift: true },
      }),
      // Last 7 days attendance history
      this.prisma.attendanceDailySummary.findMany({
        where: {
          employeeId,
          date: { gte: sevenDaysAgoUtc, lte: endOfDayUtc },
        },
        orderBy: { date: 'desc' },
        take: 7,
      }),
      // Upcoming leaves in next 14 days
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { gt: endOfDayUtc, lte: fourteenDaysLaterUtc },
        },
        include: { leaveType: true },
        orderBy: { startDate: 'asc' },
        take: 10,
      }),
      // Leave accounts
      this.prisma.leaveBalanceAccount.findMany({
        where: {
          employeeId,
          leaveYear: currentYear,
        },
        include: { leaveType: true },
        orderBy: { leaveType: { name: 'asc' } },
      }),
    ]);

    // 6. Availability indicator
    const shiftStartTime = shiftAssignment?.shift?.startTime || '09:00';
    const shiftEndTime = shiftAssignment?.shift?.endTime || '18:00';
    const [shiftH, shiftM] = shiftStartTime.split(':').map(Number);
    const shiftStartMinutes = (shiftH || 9) * 60 + (shiftM || 0);
    const currentTzMinutes = tzNow.hour * 60 + tzNow.minute;

    let status: ManagerRosterItem['status'];
    let statusLabel: string;
    let leaveTypeColor: string | null = null;
    let leaveTypeName: string | null = null;

    if (todayLeave) {
      status = 'ON_LEAVE';
      statusLabel = `On Leave (${todayLeave.leaveType.name})`;
      leaveTypeColor = todayLeave.leaveType.color;
      leaveTypeName = todayLeave.leaveType.name;
    } else if (todayVisit) {
      status = 'ON_VISIT';
      statusLabel = 'Official Duty';
    } else if (activeSession || (todaySummary && Number(todaySummary.totalWorkMinutes) > 0)) {
      if (
        todayWfh ||
        activeSession?.attendanceMode === 'WFH' ||
        todaySummary?.primaryAttendanceMode === 'WFH'
      ) {
        status = 'PRESENT_WFH';
        statusLabel = 'Checked In (WFH)';
      } else {
        status = 'PRESENT_OFFICE';
        statusLabel = 'Checked In (Office)';
      }
    } else if (todayWfh) {
      status = 'ON_WFH';
      statusLabel = 'Remote (Scheduled)';
    } else {
      if (currentTzMinutes < shiftStartMinutes) {
        status = 'NOT_DUE_YET';
        statusLabel = `Shift starts at ${shiftStartTime}`;
      } else {
        status = 'PENDING_CHECK_IN';
        statusLabel = 'Not Checked In';
      }
    }

    return {
      success: true,
      profile: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        displayName: employee.displayName,
        firstName: employee.firstName,
        lastName: employee.lastName,
        profilePhoto: employee.profilePhoto,
        status: employee.status,
        gender: employee.gender,
        joiningDate: employee.joiningDate,
        employment: {
          designation: employee.employment?.designation?.title || 'Team Member',
          department: employee.employment?.department?.name || 'Department',
          branch: employee.employment?.branch?.name || 'Branch',
          workMode: employee.employment?.workMode || 'OFFICE',
          employmentType: employee.employment?.employmentType || 'FULL_TIME',
          joiningDate: employee.employment?.joiningDate || employee.joiningDate,
          reportingManager: employee.employment?.manager
            ? {
                id: employee.employment.manager.id,
                displayName: employee.employment.manager.displayName,
                employeeCode: employee.employment.manager.employeeCode,
              }
            : null,
        },
        contact: {
          workEmail: employee.contact?.workEmail || null,
          workPhone: employee.contact?.phone || null,
        },
      },
      availability: {
        status,
        statusLabel,
        leaveTypeColor,
        leaveTypeName,
        firstCheckIn: todaySummary?.firstCheckIn || activeSession?.checkInTime || null,
        lastCheckOut: todaySummary?.lastCheckOut || null,
        totalWorkMinutes: todaySummary?.totalWorkMinutes || 0,
        totalBreakMinutes: todaySummary?.totalBreakMinutes || 0,
        shift: {
          name: shiftAssignment?.shift?.name || 'General Shift',
          startTime: shiftStartTime,
          endTime: shiftEndTime,
        },
      },
      leaveBalances: leaveBalances.map((acc) => {
        const allocated = Number(acc.allocatedBalance);
        const accrued = Number(acc.accruedBalance);
        const used = Number(acc.usedBalance);
        const pending = Number(acc.pendingBalance);
        const available = Math.max(0, allocated + accrued - used - pending);

        return {
          id: acc.id,
          leaveTypeId: acc.leaveTypeId,
          leaveTypeName: acc.leaveType.name,
          leaveTypeCode: acc.leaveType.code,
          leaveTypeColor: acc.leaveType.color,
          leaveYear: acc.leaveYear,
          allocatedBalance: allocated,
          accruedBalance: accrued,
          usedBalance: used,
          pendingBalance: pending,
          availableBalance: available,
        };
      }),
      recentAttendance: recentSummaries.map((s) => ({
        id: s.id,
        date: s.date,
        status: s.status,
        firstCheckIn: s.firstCheckIn,
        lastCheckOut: s.lastCheckOut,
        totalWorkMinutes: s.totalWorkMinutes,
        primaryAttendanceMode: s.primaryAttendanceMode,
      })),
      upcomingAbsences: upcomingLeaves.map((l) => ({
        id: l.id,
        startDate: l.startDate,
        endDate: l.endDate,
        chargeableDays: Number(l.chargeableDays),
        leaveTypeName: l.leaveType.name,
        leaveTypeColor: l.leaveType.color,
        reason: '[Approved Scheduled Absence]',
      })),
    };
  }
}
