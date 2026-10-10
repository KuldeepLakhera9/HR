import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ManagerDashboardQueryDto } from './dto/manager-dashboard-query.dto';
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
      // HR/Admin viewing top-level view: retrieve direct organization employees
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

    // Current time in organization timezone for shift cutoff check
    const currentTzMinutes = tzNow.hour * 60 + tzNow.minute;
    const isTargetToday = targetDateStr === todayStr;

    for (const emp of employees) {
      const summary = summaryByEmp.get(emp.id);
      const activeSession = activeSessionByEmp.get(emp.id);
      const leave = leaveByEmp.get(emp.id);
      const wfh = wfhByEmp.get(emp.id);
      const visit = visitByEmp.get(emp.id);
      const shift = shiftByEmp.get(emp.id);

      // Determine shift timings
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
        // Privacy invariant: Reason is redacted to protect employee confidentiality
        reason: '[Approved Scheduled Absence]',
      })),
    };
  }
}
