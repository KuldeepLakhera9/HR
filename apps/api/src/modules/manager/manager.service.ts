import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { LeaveService } from '../leave/leave.service';
import { WfhService } from '../wfh/wfh.service';
import { VisitsService } from '../visits/visits.service';
import { ManagerAlertsService } from './manager-alerts.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ManagerDashboardQueryDto } from './dto/manager-dashboard-query.dto';
import { TeamDirectoryQueryDto } from './dto/team-directory-query.dto';
import {
  QueryUnifiedApprovalsDto,
  ApprovalRequestTypeFilter,
  ApprovalStatusFilter,
  ApprovalSortBy,
} from './dto/unified-approvals-query.dto';
import {
  DecideUnifiedApprovalDto,
  CancelUnifiedApprovalDto,
} from './dto/decide-unified-approval.dto';
import {
  ApprovalDecision,
  LeaveRequestStatus,
  Prisma,
  VisitStatus,
  WfhStatus,
} from '@prisma/client';
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

export interface UnifiedApprovalItem {
  id: string;
  type: 'LEAVE' | 'WFH' | 'VISIT';
  typeLabel: string;
  employeeId: string;
  employee: {
    id: string;
    employeeCode: string;
    displayName: string;
    profilePhoto: string | null;
    department: string | null;
    designation: string | null;
    managerId?: string | null;
  };
  startDate: string;
  endDate: string;
  duration: string;
  durationDays: number;
  durationType: string;
  reason: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  submittedAt: string;
  updatedAt: string;
  isEscalated: boolean;
  metadata: {
    leaveTypeId?: string;
    leaveTypeName?: string;
    leaveTypeCode?: string;
    leaveTypeColor?: string | null;
    chargeableDays?: number;
    isPaid?: boolean;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    contactNumber?: string | null;
    emergencyAddress?: string | null;
    title?: string;
    destinationCount?: number;
    destinations?: Array<{
      organizationName: string;
      city: string;
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    transportMode?: string;
    isInternational?: boolean;
  };
  approvals: Array<{
    id: string;
    approverId: string;
    approverName: string;
    decision: string;
    comments?: string | null;
    decidedAt: string;
  }>;
}

export interface UnifiedApprovalsResponse {
  items: UnifiedApprovalItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  counts: {
    totalPending: number;
    leavePending: number;
    wfhPending: number;
    visitPending: number;
  };
}

@Injectable()
export class ManagerService {
  private readonly logger = new Logger(ManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
    private readonly leaveService: LeaveService,
    private readonly wfhService: WfhService,
    private readonly visitsService: VisitsService,
    @Optional() private readonly managerAlertsService?: ManagerAlertsService,
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

  /**
   * Unified read/query layer for Manager Approvals Inbox across Leave, WFH, and Official Visits.
   * Respects organizational boundaries, manager hierarchy scope, and self-approval guards.
   */
  async getUnifiedApprovals(
    user: AuthenticatedUser,
    query: QueryUnifiedApprovalsDto,
  ): Promise<UnifiedApprovalsResponse> {
    const isHrOrAdmin = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    let allowedEmployeeIds: string[] | null = null;

    if (!isHrOrAdmin) {
      const managerEmp = await this.prisma.employee.findFirst({
        where: {
          organizationId: user.organizationId,
          userId: user.id,
          deletedAt: null,
        },
        select: { id: true, displayName: true, employeeCode: true },
      });

      if (!managerEmp) {
        throw new ForbiddenException(
          'Access denied: You do not possess an active employee profile to review approvals.',
        );
      }

      const hierarchy = await this.hierarchyService.getTeam(managerEmp.id, user.organizationId);
      // Guarantee self-approval prevention: exclude manager from their own approval inbox
      const subordinateIds = hierarchy.allMemberIds.filter((id) => id !== managerEmp.id);

      if (query.employeeId) {
        if (!subordinateIds.includes(query.employeeId)) {
          throw new ForbiddenException(
            'Access denied: Queried employee is outside your authorized reporting hierarchy scope.',
          );
        }
        allowedEmployeeIds = [query.employeeId];
      } else {
        allowedEmployeeIds = subordinateIds;
      }
    } else {
      if (query.employeeId) {
        allowedEmployeeIds = [query.employeeId];
      }
    }

    // 1. Calculate pending counters across all 3 workflows within caller scope
    const pendingScopeWhere = {
      organizationId: user.organizationId,
      ...(allowedEmployeeIds ? { employeeId: { in: allowedEmployeeIds } } : {}),
      ...(query.escalatedOnly ? { employee: { managerId: null } } : {}),
    };

    const [leavePendingCount, wfhPendingCount, visitPendingCount] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: {
          ...pendingScopeWhere,
          status: LeaveRequestStatus.SUBMITTED,
        },
      }),
      this.prisma.wfhRequest.count({
        where: {
          ...pendingScopeWhere,
          status: WfhStatus.SUBMITTED,
        },
      }),
      this.prisma.officialVisit.count({
        where: {
          ...pendingScopeWhere,
          status: VisitStatus.SUBMITTED,
        },
      }),
    ]);

    // 2. Build workflow query conditions
    const statusFilter =
      !query.status || query.status === ApprovalStatusFilter.SUBMITTED
        ? 'SUBMITTED'
        : query.status === ApprovalStatusFilter.ALL
          ? undefined
          : query.status;

    const baseWhere: any = {
      organizationId: user.organizationId,
      ...(allowedEmployeeIds ? { employeeId: { in: allowedEmployeeIds } } : {}),
      ...(query.escalatedOnly ? { employee: { managerId: null } } : {}),
    };

    if (query.startDate) {
      baseWhere.endDate = { gte: new Date(query.startDate) };
    }
    if (query.endDate) {
      baseWhere.startDate = { lte: new Date(query.endDate) };
    }
    if (query.submittedStartDate) {
      baseWhere.createdAt = {
        ...(baseWhere.createdAt || {}),
        gte: new Date(query.submittedStartDate),
      };
    }
    if (query.submittedEndDate) {
      baseWhere.createdAt = {
        ...(baseWhere.createdAt || {}),
        lte: new Date(query.submittedEndDate),
      };
    }

    const searchTerm = query.search?.trim();

    const fetchLeaves =
      !query.type ||
      query.type === ApprovalRequestTypeFilter.ALL ||
      query.type === ApprovalRequestTypeFilter.LEAVE;
    const fetchWfh =
      !query.type ||
      query.type === ApprovalRequestTypeFilter.ALL ||
      query.type === ApprovalRequestTypeFilter.WFH;
    const fetchVisits =
      !query.type ||
      query.type === ApprovalRequestTypeFilter.ALL ||
      query.type === ApprovalRequestTypeFilter.VISIT;

    const queries: Promise<UnifiedApprovalItem[]>[] = [];

    // 3. Query Leaves
    if (fetchLeaves) {
      const leaveWhere: Prisma.LeaveRequestWhereInput = {
        ...baseWhere,
        ...(statusFilter ? { status: statusFilter as LeaveRequestStatus } : {}),
      };

      if (searchTerm) {
        leaveWhere.OR = [
          { reason: { contains: searchTerm, mode: 'insensitive' } },
          { employee: { displayName: { contains: searchTerm, mode: 'insensitive' } } },
          { employee: { employeeCode: { contains: searchTerm, mode: 'insensitive' } } },
        ];
      }

      queries.push(
        this.prisma.leaveRequest
          .findMany({
            where: leaveWhere,
            include: {
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  displayName: true,
                  profilePhoto: true,
                  managerId: true,
                  employment: {
                    select: {
                      department: { select: { name: true } },
                      designation: { select: { title: true } },
                    },
                  },
                },
              },
              leaveType: true,
              approvals: {
                include: {
                  approver: { select: { id: true, firstName: true, lastName: true } },
                },
                orderBy: { decidedAt: 'desc' },
              },
            },
          })
          .then((records) =>
            records.map((r) => {
              const startIso = r.startDate.toISOString().split('T')[0];
              const endIso = r.endDate.toISOString().split('T')[0];
              const days = Number(r.chargeableDays);
              let duration = `${days} ${days === 1 ? 'Day' : 'Days'}`;
              if (r.durationType === 'FIRST_HALF') duration += ' (First Half)';
              if (r.durationType === 'SECOND_HALF') duration += ' (Second Half)';

              return {
                id: r.id,
                type: 'LEAVE' as const,
                typeLabel: 'Leave Application',
                employeeId: r.employeeId,
                employee: {
                  id: r.employee.id,
                  employeeCode: r.employee.employeeCode,
                  displayName: r.employee.displayName,
                  profilePhoto: r.employee.profilePhoto,
                  department: r.employee.employment?.department?.name || null,
                  designation: r.employee.employment?.designation?.title || null,
                  managerId: r.employee.managerId,
                },
                startDate: startIso,
                endDate: endIso,
                duration,
                durationDays: days,
                durationType: r.durationType,
                reason: r.reason,
                status: r.status as any,
                submittedAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
                isEscalated: !r.employee.managerId,
                metadata: {
                  leaveTypeId: r.leaveTypeId,
                  leaveTypeName: r.leaveType?.name,
                  leaveTypeCode: r.leaveType?.code,
                  leaveTypeColor: r.leaveType?.color,
                  chargeableDays: days,
                  isPaid: r.leaveType?.isPaid,
                  attachmentUrl: r.attachmentUrl,
                  attachmentName: r.attachmentName,
                },
                approvals: r.approvals.map((a) => ({
                  id: a.id,
                  approverId: a.approverId,
                  approverName: `${a.approver.firstName} ${a.approver.lastName}`,
                  decision: a.decision,
                  comments: a.comments,
                  decidedAt: a.decidedAt.toISOString(),
                })),
              };
            }),
          ),
      );
    }

    // 4. Query WFH
    if (fetchWfh) {
      const wfhWhere: Prisma.WfhRequestWhereInput = {
        ...baseWhere,
        ...(statusFilter ? { status: statusFilter as WfhStatus } : {}),
      };

      if (searchTerm) {
        wfhWhere.OR = [
          { reason: { contains: searchTerm, mode: 'insensitive' } },
          { employee: { displayName: { contains: searchTerm, mode: 'insensitive' } } },
          { employee: { employeeCode: { contains: searchTerm, mode: 'insensitive' } } },
        ];
      }

      queries.push(
        this.prisma.wfhRequest
          .findMany({
            where: wfhWhere,
            include: {
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  displayName: true,
                  profilePhoto: true,
                  managerId: true,
                  employment: {
                    select: {
                      department: { select: { name: true } },
                      designation: { select: { title: true } },
                    },
                  },
                },
              },
              approvals: {
                include: {
                  approver: { select: { id: true, firstName: true, lastName: true } },
                },
                orderBy: { decidedAt: 'desc' },
              },
            },
          })
          .then((records) =>
            records.map((r) => {
              const startIso = r.startDate.toISOString().split('T')[0];
              const endIso = r.endDate.toISOString().split('T')[0];
              const diffMs = r.endDate.getTime() - r.startDate.getTime();
              const daysDiff = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
              const days =
                r.durationType === 'FIRST_HALF' || r.durationType === 'SECOND_HALF'
                  ? 0.5
                  : daysDiff;

              let duration = `${days} ${days === 1 ? 'Day' : 'Days'}`;
              if (r.durationType === 'FIRST_HALF') duration = 'Half Day (First Half)';
              if (r.durationType === 'SECOND_HALF') duration = 'Half Day (Second Half)';

              return {
                id: r.id,
                type: 'WFH' as const,
                typeLabel: 'Work From Home',
                employeeId: r.employeeId,
                employee: {
                  id: r.employee.id,
                  employeeCode: r.employee.employeeCode,
                  displayName: r.employee.displayName,
                  profilePhoto: r.employee.profilePhoto,
                  department: r.employee.employment?.department?.name || null,
                  designation: r.employee.employment?.designation?.title || null,
                  managerId: r.employee.managerId,
                },
                startDate: startIso,
                endDate: endIso,
                duration,
                durationDays: days,
                durationType: r.durationType,
                reason: r.reason,
                status: r.status as any,
                submittedAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
                isEscalated: !r.employee.managerId,
                metadata: {},
                approvals: r.approvals.map((a) => ({
                  id: a.id,
                  approverId: a.approverId,
                  approverName: `${a.approver.firstName} ${a.approver.lastName}`,
                  decision: a.decision,
                  comments: a.comments,
                  decidedAt: a.decidedAt.toISOString(),
                })),
              };
            }),
          ),
      );
    }

    // 5. Query Official Visits
    if (fetchVisits) {
      const visitWhere: Prisma.OfficialVisitWhereInput = {
        ...baseWhere,
        ...(statusFilter ? { status: statusFilter as VisitStatus } : {}),
      };

      if (searchTerm) {
        visitWhere.OR = [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { purpose: { contains: searchTerm, mode: 'insensitive' } },
          { employee: { displayName: { contains: searchTerm, mode: 'insensitive' } } },
          { employee: { employeeCode: { contains: searchTerm, mode: 'insensitive' } } },
        ];
      }

      queries.push(
        this.prisma.officialVisit
          .findMany({
            where: visitWhere,
            include: {
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  displayName: true,
                  profilePhoto: true,
                  managerId: true,
                  employment: {
                    select: {
                      department: { select: { name: true } },
                      designation: { select: { title: true } },
                    },
                  },
                },
              },
              destinations: true,
              approvals: {
                include: {
                  approver: { select: { id: true, firstName: true, lastName: true } },
                },
                orderBy: { decidedAt: 'desc' },
              },
            },
          })
          .then((records) =>
            records.map((r) => {
              const startIso = r.startDate.toISOString().split('T')[0];
              const endIso = r.endDate.toISOString().split('T')[0];
              const days = Number(r.expectedDurationDays) || 1;
              const duration = `${days} ${days === 1 ? 'Day' : 'Days'}`;

              return {
                id: r.id,
                type: 'VISIT' as const,
                typeLabel: 'Official Visit',
                employeeId: r.employeeId,
                employee: {
                  id: r.employee.id,
                  employeeCode: r.employee.employeeCode,
                  displayName: r.employee.displayName,
                  profilePhoto: r.employee.profilePhoto,
                  department: r.employee.employment?.department?.name || null,
                  designation: r.employee.employment?.designation?.title || null,
                  managerId: r.employee.managerId,
                },
                startDate: startIso,
                endDate: endIso,
                duration,
                durationDays: days,
                durationType: 'FULL_DAY',
                reason: r.purpose || r.title,
                status: r.status as any,
                submittedAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
                isEscalated: !r.employee.managerId,
                metadata: {
                  title: r.title,
                  destinationCount: r.destinations?.length || 0,
                  destinations: r.destinations?.map((d) => ({
                    organizationName: d.destinationName,
                    city: d.city || '',
                    address: d.address,
                    latitude: d.latitude,
                    longitude: d.longitude,
                  })),
                },
                approvals: r.approvals.map((a) => ({
                  id: a.id,
                  approverId: a.approverId,
                  approverName: `${a.approver.firstName} ${a.approver.lastName}`,
                  decision: a.decision,
                  comments: a.comments,
                  decidedAt: a.decidedAt.toISOString(),
                })),
              };
            }),
          ),
      );
    }

    const queryResults = await Promise.all(queries);
    const combinedItems = queryResults.flat();

    // 6. Sort unified items
    const sortBy = query.sortBy || ApprovalSortBy.SUBMITTED_AT;
    const sortOrder = query.sortOrder || 'desc';

    combinedItems.sort((a, b) => {
      let comparison = 0;
      if (sortBy === ApprovalSortBy.START_DATE) {
        comparison = a.startDate.localeCompare(b.startDate);
      } else if (sortBy === ApprovalSortBy.EMPLOYEE_NAME) {
        comparison = a.employee.displayName.localeCompare(b.employee.displayName);
      } else if (sortBy === ApprovalSortBy.TYPE) {
        comparison = a.type.localeCompare(b.type);
      } else {
        // Default: submittedAt
        comparison = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // 7. Paginate
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const total = combinedItems.length;
    const paginatedItems = combinedItems.slice((page - 1) * limit, page * limit);

    return {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      counts: {
        totalPending: leavePendingCount + wfhPendingCount + visitPendingCount,
        leavePending: leavePendingCount,
        wfhPending: wfhPendingCount,
        visitPending: visitPendingCount,
      },
    };
  }

  /**
   * Retrieves single approval request details by reusing the original backend service.
   */
  async getUnifiedApprovalDetail(user: AuthenticatedUser, type: string, id: string) {
    const normType = type.toUpperCase();
    if (normType === 'LEAVE') {
      return this.leaveService.getRequestById(user, id);
    }
    if (normType === 'WFH') {
      return this.wfhService.getWfhRequestById(user, id);
    }
    if (normType === 'VISIT' || normType === 'OFFICIAL_VISIT') {
      return this.visitsService.getVisitById(user, id);
    }
    throw new BadRequestException(`Unsupported approval request type: ${type}`);
  }

  /**
   * Dispatches approval/rejection decision through the authoritative original workflow service.
   * Preserves transactional ledger balance posting, collision checks, notifications and audit history.
   */
  async decideUnifiedApproval(user: AuthenticatedUser, dto: DecideUnifiedApprovalDto) {
    const normType = dto.type.toUpperCase();
    const rawDecision = dto.decision.toUpperCase();
    const decision: ApprovalDecision =
      rawDecision === 'APPROVE' || rawDecision === 'APPROVED'
        ? ApprovalDecision.APPROVED
        : ApprovalDecision.REJECTED;
    const commentText = (dto.reason || dto.comments || dto.remarks || '').trim();

    if (decision === ApprovalDecision.REJECTED && commentText.length < 3) {
      throw new BadRequestException(
        'A reason of at least 3 characters is mandatory when rejecting.',
      );
    }

    if (normType === 'LEAVE') {
      const result = await this.leaveService.decide(user, dto.requestId, {
        decision,
        comments: commentText || undefined,
      });
      if (this.managerAlertsService) {
        this.managerAlertsService
          .notifyApprovalOutcome({
            organizationId: user.organizationId,
            employeeId: (result as any)?.employeeId || '',
            type: 'LEAVE',
            requestId: dto.requestId,
            decision: decision === ApprovalDecision.APPROVED ? 'APPROVED' : 'REJECTED',
            decidedByUserId: user.id,
            startDate: (result as any)?.startDate || new Date(),
            endDate: (result as any)?.endDate || new Date(),
            sanitizedComments: commentText || undefined,
          })
          .catch(() => null);
      }
      return result;
    }
    if (normType === 'WFH') {
      const result = await this.wfhService.decideWfhRequest(user, dto.requestId, {
        decision,
        comments: commentText || undefined,
      });
      if (this.managerAlertsService) {
        this.managerAlertsService
          .notifyApprovalOutcome({
            organizationId: user.organizationId,
            employeeId: (result as any)?.employeeId || '',
            type: 'WFH',
            requestId: dto.requestId,
            decision: decision === ApprovalDecision.APPROVED ? 'APPROVED' : 'REJECTED',
            decidedByUserId: user.id,
            startDate: (result as any)?.startDate || new Date(),
            endDate: (result as any)?.endDate || new Date(),
            sanitizedComments: commentText || undefined,
          })
          .catch(() => null);
      }
      return result;
    }
    if (normType === 'VISIT' || normType === 'OFFICIAL_VISIT') {
      const result = await this.visitsService.decideVisit(user, dto.requestId, {
        decision,
        comments: commentText || undefined,
      });
      if (this.managerAlertsService) {
        this.managerAlertsService
          .notifyApprovalOutcome({
            organizationId: user.organizationId,
            employeeId: (result as any)?.employeeId || '',
            type: 'VISIT',
            requestId: dto.requestId,
            decision: decision === ApprovalDecision.APPROVED ? 'APPROVED' : 'REJECTED',
            decidedByUserId: user.id,
            startDate: (result as any)?.startDate || new Date(),
            endDate: (result as any)?.endDate || new Date(),
            sanitizedComments: commentText || undefined,
          })
          .catch(() => null);
      }
      return result;
    }

    throw new BadRequestException(`Unsupported approval workflow type: ${dto.type}`);
  }

  /**
   * Dispatches cancellation through the authoritative original workflow service.
   */
  async cancelUnifiedApproval(user: AuthenticatedUser, dto: CancelUnifiedApprovalDto) {
    const normType = dto.type.toUpperCase();
    const cancellationReason = dto.reason || 'Cancelled by manager';

    if (normType === 'LEAVE') {
      return this.leaveService.cancel(user, dto.requestId, { cancellationReason });
    }
    if (normType === 'WFH') {
      return this.wfhService.cancelWfhRequest(user, dto.requestId, { cancellationReason });
    }
    if (normType === 'VISIT' || normType === 'OFFICIAL_VISIT') {
      return this.visitsService.cancelVisit(user, dto.requestId, { cancellationReason });
    }

    throw new BadRequestException(`Unsupported approval workflow type: ${dto.type}`);
  }
}
