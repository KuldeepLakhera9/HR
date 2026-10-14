import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from './hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  EmployeeDashboardResponse,
  UnifiedRequestsResponse,
  UnifiedEmployeeRequest,
} from '@hrms/types';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  TransitionStatusDto,
  EmployeeFilterDto,
} from './dto/employee.dto';
import {
  CreateProfileChangeRequestDto,
  ReviewProfileChangeRequestDto,
  QueryProfileChangeRequestsDto,
  ProfileChangeReviewDecision,
} from './dto/profile-change-request.dto';
import { QueryUnifiedRequestsDto } from './dto/unified-requests.dto';
import {
  EmploymentStatus,
  EmployeeHistoryEventType,
  UserStatus,
  RoleCode,
  Prisma,
  Gender,
  EmploymentType,
  WorkMode,
  SessionStatus,
  ProfileChangeRequestStatus,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { sanitizeCsvRow } from '../../common/utils/security.util';
import * as argon2 from 'argon2';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);
  private readonly hierarchy: HierarchyService;

  // Allowed status lifecycle state transitions
  private static readonly VALID_STATUS_TRANSITIONS: Record<EmploymentStatus, EmploymentStatus[]> = {
    PROBATION: [EmploymentStatus.ACTIVE, EmploymentStatus.TERMINATED, EmploymentStatus.RESIGNED],
    ACTIVE: [EmploymentStatus.ON_NOTICE, EmploymentStatus.RESIGNED, EmploymentStatus.TERMINATED],
    ON_NOTICE: [EmploymentStatus.EXITED, EmploymentStatus.ACTIVE, EmploymentStatus.TERMINATED],
    RESIGNED: [EmploymentStatus.EXITED, EmploymentStatus.ACTIVE, EmploymentStatus.ON_NOTICE],
    TERMINATED: [EmploymentStatus.EXITED],
    EXITED: [], // Terminal state
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() hierarchyService?: HierarchyService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {
    this.hierarchy = hierarchyService || new HierarchyService(prisma);
  }

  // ---------------------------------------------------------------------------
  // Data Scope Resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves permitted employee IDs based on user's role and data access scope:
   * - ADMIN / HR: Entire organization
   * - MANAGER: Self + direct & indirect reporting hierarchy
   * - EMPLOYEE: Self profile only
   */
  async getScopedEmployeeFilter(user: AuthenticatedUser): Promise<Prisma.EmployeeWhereInput> {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');

    if (isAdminOrHr) {
      return { organizationId: user.organizationId };
    }

    // Resolve user's employee record
    const userEmployee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ userId: user.id }, { employeeCode: user.employeeCode }],
      },
      select: { id: true },
    });

    if (!userEmployee) {
      // If user has no employee link, restrict to empty set
      return { id: '00000000-0000-0000-0000-000000000000' };
    }

    if (user.roles.includes('MANAGER')) {
      // Manager scope: Self + all recursive subordinates
      const subordinateIds = await this.getAllSubordinateEmployeeIds(
        userEmployee.id,
        user.organizationId,
      );
      const allowedIds = [userEmployee.id, ...subordinateIds];
      return {
        organizationId: user.organizationId,
        id: { in: allowedIds },
      };
    }

    // Default EMPLOYEE scope: Self only
    return {
      organizationId: user.organizationId,
      id: userEmployee.id,
    };
  }

  /**
   * Finds all subordinate employee IDs reporting to manager using controlled batch queries
   */
  async getAllSubordinateEmployeeIds(
    managerEmployeeId: string,
    organizationId: string,
  ): Promise<string[]> {
    return this.hierarchy.getTeamMemberIds(managerEmployeeId, organizationId);
  }

  /**
   * Validates manager relationship:
   * 1. Employee cannot be their own manager
   * 2. Circular relationship detection (A -> B -> A or multi-hop)
   */
  async validateManagerHierarchy(
    employeeId: string | null,
    managerId: string | null | undefined,
    organizationId: string,
  ): Promise<void> {
    return this.hierarchy.validateManagerHierarchy(employeeId, managerId, organizationId);
  }

  /**
   * Get direct manager for an employee (scoped to authorized user if provided)
   */
  async getManager(employeeId: string, userOrOrgId?: string | AuthenticatedUser) {
    if (typeof userOrOrgId === 'object' && userOrOrgId !== null) {
      await this.findOne(employeeId, userOrOrgId);
      return this.hierarchy.getManager(employeeId, userOrOrgId.organizationId);
    }
    return this.hierarchy.getManager(employeeId, userOrOrgId);
  }

  /**
   * Get direct reports for a manager (Depth 1, scoped to authorized user if provided)
   */
  async getDirectReports(managerId: string, userOrOrgId?: string | AuthenticatedUser) {
    if (typeof userOrOrgId === 'object' && userOrOrgId !== null) {
      await this.findOne(managerId, userOrOrgId);
      return this.hierarchy.getDirectReports(managerId, userOrOrgId.organizationId);
    }
    return this.hierarchy.getDirectReports(managerId, userOrOrgId);
  }

  /**
   * Get full team hierarchy (direct and indirect reports) using iterative BFS batching (scoped to authorized user if provided)
   */
  async getTeam(
    managerId: string,
    userOrOrgId?: string | AuthenticatedUser,
    options?: { maxDepth?: number; includeManager?: boolean },
  ) {
    if (typeof userOrOrgId === 'object' && userOrOrgId !== null) {
      await this.findOne(managerId, userOrOrgId);
      return this.hierarchy.getTeam(managerId, userOrOrgId.organizationId, options);
    }
    return this.hierarchy.getTeam(managerId, userOrOrgId as string, options);
  }

  // ---------------------------------------------------------------------------
  // Employee Directory & Retrieval
  // ---------------------------------------------------------------------------

  async findAll(user: AuthenticatedUser, query: EmployeeFilterDto) {
    const scopeFilter = await this.getScopedEmployeeFilter(user);

    const andConditions: Prisma.EmployeeWhereInput[] = [];

    if (query.search) {
      const term = query.search.trim();
      andConditions.push({
        OR: [
          { employeeCode: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { displayName: { contains: term, mode: 'insensitive' } },
          { contact: { workEmail: { contains: term, mode: 'insensitive' } } },
          { contact: { phone: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    if (query.status) {
      andConditions.push({ status: query.status });
    }

    // Employment sub-filters
    const employmentConditions: Prisma.EmployeeEmploymentWhereInput = {};
    if (query.departmentId) employmentConditions.departmentId = query.departmentId;
    if (query.designationId) employmentConditions.designationId = query.designationId;
    if (query.branchId) employmentConditions.branchId = query.branchId;
    if (query.managerId) employmentConditions.managerId = query.managerId;
    if (query.employmentType) employmentConditions.employmentType = query.employmentType;
    if (query.workMode) employmentConditions.workMode = query.workMode;

    if (Object.keys(employmentConditions).length > 0) {
      andConditions.push({ employment: employmentConditions });
    }

    const where: Prisma.EmployeeWhereInput = {
      organizationId: user.organizationId,
      AND: [scopeFilter, ...andConditions],
    };

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const allowedSortFields = ['displayName', 'employeeCode', 'joiningDate', 'createdAt', 'status'];
    const sortField =
      query.sortBy && allowedSortFields.includes(query.sortBy) ? query.sortBy : 'displayName';
    const sortDirection = query.sortOrder === 'desc' ? 'desc' : 'asc';

    const [total, records] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDirection },
        include: {
          employment: {
            include: {
              branch: { select: { id: true, name: true, code: true } },
              department: { select: { id: true, name: true, code: true } },
              designation: { select: { id: true, title: true, code: true } },
              manager: { select: { id: true, displayName: true, employeeCode: true } },
            },
          },
          contact: {
            select: { workEmail: true, phone: true },
          },
        },
      }),
    ]);

    const items = records.map((e) => ({
      id: e.id,
      userId: e.userId,
      employeeCode: e.employeeCode,
      firstName: e.firstName,
      middleName: e.middleName,
      lastName: e.lastName,
      displayName: e.displayName,
      profilePhoto: e.profilePhoto,
      status: e.status,
      joiningDate: e.joiningDate.toISOString(),
      workEmail: e.contact?.workEmail || null,
      phone: e.contact?.phone || null,
      branchName: e.employment?.branch?.name || null,
      branchId: e.employment?.branchId || null,
      departmentName: e.employment?.department?.name || null,
      departmentId: e.employment?.departmentId || null,
      designationTitle: e.employment?.designation?.title || null,
      designationId: e.employment?.designationId || null,
      managerName: e.employment?.manager?.displayName || null,
      managerId: e.employment?.managerId || null,
      employmentType: e.employment?.employmentType || null,
      workMode: e.employment?.workMode || null,
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findMe(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
      },
      include: {
        employment: {
          include: {
            branch: true,
            department: true,
            designation: true,
            manager: {
              select: {
                id: true,
                displayName: true,
                employeeCode: true,
                profilePhoto: true,
              },
            },
          },
        },
        contact: true,
        emergencyContacts: true,
        documents: true,
        history: {
          orderBy: { timestamp: 'desc' },
          include: {
            performedBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('No employee record linked to current user');
    }

    return employee;
  }

  /**
   * Aggregates the current authenticated employee's home dashboard overview
   * including today's attendance, shift, leave balances, pending requests across all types,
   * upcoming approved absences, holidays, and notifications.
   */
  async getMyDashboard(user: AuthenticatedUser): Promise<EmployeeDashboardResponse> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        employment: {
          include: {
            branch: true,
            department: true,
            designation: true,
            manager: {
              select: {
                id: true,
                displayName: true,
                employeeCode: true,
                profilePhoto: true,
              },
            },
          },
        },
        contact: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('No employee record linked to current user');
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const currentYear = now.getFullYear();

    // Query all relevant data concurrently without N+1 bottlenecks
    const [
      activeSession,
      todayCompletedSession,
      shiftAssignment,
      leaveBalances,
      pendingLeaves,
      pendingWfh,
      pendingVisits,
      pendingCorrections,
      upcomingLeaves,
      upcomingWfh,
      upcomingVisits,
      upcomingHolidays,
      notifications,
    ] = await Promise.all([
      // 1. Live open attendance session
      this.prisma.attendanceSession.findFirst({
        where: {
          employeeId: employee.id,
          status: SessionStatus.OPEN,
        },
        include: {
          events: {
            orderBy: { eventTimestamp: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // 2. Today's most recent closed attendance session
      this.prisma.attendanceSession.findFirst({
        where: {
          employeeId: employee.id,
          date: {
            gte: todayStart,
            lte: todayEnd,
          },
          status: { in: [SessionStatus.COMPLETED, SessionStatus.AUTO_CLOSED] },
        },
        orderBy: { checkOutTime: 'desc' },
      }),
      // 3. Current shift assignment
      this.prisma.shiftAssignment.findFirst({
        where: {
          employeeId: employee.id,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        include: { shift: true },
        orderBy: { effectiveFrom: 'desc' },
      }),
      // 4. Leave balances for current year
      this.prisma.leaveBalanceAccount.findMany({
        where: {
          employeeId: employee.id,
          leaveYear: currentYear,
          leaveType: { isActive: true },
        },
        include: { leaveType: true },
        orderBy: { leaveType: { name: 'asc' } },
      }),
      // 5. Personal pending leaves
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: employee.id,
          status: 'SUBMITTED',
        },
        include: { leaveType: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      // 6. Personal pending WFH
      this.prisma.wfhRequest.findMany({
        where: {
          employeeId: employee.id,
          status: 'SUBMITTED',
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      // 7. Personal pending official visits
      this.prisma.officialVisit.findMany({
        where: {
          employeeId: employee.id,
          status: 'SUBMITTED',
        },
        include: { destinations: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      // 8. Personal pending attendance punch corrections
      this.prisma.attendanceCorrectionRequest.findMany({
        where: {
          employeeId: employee.id,
          status: 'PENDING',
        },
        orderBy: { submittedAt: 'desc' },
        take: 5,
      }),
      // 9. Upcoming approved leaves (next 30 days)
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: employee.id,
          status: 'APPROVED',
          endDate: { gte: todayStart },
          startDate: { lte: thirtyDaysLater },
        },
        include: { leaveType: true },
        orderBy: { startDate: 'asc' },
        take: 5,
      }),
      // 10. Upcoming approved WFH (next 30 days)
      this.prisma.wfhRequest.findMany({
        where: {
          employeeId: employee.id,
          status: 'APPROVED',
          endDate: { gte: todayStart },
          startDate: { lte: thirtyDaysLater },
        },
        orderBy: { startDate: 'asc' },
        take: 5,
      }),
      // 11. Upcoming approved official visits (next 30 days)
      this.prisma.officialVisit.findMany({
        where: {
          employeeId: employee.id,
          status: 'APPROVED',
          endDate: { gte: todayStart },
          startDate: { lte: thirtyDaysLater },
        },
        include: { destinations: true },
        orderBy: { startDate: 'asc' },
        take: 5,
      }),
      // 12. Upcoming organizational holidays
      this.prisma.holiday.findMany({
        where: {
          organizationId: user.organizationId,
          date: { gte: todayStart },
          OR: [{ branchId: null }, { branchId: employee.employment?.branchId || undefined }],
        },
        orderBy: { date: 'asc' },
        take: 4,
      }),
      // 13. Notifications for employee
      this.notificationsService
        ? this.notificationsService.getNotifications(user.id, user.organizationId, { limit: 5 })
        : Promise.resolve([]),
    ]);

    // Attendance calculation
    const isCheckedIn = !!activeSession;
    const session = activeSession || todayCompletedSession;
    let loggedMinutes = 0;
    if (activeSession && activeSession.checkInTime) {
      const startMs = activeSession.checkInTime.getTime();
      loggedMinutes = Math.max(
        0,
        Math.floor((now.getTime() - startMs) / 60000) - (activeSession.totalBreakMinutes || 0),
      );
    } else if (todayCompletedSession) {
      loggedMinutes = todayCompletedSession.totalWorkMinutes || 0;
    }

    const shiftInfo = shiftAssignment?.shift || null;
    const isOnBreak = (activeSession as any)?.events?.[0]?.eventType === 'BREAK_START';

    // Aggregate pending items across all workflows
    const pendingItems = [
      ...pendingLeaves.map((l) => ({
        id: l.id,
        type: 'LEAVE' as const,
        title: `${l.leaveType.name} Leave (${Number(l.chargeableDays)}d)`,
        dateRange: `${l.startDate.toISOString().split('T')[0]} to ${l.endDate.toISOString().split('T')[0]}`,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        href: '/leave',
      })),
      ...pendingWfh.map((w) => {
        const days = Math.max(
          1,
          Math.ceil((w.endDate.getTime() - w.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        );
        return {
          id: w.id,
          type: 'WFH' as const,
          title: `Work From Home (${days}d)`,
          dateRange: `${w.startDate.toISOString().split('T')[0]} to ${w.endDate.toISOString().split('T')[0]}`,
          status: w.status,
          createdAt: w.createdAt.toISOString(),
          href: '/wfh',
        };
      }),
      ...pendingVisits.map((v) => {
        const destName = v.destinations?.[0]?.destinationName || 'Outdoor Duty';
        return {
          id: v.id,
          type: 'OFFICIAL_VISIT' as const,
          title: `Visit: ${v.title} (${destName})`,
          dateRange: `${v.startDate.toISOString().split('T')[0]} to ${v.endDate.toISOString().split('T')[0]}`,
          status: v.status,
          createdAt: v.createdAt.toISOString(),
          href: '/visits',
        };
      }),
      ...pendingCorrections.map((c) => ({
        id: c.id,
        type: 'ATTENDANCE_CORRECTION' as const,
        title: 'Attendance Punch Correction',
        dateRange: `${c.targetDate.toISOString().split('T')[0]}`,
        status: c.status,
        createdAt: c.submittedAt.toISOString(),
        href: '/attendance',
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Aggregate upcoming approved absences
    const upcomingAbsenceItems = [
      ...upcomingLeaves.map((l) => ({
        id: l.id,
        type: 'LEAVE' as const,
        title: `${l.leaveType.name} Leave`,
        startDate: l.startDate.toISOString().split('T')[0],
        endDate: l.endDate.toISOString().split('T')[0],
        daysCount: Number(l.chargeableDays),
        status: l.status,
        href: '/leave',
      })),
      ...upcomingWfh.map((w) => {
        const days = Math.max(
          1,
          Math.ceil((w.endDate.getTime() - w.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        );
        return {
          id: w.id,
          type: 'WFH' as const,
          title: 'Work From Home',
          startDate: w.startDate.toISOString().split('T')[0],
          endDate: w.endDate.toISOString().split('T')[0],
          daysCount: days,
          status: w.status,
          href: '/wfh',
        };
      }),
      ...upcomingVisits.map((v) => ({
        id: v.id,
        type: 'OFFICIAL_VISIT' as const,
        title: `Official Visit: ${v.title}`,
        startDate: v.startDate.toISOString().split('T')[0],
        endDate: v.endDate.toISOString().split('T')[0],
        daysCount: Number(v.expectedDurationDays),
        status: v.status,
        href: '/visits',
      })),
    ].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const daysOfWeek = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    return {
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        displayName: employee.displayName,
        firstName: employee.firstName,
        lastName: employee.lastName,
        profilePhoto: employee.profilePhoto,
        designation: employee.employment?.designation?.name || 'Employee',
        department: employee.employment?.department?.name || 'General',
        branch: employee.employment?.branch?.name || 'Headquarters',
        manager: employee.employment?.manager
          ? {
              id: employee.employment.manager.id,
              displayName: employee.employment.manager.displayName,
              employeeCode: employee.employment.manager.employeeCode,
            }
          : null,
        workMode: employee.employment?.workMode || 'OFFICE',
        joiningDate: employee.joiningDate.toISOString(),
        status: employee.status,
      },
      attendanceToday: {
        isCheckedIn,
        activeSessionId: activeSession?.id || null,
        checkInTime: session?.checkInTime ? session.checkInTime.toISOString() : null,
        checkOutTime: session?.checkOutTime ? session.checkOutTime.toISOString() : null,
        mode: (session?.attendanceMode as any) || 'OFFICE',
        status: session?.status || 'NOT_STARTED',
        loggedMinutes,
        isOnBreak,
        shift: shiftInfo
          ? {
              name: shiftInfo.name,
              startTime: shiftInfo.startTime,
              endTime: shiftInfo.endTime,
            }
          : null,
      },
      leaveBalances: leaveBalances.map((b) => ({
        id: b.id,
        leaveTypeId: b.leaveTypeId,
        code: b.leaveType.code,
        name: b.leaveType.name,
        available: Number(b.closingBalance),
        entitled: Number(b.allocatedBalance),
        used: Number(b.usedBalance),
        pending: Number(b.pendingBalance),
      })),
      pendingRequests: {
        totalCount: pendingItems.length,
        leaveCount: pendingLeaves.length,
        wfhCount: pendingWfh.length,
        visitCount: pendingVisits.length,
        correctionCount: pendingCorrections.length,
        items: pendingItems,
      },
      upcomingAbsences: upcomingAbsenceItems,
      upcomingHolidays: upcomingHolidays.map((h) => ({
        id: h.id,
        name: h.name,
        date: h.date.toISOString().split('T')[0],
        dayOfWeek: daysOfWeek[h.date.getDay()],
        isOptional: h.isOptional,
      })),
      notifications: (notifications as any[]).map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type || 'INFO',
        createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
        isRead: !!n.isRead,
        link: n.link || null,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Profile Change Request Workflow (ESS Self-Service)
  // ---------------------------------------------------------------------------

  /**
   * Submit a profile change request for self-service contact / emergency contact updates.
   * Staged separately from the authoritative employee record until HR/Admin approval.
   * Derived strictly from user's authenticated session (IDOR prevention).
   * Protected fields (salary, designation, role, manager, employeeCode) cannot be updated.
   */
  async createProfileChangeRequest(user: AuthenticatedUser, dto: CreateProfileChangeRequestDto) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException('No employee record linked to current user');
    }

    // Check for existing pending request to prevent duplicate submissions
    const existingPending = await this.prisma.profileChangeRequest.findFirst({
      where: {
        employeeId: employee.id,
        organizationId: user.organizationId,
        status: ProfileChangeRequestStatus.PENDING,
      },
    });

    if (existingPending) {
      throw new BadRequestException(
        'You already have a pending profile change request. Please wait for it to be reviewed or cancel it before submitting a new one.',
      );
    }

    // Snapshot authoritative current state
    const currentContact = await this.prisma.employeeContact.findUnique({
      where: { employeeId: employee.id },
    });
    const currentEmergencyContacts = await this.prisma.emergencyContact.findMany({
      where: { employeeId: employee.id },
      orderBy: { isPrimary: 'desc' },
    });

    const currentSnapshot = {
      personalEmail: currentContact?.personalEmail || null,
      phone: currentContact?.phone || null,
      alternatePhone: currentContact?.alternatePhone || null,
      address: currentContact?.address || null,
      city: currentContact?.city || null,
      state: currentContact?.state || null,
      postalCode: currentContact?.postalCode || null,
      country: currentContact?.country || 'India',
      emergencyContacts: currentEmergencyContacts.map((c) => ({
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
        alternatePhone: c.alternatePhone || null,
        address: c.address || null,
        isPrimary: c.isPrimary,
      })),
    };

    // Prepare proposed changes
    const proposedData: Record<string, any> = {
      personalEmail:
        dto.personalEmail !== undefined ? dto.personalEmail : currentContact?.personalEmail || null,
      phone: dto.phone !== undefined ? dto.phone : currentContact?.phone || null,
      alternatePhone:
        dto.alternatePhone !== undefined
          ? dto.alternatePhone
          : currentContact?.alternatePhone || null,
      address: dto.address !== undefined ? dto.address : currentContact?.address || null,
      city: dto.city !== undefined ? dto.city : currentContact?.city || null,
      state: dto.state !== undefined ? dto.state : currentContact?.state || null,
      postalCode:
        dto.postalCode !== undefined ? dto.postalCode : currentContact?.postalCode || null,
      country: dto.country !== undefined ? dto.country : currentContact?.country || 'India',
      emergencyContacts:
        dto.emergencyContacts !== undefined
          ? dto.emergencyContacts
          : currentSnapshot.emergencyContacts,
    };

    const request = await this.prisma.profileChangeRequest.create({
      data: {
        organizationId: user.organizationId,
        employeeId: employee.id,
        data: proposedData as Prisma.InputJsonValue,
        currentData: currentSnapshot as Prisma.InputJsonValue,
        reason: dto.reason || null,
        status: ProfileChangeRequestStatus.PENDING,
      },
      include: {
        employee: {
          select: {
            id: true,
            displayName: true,
            employeeCode: true,
          },
        },
      },
    });

    // Record audit log
    await this.auditService.record({
      action: 'PROFILE_CHANGE_REQUESTED',
      entity: 'ProfileChangeRequest',
      entityId: request.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        reason: dto.reason,
      },
    });

    // Dispatch actionable notification to HR
    if (this.notificationsService) {
      await this.notificationsService.createNotification({
        organizationId: user.organizationId,
        title: 'Profile Change Request Submitted',
        message: `${employee.displayName} (${employee.employeeCode}) requested personal contact updates.`,
        type: 'PROFILE_CHANGE_REQUEST',
        link: '/employees/requests',
        metadata: { requestId: request.id, employeeId: employee.id },
        idempotencyKey: `profile-change-req-${request.id}`,
      });
    }

    return request;
  }

  /**
   * Get employee's own profile change request history (authenticated user).
   */
  async getMyProfileChangeRequests(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException('No employee record linked to current user');
    }

    return this.prisma.profileChangeRequest.findMany({
      where: {
        employeeId: employee.id,
        organizationId: user.organizationId,
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Cancel an employee's pending profile change request.
   * Protects against IDOR (must belong to authenticated user).
   */
  async cancelProfileChangeRequest(user: AuthenticatedUser, requestId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException('No employee record linked to current user');
    }

    const request = await this.prisma.profileChangeRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.organizationId !== user.organizationId) {
      throw new NotFoundException(`Profile change request #${requestId} not found`);
    }

    if (request.employeeId !== employee.id) {
      throw new ForbiddenException('You are not authorized to cancel this profile change request');
    }

    if (request.status !== ProfileChangeRequestStatus.PENDING) {
      throw new BadRequestException('Only pending profile change requests can be cancelled');
    }

    const cancelled = await this.prisma.profileChangeRequest.update({
      where: { id: requestId },
      data: {
        status: ProfileChangeRequestStatus.CANCELLED,
      },
      include: {
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await this.auditService.record({
      action: 'PROFILE_CHANGE_CANCELLED',
      entity: 'ProfileChangeRequest',
      entityId: requestId,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { employeeId: employee.id },
    });

    return cancelled;
  }

  /**
   * Query profile change requests across organization (HR/Admin view).
   */
  async getProfileChangeRequests(user: AuthenticatedUser, query: QueryProfileChangeRequestsDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProfileChangeRequestWhereInput = {
      organizationId: user.organizationId,
    };

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as ProfileChangeRequestStatus;
    }

    const [total, items] = await Promise.all([
      this.prisma.profileChangeRequest.count({ where }),
      this.prisma.profileChangeRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
              profilePhoto: true,
              employment: {
                select: {
                  department: { select: { name: true } },
                  designation: { select: { title: true } },
                },
              },
            },
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Review (Approve or Reject) a profile change request.
   * Transactional and atomic. Prevents duplicate or stale decisions.
   * Updates authoritative contact records only upon approval.
   */
  async reviewProfileChangeRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: ReviewProfileChangeRequestDto,
  ) {
    const existing = await this.prisma.profileChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: {
          select: {
            id: true,
            displayName: true,
            employeeCode: true,
            userId: true,
          },
        },
      },
    });

    if (!existing || existing.organizationId !== user.organizationId) {
      throw new NotFoundException(`Profile change request #${requestId} not found`);
    }

    if (existing.status !== ProfileChangeRequestStatus.PENDING) {
      throw new ConflictException(
        `This profile change request has already been ${existing.status.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Re-check status within transaction for concurrency safety
      const locked = await tx.profileChangeRequest.findUnique({
        where: { id: requestId },
        include: {
          employee: {
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
              userId: true,
            },
          },
        },
      });

      if (!locked || locked.status !== ProfileChangeRequestStatus.PENDING) {
        throw new ConflictException('Profile change request has already been decided');
      }

      const targetStatus =
        dto.decision === ProfileChangeReviewDecision.APPROVED
          ? ProfileChangeRequestStatus.APPROVED
          : ProfileChangeRequestStatus.REJECTED;

      if (dto.decision === ProfileChangeReviewDecision.APPROVED) {
        const proposed = locked.data as any;

        // 1. Transactionally upsert authoritative EmployeeContact
        await tx.employeeContact.upsert({
          where: { employeeId: locked.employeeId },
          create: {
            employeeId: locked.employeeId,
            workEmail: `${locked.employee.employeeCode.toLowerCase()}@company.com`,
            personalEmail: proposed.personalEmail || null,
            phone: proposed.phone || null,
            alternatePhone: proposed.alternatePhone || null,
            address: proposed.address || null,
            city: proposed.city || null,
            state: proposed.state || null,
            postalCode: proposed.postalCode || null,
            country: proposed.country || 'India',
          },
          update: {
            ...(proposed.personalEmail !== undefined && { personalEmail: proposed.personalEmail }),
            ...(proposed.phone !== undefined && { phone: proposed.phone }),
            ...(proposed.alternatePhone !== undefined && {
              alternatePhone: proposed.alternatePhone,
            }),
            ...(proposed.address !== undefined && { address: proposed.address }),
            ...(proposed.city !== undefined && { city: proposed.city }),
            ...(proposed.state !== undefined && { state: proposed.state }),
            ...(proposed.postalCode !== undefined && { postalCode: proposed.postalCode }),
            ...(proposed.country !== undefined && { country: proposed.country }),
          },
        });

        // 2. Transactionally replace EmergencyContacts if specified
        if (Array.isArray(proposed.emergencyContacts) && proposed.emergencyContacts.length > 0) {
          await tx.emergencyContact.deleteMany({
            where: { employeeId: locked.employeeId },
          });

          await tx.emergencyContact.createMany({
            data: proposed.emergencyContacts.map((c: any) => ({
              employeeId: locked.employeeId,
              name: c.name,
              relationship: c.relationship,
              phone: c.phone,
              alternatePhone: c.alternatePhone || null,
              address: c.address || null,
              isPrimary: !!c.isPrimary,
            })),
          });
        }

        // 3. Record chronological employee history
        await tx.employeeHistory.create({
          data: {
            employeeId: locked.employeeId,
            eventType: EmployeeHistoryEventType.STATUS_CHANGED,
            previousValue: 'CONTACT_INFO_STAGED',
            newValue: 'CONTACT_INFO_UPDATED',
            performedById: user.id,
            metadata: {
              action: 'PROFILE_CHANGE_REQUEST_APPROVED',
              reviewNotes: dto.reviewNotes || 'Approved',
              requestId: locked.id,
            },
          },
        });
      }

      // 4. Update ProfileChangeRequest decision
      return tx.profileChangeRequest.update({
        where: { id: requestId },
        data: {
          status: targetStatus,
          reviewerId: user.id,
          reviewedAt: new Date(),
          reviewNotes: dto.reviewNotes || null,
        },
        include: {
          employee: {
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
              userId: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });

    // Record audit event
    await this.auditService.record({
      action:
        dto.decision === ProfileChangeReviewDecision.APPROVED
          ? 'PROFILE_CHANGE_APPROVED'
          : 'PROFILE_CHANGE_REJECTED',
      entity: 'ProfileChangeRequest',
      entityId: requestId,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        decision: dto.decision,
        reviewNotes: dto.reviewNotes,
        employeeId: updated.employeeId,
        reviewerId: user.id,
      },
    });

    // Notify employee of review outcome
    if (this.notificationsService && updated.employee?.userId) {
      await this.notificationsService.createNotification({
        userId: updated.employee.userId,
        organizationId: user.organizationId,
        title: `Profile Change Request ${dto.decision === ProfileChangeReviewDecision.APPROVED ? 'Approved' : 'Rejected'}`,
        message: `Your profile change request has been ${dto.decision.toLowerCase()}.${dto.reviewNotes ? ` Notes: ${dto.reviewNotes}` : ''}`,
        type: 'PROFILE_CHANGE_RESULT',
        link: '/profile',
        metadata: { requestId, decision: dto.decision },
        idempotencyKey: `profile-change-review-${requestId}`,
      });
    }

    return updated;
  }

  /**
   * Aggregates a unified view of all employee requests (Leave, WFH, Official Visits,
   * Attendance Regularization, and Profile Updates).
   * Derived strictly from the authenticated server-side session (IDOR prevention).
   * Supports server-side multi-type, status, date-boundary filtering, search, and pagination.
   */
  async getMyRequests(
    user: AuthenticatedUser,
    query: QueryUnifiedRequestsDto,
  ): Promise<UnifiedRequestsResponse> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException('No employee record linked to current user');
    }

    const requestedType = query.type ? query.type.toUpperCase() : 'ALL';
    const requestedStatus = query.status ? query.status.toUpperCase() : 'ALL';
    const search = query.search ? query.search.trim().toLowerCase() : '';

    const startBoundary = query.startDate ? new Date(`${query.startDate}T00:00:00.000Z`) : null;
    const endBoundary = query.endDate ? new Date(`${query.endDate}T23:59:59.999Z`) : null;

    // Queries to execute based on requested type
    const shouldFetchLeaves = requestedType === 'ALL' || requestedType === 'LEAVE';
    const shouldFetchWfh = requestedType === 'ALL' || requestedType === 'WFH';
    const shouldFetchVisits = requestedType === 'ALL' || requestedType === 'OFFICIAL_VISIT';
    const shouldFetchCorrections =
      requestedType === 'ALL' || requestedType === 'ATTENDANCE_CORRECTION';
    const shouldFetchProfiles = requestedType === 'ALL' || requestedType === 'PROFILE_CHANGE';
    const shouldFetchDocuments = requestedType === 'ALL' || requestedType === 'DOCUMENT';

    // 1. Leave requests
    const leavesPromise = shouldFetchLeaves
      ? this.prisma.leaveRequest.findMany({
          where: {
            employeeId: employee.id,
            organizationId: user.organizationId,
            ...(startBoundary || endBoundary
              ? {
                  createdAt: {
                    ...(startBoundary ? { gte: startBoundary } : {}),
                    ...(endBoundary ? { lte: endBoundary } : {}),
                  },
                }
              : {}),
          },
          include: {
            leaveType: true,
            approvals: {
              include: {
                approver: {
                  select: { firstName: true, lastName: true, email: true },
                },
              },
              orderBy: { decidedAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]);

    // 2. WFH requests
    const wfhPromise = shouldFetchWfh
      ? this.prisma.wfhRequest.findMany({
          where: {
            employeeId: employee.id,
            organizationId: user.organizationId,
            ...(startBoundary || endBoundary
              ? {
                  createdAt: {
                    ...(startBoundary ? { gte: startBoundary } : {}),
                    ...(endBoundary ? { lte: endBoundary } : {}),
                  },
                }
              : {}),
          },
          include: {
            approvals: {
              include: {
                approver: {
                  select: { firstName: true, lastName: true, email: true },
                },
              },
              orderBy: { decidedAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]);

    // 3. Official Visits
    const visitsPromise = shouldFetchVisits
      ? this.prisma.officialVisit.findMany({
          where: {
            employeeId: employee.id,
            organizationId: user.organizationId,
            ...(startBoundary || endBoundary
              ? {
                  createdAt: {
                    ...(startBoundary ? { gte: startBoundary } : {}),
                    ...(endBoundary ? { lte: endBoundary } : {}),
                  },
                }
              : {}),
          },
          include: {
            destinations: true,
            approvals: {
              include: {
                approver: {
                  select: { firstName: true, lastName: true, email: true },
                },
              },
              orderBy: { decidedAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]);

    // 4. Attendance Corrections
    const correctionsPromise = shouldFetchCorrections
      ? this.prisma.attendanceCorrectionRequest.findMany({
          where: {
            employeeId: employee.id,
            organizationId: user.organizationId,
            ...(startBoundary || endBoundary
              ? {
                  submittedAt: {
                    ...(startBoundary ? { gte: startBoundary } : {}),
                    ...(endBoundary ? { lte: endBoundary } : {}),
                  },
                }
              : {}),
          },
          include: {
            decision: {
              include: {
                reviewer: {
                  select: { firstName: true, lastName: true, email: true },
                },
              },
            },
          },
          orderBy: { submittedAt: 'desc' },
        })
      : Promise.resolve([]);

    // 5. Profile Changes
    const profilesPromise = shouldFetchProfiles
      ? this.prisma.profileChangeRequest.findMany({
          where: {
            employeeId: employee.id,
            organizationId: user.organizationId,
            ...(startBoundary || endBoundary
              ? {
                  submittedAt: {
                    ...(startBoundary ? { gte: startBoundary } : {}),
                    ...(endBoundary ? { lte: endBoundary } : {}),
                  },
                }
              : {}),
          },
          include: {
            reviewer: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { submittedAt: 'desc' },
        })
      : Promise.resolve([]);

    // 6. Employee Documents (Verification status requests)
    const documentsPromise = shouldFetchDocuments
      ? this.prisma.employeeDocumentMetadata.findMany({
          where: {
            employeeId: employee.id,
            ...(startBoundary || endBoundary
              ? {
                  createdAt: {
                    ...(startBoundary ? { gte: startBoundary } : {}),
                    ...(endBoundary ? { lte: endBoundary } : {}),
                  },
                }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]);

    const [leaves, wfh, visits, corrections, profiles, documents] = await Promise.all([
      leavesPromise,
      wfhPromise,
      visitsPromise,
      correctionsPromise,
      profilesPromise,
      documentsPromise,
    ]);

    const unifiedItems: UnifiedEmployeeRequest[] = [];

    // Map leaves
    for (const l of leaves) {
      const status = l.status === 'SUBMITTED' ? 'PENDING' : (l.status as any);
      unifiedItems.push({
        id: l.id,
        type: 'LEAVE',
        title: `${l.leaveType?.name || 'Leave'}`,
        category: l.leaveType?.code || 'LEAVE',
        startDate: l.startDate ? l.startDate.toISOString().split('T')[0] : '',
        endDate: l.endDate ? l.endDate.toISOString().split('T')[0] : '',
        daysCount: (l as any).chargeableDays
          ? Number((l as any).chargeableDays)
          : (l as any).days || 1,
        status,
        reason: l.reason,
        submittedAt: l.createdAt.toISOString(),
        reviewedAt: l.approvals?.[0]?.decidedAt ? l.approvals[0].decidedAt.toISOString() : null,
        reviewerName: l.approvals?.[0]?.approver
          ? `${l.approvals[0].approver.firstName} ${l.approvals[0].approver.lastName}`
          : null,
        reviewNotes: l.approvals?.[0]?.comments || null,
        canCancel: l.status === 'SUBMITTED' || l.status === 'APPROVED',
        href: '/leave',
        details: {
          durationType: l.durationType,
          chargeableDays: (l as any).chargeableDays
            ? Number((l as any).chargeableDays)
            : (l as any).days || 1,
        },
      });
    }

    // Map WFH
    for (const w of wfh) {
      const status = w.status === 'SUBMITTED' ? 'PENDING' : (w.status as any);
      const days = Math.max(
        1,
        Math.ceil((w.endDate.getTime() - w.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      );
      unifiedItems.push({
        id: w.id,
        type: 'WFH',
        title: `Work From Home (${(w.durationType || 'FULL_DAY').replace(/_/g, ' ')})`,
        category: w.durationType,
        startDate: w.startDate ? w.startDate.toISOString().split('T')[0] : '',
        endDate: w.endDate ? w.endDate.toISOString().split('T')[0] : '',
        daysCount: days,
        status,
        reason: w.reason,
        submittedAt: w.createdAt.toISOString(),
        reviewedAt: w.approvals?.[0]?.decidedAt ? w.approvals[0].decidedAt.toISOString() : null,
        reviewerName: w.approvals?.[0]?.approver
          ? `${w.approvals[0].approver.firstName} ${w.approvals[0].approver.lastName}`
          : null,
        reviewNotes: w.approvals?.[0]?.comments || null,
        canCancel: w.status === 'SUBMITTED',
        href: '/wfh',
        details: { durationType: w.durationType },
      });
    }

    // Map Official Visits
    for (const v of visits) {
      const status = v.status === 'SUBMITTED' ? 'PENDING' : (v.status as any);
      unifiedItems.push({
        id: v.id,
        type: 'OFFICIAL_VISIT',
        title: `Official Visit: ${v.title}`,
        category: v.destinations?.[0]?.destinationName || 'Outdoor Duty',
        startDate: v.startDate ? v.startDate.toISOString().split('T')[0] : '',
        endDate: v.endDate ? v.endDate.toISOString().split('T')[0] : '',
        daysCount: v.expectedDurationDays ? Number(v.expectedDurationDays) : 1,
        status,
        reason: v.purpose,
        submittedAt: v.createdAt.toISOString(),
        reviewedAt: v.approvals?.[0]?.decidedAt ? v.approvals[0].decidedAt.toISOString() : null,
        reviewerName: v.approvals?.[0]?.approver
          ? `${v.approvals[0].approver.firstName} ${v.approvals[0].approver.lastName}`
          : null,
        reviewNotes: v.approvals?.[0]?.comments || null,
        canCancel: v.status === 'SUBMITTED',
        href: '/visits',
        details: { destinationsCount: v.destinations?.length || 0 },
      });
    }

    // Map Corrections
    for (const c of corrections as any[]) {
      const decision = c.decisions?.[0] || c.decision;
      unifiedItems.push({
        id: c.id,
        type: 'ATTENDANCE_CORRECTION',
        title: `Attendance Regularization (${c.targetDate.toISOString().split('T')[0]})`,
        category: 'PUNCH_CORRECTION',
        startDate: c.targetDate.toISOString().split('T')[0],
        endDate: c.targetDate.toISOString().split('T')[0],
        daysCount: 1,
        status: c.status as any,
        reason: c.reason,
        submittedAt: c.submittedAt ? c.submittedAt.toISOString() : new Date().toISOString(),
        reviewedAt: decision?.decidedAt ? decision.decidedAt.toISOString() : null,
        reviewerName: decision?.reviewer
          ? `${decision.reviewer.firstName} ${decision.reviewer.lastName}`
          : null,
        reviewNotes: decision?.reason || null,
        canCancel: c.status === 'PENDING',
        href: '/attendance',
        details: {
          requestedCheckIn: c.requestedCheckIn?.toISOString() || null,
          requestedCheckOut: c.requestedCheckOut?.toISOString() || null,
        },
      });
    }

    // Map Profiles
    for (const p of profiles) {
      unifiedItems.push({
        id: p.id,
        type: 'PROFILE_CHANGE',
        title: 'Profile Contact Update',
        category: 'Personal Details',
        startDate: p.createdAt ? p.createdAt.toISOString().split('T')[0] : '',
        endDate: p.createdAt ? p.createdAt.toISOString().split('T')[0] : '',
        daysCount: 1,
        status: p.status as any,
        reason: p.reason || 'Requested personal contact / emergency updates',
        submittedAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
        reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
        reviewerName: p.reviewer ? `${p.reviewer.firstName} ${p.reviewer.lastName}` : null,
        reviewNotes: p.reviewNotes || null,
        canCancel: p.status === 'PENDING',
        href: '/profile',
        details: { stagedData: p.data },
      });
    }

    // Map Documents
    for (const d of documents as any[]) {
      const status = d.isVerified ? 'APPROVED' : 'PENDING';
      unifiedItems.push({
        id: d.id,
        type: 'DOCUMENT',
        title: `Document: ${d.documentName}`,
        category: d.documentType,
        startDate: d.createdAt ? d.createdAt.toISOString().split('T')[0] : '',
        endDate: d.expiryDate
          ? d.expiryDate.toISOString().split('T')[0]
          : d.createdAt
            ? d.createdAt.toISOString().split('T')[0]
            : '',
        daysCount: 1,
        status,
        reason: `Uploaded for HR verification (Ref: ${d.documentNumber || 'N/A'})`,
        submittedAt: d.createdAt ? d.createdAt.toISOString() : new Date().toISOString(),
        reviewedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
        reviewerName: d.verifiedById ? 'HR Reviewer' : null,
        reviewNotes: null,
        canCancel: !d.isVerified,
        href: '/documents',
        details: {
          mimeType: d.mimeType,
          fileSize: d.fileSize,
          expiryDate: d.expiryDate?.toISOString() || null,
        },
      });
    }

    // Calculate counts before status and search filter
    const counts = {
      all: unifiedItems.length,
      leave: unifiedItems.filter((i) => i.type === 'LEAVE').length,
      wfh: unifiedItems.filter((i) => i.type === 'WFH').length,
      visit: unifiedItems.filter((i) => i.type === 'OFFICIAL_VISIT').length,
      correction: unifiedItems.filter((i) => i.type === 'ATTENDANCE_CORRECTION').length,
      profile: unifiedItems.filter((i) => i.type === 'PROFILE_CHANGE').length,
      document: unifiedItems.filter((i) => i.type === 'DOCUMENT').length,
      pending: unifiedItems.filter((i) => i.status === 'PENDING').length,
    };

    // Filter by status
    let filtered = unifiedItems;
    if (requestedStatus !== 'ALL') {
      filtered = filtered.filter((i) => i.status === requestedStatus);
    }

    // Filter by search keyword
    if (search) {
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(search) ||
          i.reason.toLowerCase().includes(search) ||
          (i.reviewNotes && i.reviewNotes.toLowerCase().includes(search)) ||
          (i.category && i.category.toLowerCase().includes(search)),
      );
    }

    // Sort by submittedAt descending
    filtered.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    const total = filtered.length;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const paginated = filtered.slice(skip, skip + limit);

    return {
      items: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      counts,
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const existsInOrg = await this.prisma.employee.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });

    if (!existsInOrg || existsInOrg.organizationId !== user.organizationId) {
      throw new NotFoundException(`Employee #${id} not found`);
    }

    const scopeFilter = await this.getScopedEmployeeFilter(user);

    const employee = await this.prisma.employee.findFirst({
      where: {
        AND: [{ id }, scopeFilter],
      },
      include: {
        employment: {
          include: {
            branch: true,
            department: true,
            designation: true,
            manager: {
              select: {
                id: true,
                displayName: true,
                employeeCode: true,
                profilePhoto: true,
              },
            },
          },
        },
        contact: true,
        emergencyContacts: true,
        documents: true,
        history: {
          orderBy: { timestamp: 'desc' },
          include: {
            performedBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new ForbiddenException(
        `Access denied: You do not have permission to view employee #${id} outside your authorized scope`,
      );
    }

    return employee;
  }

  // ---------------------------------------------------------------------------
  // Create Employee Flow (Transactional)
  // ---------------------------------------------------------------------------

  async create(dto: CreateEmployeeDto, user: AuthenticatedUser) {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      throw new ForbiddenException('Only Admin and HR roles are authorized to create employees');
    }

    const orgId = user.organizationId;

    // 1. Check duplicate employee code
    const existingCode = await this.prisma.employee.findUnique({
      where: {
        organizationId_employeeCode: {
          organizationId: orgId,
          employeeCode: dto.employeeCode,
        },
      },
    });
    if (existingCode) {
      throw new ConflictException(`Employee code '${dto.employeeCode}' already exists`);
    }

    // 2. Check duplicate work email
    const existingEmail = await this.prisma.employeeContact.findFirst({
      where: {
        workEmail: dto.workEmail,
        employee: { organizationId: orgId },
      },
    });
    if (existingEmail) {
      throw new ConflictException(`Work email '${dto.workEmail}' is already registered`);
    }

    // 3. Resolve and Verify Designation
    let resolvedDesignationId = dto.designationId;

    if (dto.customDesignation && dto.customDesignation.trim()) {
      const customTitle = dto.customDesignation.trim();
      const customCode =
        customTitle
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .slice(0, 20) || `DESIG_${Date.now().toString().slice(-6)}`;

      let customDesig = await this.prisma.designation.findFirst({
        where: {
          organizationId: orgId,
          OR: [{ title: { equals: customTitle, mode: 'insensitive' } }, { code: customCode }],
        },
      });

      if (!customDesig) {
        customDesig = await this.prisma.designation.create({
          data: {
            organizationId: orgId,
            departmentId: dto.departmentId,
            code: customCode,
            title: customTitle,
            name: customTitle,
            level: 1,
            description: `Custom designation: ${customTitle}`,
          },
        });
      }
      resolvedDesignationId = customDesig.id;
    }

    if (!resolvedDesignationId) {
      throw new BadRequestException('Designation or custom designation title is required');
    }

    // Verify Branch, Dept, Designation
    const [branch, dept, desig] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: dto.branchId } }),
      this.prisma.department.findUnique({ where: { id: dto.departmentId } }),
      this.prisma.designation.findUnique({ where: { id: resolvedDesignationId } }),
    ]);

    if (!branch || branch.organizationId !== orgId) {
      throw new BadRequestException('Invalid or unauthorized branch specified');
    }
    if (!dept || dept.organizationId !== orgId) {
      throw new BadRequestException('Invalid or unauthorized department specified');
    }
    if (!desig || desig.organizationId !== orgId) {
      throw new BadRequestException('Invalid or unauthorized designation specified');
    }

    // 4. Validate manager hierarchy
    await this.validateManagerHierarchy(null, dto.managerId, orgId);

    const displayName =
      dto.displayName ||
      `${dto.firstName} ${dto.middleName ? dto.middleName + ' ' : ''}${dto.lastName}`.trim();

    // 5. Execute transactional creation
    const createdEmployee = await this.prisma.$transaction(async (tx) => {
      let createdUserId: string | null = null;

      // Provision User login account if requested
      if (dto.createLoginAccount !== false) {
        const initialPassword = dto.initialPassword || 'Password@123';
        const passwordHash = await argon2.hash(initialPassword);

        // Determine target role from dto or default to EMPLOYEE
        const targetRoleCode =
          dto.role && Object.values(RoleCode).includes(dto.role) ? dto.role : RoleCode.EMPLOYEE;

        const existingUser = await tx.user.findFirst({
          where: { organizationId: orgId, email: dto.workEmail },
        });

        if (!existingUser) {
          const newUser = await tx.user.create({
            data: {
              organizationId: orgId,
              branchId: dto.branchId,
              departmentId: dto.departmentId,
              designationId: resolvedDesignationId,
              employeeCode: dto.employeeCode,
              email: dto.workEmail,
              passwordHash,
              firstName: dto.firstName,
              lastName: dto.lastName,
              phone: dto.phone || null,
              status: UserStatus.ACTIVE,
              isActive: true,
            },
          });
          createdUserId = newUser.id;

          // Assign specified system access role
          const targetRole = await tx.role.findFirst({
            where: { organizationId: orgId, code: targetRoleCode },
          });
          if (targetRole) {
            await tx.userRole.create({
              data: {
                userId: newUser.id,
                roleId: targetRole.id,
                assignedBy: user.id,
              },
            });
          }
        } else {
          createdUserId = existingUser.id;

          // Wire assigned role to existing user if not present
          const targetRole = await tx.role.findFirst({
            where: { organizationId: orgId, code: targetRoleCode },
          });
          if (targetRole) {
            const hasRole = await tx.userRole.findUnique({
              where: {
                userId_roleId: {
                  userId: existingUser.id,
                  roleId: targetRole.id,
                },
              },
            });
            if (!hasRole) {
              await tx.userRole.create({
                data: {
                  userId: existingUser.id,
                  roleId: targetRole.id,
                  assignedBy: user.id,
                },
              });
            }
          }
        }
      }

      // Create Employee Record
      const emp = await tx.employee.create({
        data: {
          userId: createdUserId,
          organizationId: orgId,
          employeeCode: dto.employeeCode,
          firstName: dto.firstName,
          middleName: dto.middleName || null,
          lastName: dto.lastName,
          displayName,
          profilePhoto: dto.profilePhoto || null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender || Gender.PREFER_NOT_TO_SAY,
          status: dto.employmentStatus || EmploymentStatus.PROBATION,
          joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : new Date(),
          managerId: dto.managerId || null,
        },
      });

      // Create Employment
      await tx.employeeEmployment.create({
        data: {
          employeeId: emp.id,
          branchId: dto.branchId,
          departmentId: dto.departmentId,
          designationId: resolvedDesignationId,
          managerId: dto.managerId || null,
          employmentType: dto.employmentType || EmploymentType.FULL_TIME,
          employmentStatus: dto.employmentStatus || EmploymentStatus.PROBATION,
          workMode: dto.workMode || WorkMode.OFFICE,
          joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : new Date(),
          probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : null,
          noticePeriodDays: dto.noticePeriodDays ?? 30,
        },
      });

      // Create Contact
      await tx.employeeContact.create({
        data: {
          employeeId: emp.id,
          workEmail: dto.workEmail,
          personalEmail: dto.personalEmail || null,
          phone: dto.phone || null,
          alternatePhone: dto.alternatePhone || null,
          address: dto.address || null,
          city: dto.city || null,
          state: dto.state || null,
          postalCode: dto.postalCode || null,
          country: dto.country || 'India',
        },
      });

      // Create Emergency Contacts
      if (dto.emergencyContacts && dto.emergencyContacts.length > 0) {
        for (const ec of dto.emergencyContacts) {
          await tx.emergencyContact.create({
            data: {
              employeeId: emp.id,
              name: ec.name,
              relationship: ec.relationship,
              phone: ec.phone,
              alternatePhone: ec.alternatePhone || null,
              address: ec.address || null,
              isPrimary: ec.isPrimary ?? false,
            },
          });
        }
      }

      // Create initial JOINED history
      await tx.employeeHistory.create({
        data: {
          employeeId: emp.id,
          eventType: EmployeeHistoryEventType.JOINED,
          previousValue: null,
          newValue: emp.status,
          performedById: user.id,
          metadata: {
            employeeCode: emp.employeeCode,
            department: dept.name,
            designation: desig.title,
            branch: branch.name,
          },
        },
      });

      return emp;
    });

    await this.auditService.record({
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      entityId: createdEmployee.id,
      userId: user.id,
      organizationId: orgId,
      metadata: {
        employeeCode: createdEmployee.employeeCode,
        name: createdEmployee.displayName,
      },
    });

    return this.findOne(createdEmployee.id, user);
  }

  // ---------------------------------------------------------------------------
  // Update Employee (Tracks History on Changes)
  // ---------------------------------------------------------------------------

  async update(id: string, dto: UpdateEmployeeDto, user: AuthenticatedUser) {
    const existing = await this.findOne(id, user);

    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      const isSelf = existing.userId === user.id || existing.employeeCode === user.employeeCode;
      if (!isSelf && !user.roles.includes('MANAGER')) {
        throw new ForbiddenException('You are not authorized to update this employee profile');
      }

      // Prohibit non-Admin/HR from modifying organizational assignments
      if (
        dto.branchId ||
        dto.departmentId ||
        dto.designationId ||
        dto.managerId !== undefined ||
        dto.employmentType ||
        dto.workMode
      ) {
        throw new ForbiddenException(
          'Only Admin and HR roles can modify organizational assignments (branch, department, designation, manager, or employment terms)',
        );
      }
    }

    // Verify manager hierarchy if managerId is being modified
    if (dto.managerId !== undefined && dto.managerId !== existing.employment?.managerId) {
      await this.validateManagerHierarchy(id, dto.managerId, user.organizationId);
    }

    const historiesToCreate: Array<{
      eventType: EmployeeHistoryEventType;
      previousValue: string | null;
      newValue: string | null;
    }> = [];

    // Track department change
    if (dto.departmentId && dto.departmentId !== existing.employment?.departmentId) {
      const newDept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.DEPARTMENT_CHANGED,
        previousValue: existing.employment?.department?.name || null,
        newValue: newDept?.name || dto.departmentId,
      });
    }

    // Track designation change
    if (dto.designationId && dto.designationId !== existing.employment?.designationId) {
      const newDesig = await this.prisma.designation.findUnique({
        where: { id: dto.designationId },
      });
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.DESIGNATION_CHANGED,
        previousValue: existing.employment?.designation?.title || null,
        newValue: newDesig?.title || dto.designationId,
      });
    }

    // Track manager change
    if (dto.managerId !== undefined && dto.managerId !== existing.employment?.managerId) {
      const newMgr = dto.managerId
        ? await this.prisma.employee.findUnique({ where: { id: dto.managerId } })
        : null;
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.MANAGER_CHANGED,
        previousValue: existing.employment?.manager?.displayName || null,
        newValue: newMgr ? newMgr.displayName : 'None',
      });
    }

    // Track branch change
    if (dto.branchId && dto.branchId !== existing.employment?.branchId) {
      const newBranch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.BRANCH_CHANGED,
        previousValue: existing.employment?.branch?.name || null,
        newValue: newBranch?.name || dto.branchId,
      });
    }

    // Track work mode change
    if (dto.workMode && dto.workMode !== existing.employment?.workMode) {
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.WORK_MODE_CHANGED,
        previousValue: existing.employment?.workMode || null,
        newValue: dto.workMode,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Update Core Employee
      await tx.employee.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          displayName: dto.displayName,
          profilePhoto: dto.profilePhoto,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          managerId: dto.managerId !== undefined ? dto.managerId : undefined,
        },
      });

      // 2. Update Employment
      if (existing.employment) {
        await tx.employeeEmployment.update({
          where: { employeeId: id },
          data: {
            branchId: dto.branchId,
            departmentId: dto.departmentId,
            designationId: dto.designationId,
            managerId: dto.managerId,
            employmentType: dto.employmentType,
            workMode: dto.workMode,
            noticePeriodDays: dto.noticePeriodDays,
            probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : undefined,
            confirmationDate: dto.confirmationDate ? new Date(dto.confirmationDate) : undefined,
          },
        });
      }

      // 3. Update Contact
      if (existing.contact) {
        await tx.employeeContact.update({
          where: { employeeId: id },
          data: {
            personalEmail: dto.personalEmail,
            phone: dto.phone,
            alternatePhone: dto.alternatePhone,
            address: dto.address,
            city: dto.city,
            state: dto.state,
            postalCode: dto.postalCode,
            country: dto.country,
          },
        });
      }

      // 4. Update Emergency Contacts if provided
      if (dto.emergencyContacts) {
        await tx.emergencyContact.deleteMany({ where: { employeeId: id } });
        for (const ec of dto.emergencyContacts) {
          await tx.emergencyContact.create({
            data: {
              employeeId: id,
              name: ec.name,
              relationship: ec.relationship,
              phone: ec.phone,
              alternatePhone: ec.alternatePhone || null,
              address: ec.address || null,
              isPrimary: ec.isPrimary ?? false,
            },
          });
        }
      }

      // 5. Record History Entries
      for (const h of historiesToCreate) {
        await tx.employeeHistory.create({
          data: {
            employeeId: id,
            eventType: h.eventType,
            previousValue: h.previousValue,
            newValue: h.newValue,
            performedById: user.id,
          },
        });
      }
    });

    await this.auditService.record({
      action: 'EMPLOYEE_UPDATED',
      entity: 'Employee',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { changes: historiesToCreate },
    });

    return this.findOne(id, user);
  }

  // ---------------------------------------------------------------------------
  // Controlled Status Lifecycle Transition
  // ---------------------------------------------------------------------------

  async transitionStatus(id: string, dto: TransitionStatusDto, user: AuthenticatedUser) {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      throw new ForbiddenException(
        'Only Admin and HR roles are authorized to transition employee status',
      );
    }

    const employee = await this.findOne(id, user);
    const currentStatus = employee.status;
    const nextStatus = dto.status;

    if (currentStatus === nextStatus) {
      return employee;
    }

    const allowedNextStatuses = EmployeesService.VALID_STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid status transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: [${allowedNextStatuses.join(
          ', ',
        )}]`,
      );
    }

    const exitDate =
      nextStatus === EmploymentStatus.EXITED || nextStatus === EmploymentStatus.TERMINATED
        ? dto.effectiveDate
          ? new Date(dto.effectiveDate)
          : new Date()
        : null;

    const isActive = nextStatus !== EmploymentStatus.EXITED;

    await this.prisma.$transaction(async (tx) => {
      // 1. Update Employee table
      await tx.employee.update({
        where: { id },
        data: {
          status: nextStatus,
          exitDate,
          isActive,
        },
      });

      // 2. Update EmployeeEmployment table
      await tx.employeeEmployment.update({
        where: { employeeId: id },
        data: {
          employmentStatus: nextStatus,
        },
      });

      // 3. If employee exited or terminated, lock or deactivate user account
      if (employee.userId && !isActive) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { status: UserStatus.INACTIVE, isActive: false },
        });
      }

      // 4. Record Employee History
      await tx.employeeHistory.create({
        data: {
          employeeId: id,
          eventType: EmployeeHistoryEventType.STATUS_CHANGED,
          previousValue: currentStatus,
          newValue: nextStatus,
          performedById: user.id,
          metadata: {
            reason: dto.reason || null,
            effectiveDate: dto.effectiveDate || null,
          },
        },
      });
    });

    await this.auditService.record({
      action: 'EMPLOYEE_STATUS_CHANGED',
      entity: 'Employee',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        from: currentStatus,
        to: nextStatus,
        reason: dto.reason,
      },
    });

    return this.findOne(id, user);
  }

  // ---------------------------------------------------------------------------
  // Deactivate Employee (Soft Deletion)
  // ---------------------------------------------------------------------------

  async deactivate(id: string, user: AuthenticatedUser) {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      throw new ForbiddenException(
        'Only Admin and HR roles are authorized to deactivate employees',
      );
    }

    const employee = await this.findOne(id, user);

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { isActive: false, status: EmploymentStatus.EXITED },
      });

      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: false, status: UserStatus.INACTIVE },
        });
      }

      await tx.employeeHistory.create({
        data: {
          employeeId: id,
          eventType: EmployeeHistoryEventType.EXITED,
          previousValue: employee.status,
          newValue: EmploymentStatus.EXITED,
          performedById: user.id,
        },
      });
    });

    await this.auditService.record({
      action: 'EMPLOYEE_DEACTIVATED',
      entity: 'Employee',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
    });

    return { success: true, message: `Employee #${id} deactivated successfully` };
  }

  // ---------------------------------------------------------------------------
  // History Retrieval
  // ---------------------------------------------------------------------------

  async getHistory(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user); // Verify existence & scope

    const history = await this.prisma.employeeHistory.findMany({
      where: { employeeId: id },
      orderBy: { timestamp: 'desc' },
      include: {
        performedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return history;
  }

  // ---------------------------------------------------------------------------
  // Interactive Org Chart Hierarchy
  // ---------------------------------------------------------------------------

  async getOrgChart(params: {
    organizationId: string;
    departmentId?: string;
    branchId?: string;
    rootEmployeeId?: string;
  }) {
    const where: Prisma.EmployeeWhereInput = {
      organizationId: params.organizationId,
      isActive: true,
    };

    if (params.departmentId || params.branchId) {
      const empWhere: Prisma.EmployeeEmploymentWhereInput = {};
      if (params.departmentId) empWhere.departmentId = params.departmentId;
      if (params.branchId) empWhere.branchId = params.branchId;
      where.employment = empWhere;
    }

    const employees = await this.prisma.employee.findMany({
      where,
      include: {
        contact: {
          select: {
            workEmail: true,
            phone: true,
          },
        },
        employment: {
          include: {
            department: { select: { id: true, name: true, code: true } },
            designation: { select: { id: true, title: true, code: true } },
            branch: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { displayName: 'asc' },
    });

    // Build node lookup map
    const nodeMap = new Map<string, any>();

    for (const e of employees) {
      const managerId = e.managerId || e.employment?.managerId || null;
      const subordinatesArr: any[] = [];
      const node = {
        id: e.id,
        employeeCode: e.employeeCode,
        name: e.displayName,
        displayName: e.displayName,
        firstName: e.firstName,
        lastName: e.lastName,
        designation: e.employment?.designation?.title || 'Team Member',
        designationCode: e.employment?.designation?.code || '',
        department: e.employment?.department?.name || 'General',
        departmentId: e.employment?.department?.id || e.employment?.departmentId || null,
        departmentCode: e.employment?.department?.code || '',
        branch: e.employment?.branch?.name || 'Main',
        branchId: e.employment?.branch?.id || e.employment?.branchId || null,
        avatarUrl: e.profilePhoto,
        profilePhoto: e.profilePhoto,
        status: e.status,
        workMode: e.employment?.workMode || 'OFFICE',
        employmentType: e.employment?.employmentType || 'FULL_TIME',
        joiningDate: e.joiningDate,
        workEmail: e.contact?.workEmail || null,
        phone: e.contact?.phone || null,
        managerId,
        managerName: null as string | null,
        directReportsCount: 0,
        subordinates: subordinatesArr,
        children: subordinatesArr,
      };
      nodeMap.set(e.id, node);
    }

    // Assemble hierarchical tree
    const rootNodes: any[] = [];

    for (const node of nodeMap.values()) {
      if (node.managerId && nodeMap.has(node.managerId)) {
        const parent = nodeMap.get(node.managerId)!;
        node.managerName = parent.name;
        parent.subordinates.push(node);
        parent.directReportsCount += 1;
      } else {
        rootNodes.push(node);
      }
    }

    if (params.rootEmployeeId) {
      const rootNode = nodeMap.get(params.rootEmployeeId);
      if (!rootNode) {
        throw new NotFoundException(
          `Root employee #${params.rootEmployeeId} not found in this organization`,
        );
      }
      return [rootNode];
    }

    return rootNodes;
  }

  // ---------------------------------------------------------------------------
  // Bulk Employee Import (CSV & Excel)
  // ---------------------------------------------------------------------------

  async previewImport(fileBuffer: Buffer, organizationId: string) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    if (!rawRows || rawRows.length === 0) {
      throw new BadRequestException('Uploaded file is empty or contains no valid rows');
    }

    // Fetch existing lookup caches
    const [existingEmployees, branches, departments, designations] = await Promise.all([
      this.prisma.employee.findMany({
        where: { organizationId },
        select: { id: true, employeeCode: true, contact: { select: { workEmail: true } } },
      }),
      this.prisma.branch.findMany({
        where: { organizationId },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.department.findMany({
        where: { organizationId },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.designation.findMany({
        where: { organizationId },
        select: { id: true, code: true, title: true },
      }),
    ]);

    const existingCodes = new Set(existingEmployees.map((e) => e.employeeCode.toUpperCase()));
    const existingEmails = new Set(
      existingEmployees.map((e) => e.contact?.workEmail?.toLowerCase()).filter(Boolean),
    );

    // Support lookup by code OR name/title
    const branchMap = new Map<string, { id: string; name: string }>();
    branches.forEach((b) => {
      branchMap.set(b.code.toUpperCase(), { id: b.id, name: b.name });
      branchMap.set(b.name.toUpperCase(), { id: b.id, name: b.name });
    });

    const deptMap = new Map<string, { id: string; name: string }>();
    departments.forEach((d) => {
      deptMap.set(d.code.toUpperCase(), { id: d.id, name: d.name });
      deptMap.set(d.name.toUpperCase(), { id: d.id, name: d.name });
    });

    const desigMap = new Map<string, { id: string; title: string }>();
    designations.forEach((d) => {
      desigMap.set(d.code.toUpperCase(), { id: d.id, title: d.title });
      desigMap.set(d.title.toUpperCase(), { id: d.id, title: d.title });
    });

    const errors: Array<{ row: number; field: string; value: unknown; message: string }> = [];
    const validRows: any[] = [];
    const seenCodesInBatch = new Set<string>();
    const seenEmailsInBatch = new Set<string>();

    const VALID_EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];
    const VALID_STATUSES = ['PROBATION', 'ACTIVE', 'ON_NOTICE', 'RESIGNED', 'TERMINATED', 'EXITED'];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // Accounting for 1-indexed Excel + header row

      const code = String(row['employeeCode'] || row['Employee Code'] || row['code'] || '').trim();
      const firstName = String(row['firstName'] || row['First Name'] || '').trim();
      const lastName = String(row['lastName'] || row['Last Name'] || '').trim();
      const email = String(row['workEmail'] || row['Work Email'] || row['email'] || '')
        .trim()
        .toLowerCase();
      const deptVal = String(
        row['departmentCode'] ||
          row['Department Code'] ||
          row['department'] ||
          row['Department'] ||
          '',
      )
        .trim()
        .toUpperCase();
      const desigVal = String(
        row['designationCode'] ||
          row['Designation Code'] ||
          row['designation'] ||
          row['Designation'] ||
          '',
      )
        .trim()
        .toUpperCase();
      const branchVal = String(
        row['branchCode'] || row['Branch Code'] || row['branch'] || row['Branch'] || '',
      )
        .trim()
        .toUpperCase();
      const managerCode = String(
        row['managerEmployeeCode'] ||
          row['Manager Code'] ||
          row['managerCode'] ||
          row['manager'] ||
          '',
      )
        .trim()
        .toUpperCase();

      const rawType = String(row['employmentType'] || row['Employment Type'] || 'FULL_TIME')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_');
      const rawStatus = String(
        row['employmentStatus'] || row['status'] || row['Status'] || 'PROBATION',
      )
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_');
      const workMode = String(row['workMode'] || row['Work Mode'] || 'OFFICE')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_');

      let rowHasError = false;

      // 1. Employee Code Validation
      if (!code) {
        errors.push({
          row: rowNum,
          field: 'employeeCode',
          value: code,
          message: 'Employee Code is required',
        });
        rowHasError = true;
      } else if (existingCodes.has(code.toUpperCase())) {
        errors.push({
          row: rowNum,
          field: 'employeeCode',
          value: code,
          message: `Employee Code '${code}' already exists in database`,
        });
        rowHasError = true;
      } else if (seenCodesInBatch.has(code.toUpperCase())) {
        errors.push({
          row: rowNum,
          field: 'employeeCode',
          value: code,
          message: `Duplicate Employee Code '${code}' in upload batch`,
        });
        rowHasError = true;
      }

      // 2. Name Validation
      if (!firstName) {
        errors.push({
          row: rowNum,
          field: 'firstName',
          value: firstName,
          message: 'First Name is required',
        });
        rowHasError = true;
      }

      if (!lastName) {
        errors.push({
          row: rowNum,
          field: 'lastName',
          value: lastName,
          message: 'Last Name is required',
        });
        rowHasError = true;
      }

      // 3. Email Validation
      if (!email) {
        errors.push({
          row: rowNum,
          field: 'workEmail',
          value: email,
          message: 'Work Email is required',
        });
        rowHasError = true;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({
          row: rowNum,
          field: 'workEmail',
          value: email,
          message: 'Invalid email address format',
        });
        rowHasError = true;
      } else if (existingEmails.has(email)) {
        errors.push({
          row: rowNum,
          field: 'workEmail',
          value: email,
          message: `Email '${email}' already registered`,
        });
        rowHasError = true;
      } else if (seenEmailsInBatch.has(email)) {
        errors.push({
          row: rowNum,
          field: 'workEmail',
          value: email,
          message: `Duplicate email '${email}' in upload batch`,
        });
        rowHasError = true;
      }

      // 4. Department Validation
      if (!deptVal || !deptMap.has(deptVal)) {
        errors.push({
          row: rowNum,
          field: 'departmentCode',
          value: deptVal,
          message: `Department '${deptVal}' not found in organization`,
        });
        rowHasError = true;
      }

      // 5. Designation Validation
      if (!desigVal || !desigMap.has(desigVal)) {
        errors.push({
          row: rowNum,
          field: 'designationCode',
          value: desigVal,
          message: `Designation '${desigVal}' not found in organization`,
        });
        rowHasError = true;
      }

      // 6. Branch Validation
      if (!branchVal || !branchMap.has(branchVal)) {
        errors.push({
          row: rowNum,
          field: 'branchCode',
          value: branchVal,
          message: `Branch '${branchVal}' not found in organization`,
        });
        rowHasError = true;
      }

      // 7. Manager Hierarchy Validation
      if (managerCode) {
        if (code && managerCode.toUpperCase() === code.toUpperCase()) {
          errors.push({
            row: rowNum,
            field: 'managerEmployeeCode',
            value: managerCode,
            message: 'Employee cannot be their own reporting manager',
          });
          rowHasError = true;
        } else if (
          !existingCodes.has(managerCode.toUpperCase()) &&
          !seenCodesInBatch.has(managerCode.toUpperCase())
        ) {
          errors.push({
            row: rowNum,
            field: 'managerEmployeeCode',
            value: managerCode,
            message: `Manager '${managerCode}' not found in database or prior batch rows`,
          });
          rowHasError = true;
        }
      }

      // 8. Employment Type Validation
      if (rawType && !VALID_EMPLOYMENT_TYPES.includes(rawType)) {
        errors.push({
          row: rowNum,
          field: 'employmentType',
          value: rawType,
          message: `Invalid employment type '${rawType}'. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(', ')}`,
        });
        rowHasError = true;
      }

      // 9. Status Validation
      if (rawStatus && !VALID_STATUSES.includes(rawStatus)) {
        errors.push({
          row: rowNum,
          field: 'employmentStatus',
          value: rawStatus,
          message: `Invalid status '${rawStatus}'. Must be one of: ${VALID_STATUSES.join(', ')}`,
        });
        rowHasError = true;
      }

      if (code) seenCodesInBatch.add(code.toUpperCase());
      if (email) seenEmailsInBatch.add(email);

      if (!rowHasError) {
        const resolvedDept = deptMap.get(deptVal)!;
        const resolvedDesig = desigMap.get(desigVal)!;
        const resolvedBranch = branchMap.get(branchVal)!;

        validRows.push({
          rowNumber: rowNum,
          employeeCode: code,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`.trim(),
          workEmail: email,
          phone: row['phone'] || row['Phone'] || null,
          departmentId: resolvedDept.id,
          departmentName: resolvedDept.name,
          designationId: resolvedDesig.id,
          designationTitle: resolvedDesig.title,
          branchId: resolvedBranch.id,
          branchName: resolvedBranch.name,
          managerEmployeeCode: managerCode || null,
          employmentType: rawType || EmploymentType.FULL_TIME,
          employmentStatus: rawStatus || EmploymentStatus.PROBATION,
          workMode: workMode || WorkMode.OFFICE,
          joiningDate: row['joiningDate'] || new Date().toISOString(),
        });
      }
    }

    return {
      totalRows: rawRows.length,
      validRowsCount: validRows.length,
      errorRowsCount: errors.length,
      errors,
      previewData: validRows.slice(0, 15),
      validatedRows: validRows,
    };
  }

  async confirmImport(rows: any[], user: AuthenticatedUser) {
    if (!rows || rows.length === 0) {
      throw new BadRequestException('No validated rows provided for import');
    }

    const orgId = user.organizationId;
    let importedCount = 0;

    // Password for imported accounts
    const passwordHash = await argon2.hash('Welcome@123');

    // Fetch existing employee lookup for manager resolution
    const existingEmployees = await this.prisma.employee.findMany({
      where: { organizationId: orgId },
      select: { id: true, employeeCode: true },
    });
    const managerLookup = new Map(
      existingEmployees.map((e) => [e.employeeCode.toUpperCase(), e.id]),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        // Resolve manager ID if provided
        let managerId: string | null = null;
        if (row.managerEmployeeCode && managerLookup.has(row.managerEmployeeCode.toUpperCase())) {
          managerId = managerLookup.get(row.managerEmployeeCode.toUpperCase())!;
        }

        // 1. Create user account
        const userAccount = await tx.user.create({
          data: {
            organizationId: orgId,
            branchId: row.branchId,
            departmentId: row.departmentId,
            designationId: row.designationId,
            employeeCode: row.employeeCode,
            email: row.workEmail,
            passwordHash,
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone,
            status: UserStatus.ACTIVE,
          },
        });

        const empRole = await tx.role.findFirst({
          where: { organizationId: orgId, code: RoleCode.EMPLOYEE },
        });
        if (empRole) {
          await tx.userRole.create({
            data: {
              userId: userAccount.id,
              roleId: empRole.id,
              assignedBy: user.id,
            },
          });
        }

        // 2. Create Employee (with direct managerId relation)
        const emp = await tx.employee.create({
          data: {
            userId: userAccount.id,
            organizationId: orgId,
            managerId,
            employeeCode: row.employeeCode,
            firstName: row.firstName,
            lastName: row.lastName,
            displayName: `${row.firstName} ${row.lastName}`.trim(),
            status: row.employmentStatus || EmploymentStatus.PROBATION,
            joiningDate: row.joiningDate ? new Date(row.joiningDate) : new Date(),
          },
        });

        // 3. Create Employment
        await tx.employeeEmployment.create({
          data: {
            employeeId: emp.id,
            branchId: row.branchId,
            departmentId: row.departmentId,
            designationId: row.designationId,
            managerId,
            employmentType: row.employmentType || EmploymentType.FULL_TIME,
            employmentStatus: row.employmentStatus || EmploymentStatus.PROBATION,
            workMode: row.workMode || WorkMode.OFFICE,
            joiningDate: row.joiningDate ? new Date(row.joiningDate) : new Date(),
          },
        });

        // 4. Create Contact
        await tx.employeeContact.create({
          data: {
            employeeId: emp.id,
            workEmail: row.workEmail,
            phone: row.phone,
          },
        });

        // 5. Create History Record
        await tx.employeeHistory.create({
          data: {
            employeeId: emp.id,
            eventType: EmployeeHistoryEventType.JOINED,
            previousValue: null,
            newValue: emp.status,
            performedById: user.id,
            metadata: { importBatch: true },
          },
        });

        managerLookup.set(row.employeeCode.toUpperCase(), emp.id);
        importedCount++;
      }
    });

    await this.auditService.record({
      action: 'EMPLOYEE_IMPORTED',
      entity: 'Employee',
      userId: user.id,
      organizationId: orgId,
      metadata: { count: importedCount },
    });

    return {
      success: true,
      message: `Successfully imported ${importedCount} employee records`,
      totalRows: rows.length,
      validRowsCount: rows.length,
      importedCount,
      skippedCount: 0,
      count: importedCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Export Employees (CSV / Excel)
  // ---------------------------------------------------------------------------

  async exportEmployees(
    user: AuthenticatedUser,
    format: 'csv' | 'xlsx' = 'csv',
    query: EmployeeFilterDto,
  ) {
    const listResult = await this.findAll(user, { ...query, limit: 10000 });

    const isAdminOrHr = Boolean(
      user.roles.includes('ADMIN') ||
      user.roles.includes('HR') ||
      user.permissions.includes('EMPLOYEE_MANAGE') ||
      user.permissions.includes('EMPLOYEE_UPDATE'),
    );

    const exportRows = listResult.items.map((e) => {
      const isSelf = user.employeeCode === e.employeeCode;
      const canAccessSensitive = isAdminOrHr || isSelf;

      const row: Record<string, any> = {
        'Employee Code': e.employeeCode,
        'Full Name': e.displayName,
        'Work Email': e.workEmail || '',
        Department: e.departmentName || '',
        Designation: e.designationTitle || '',
        Branch: e.branchName || '',
        Manager: e.managerName || 'None',
        Status: e.status,
        'Work Mode': e.workMode || 'OFFICE',
        'Employment Type': e.employmentType || 'FULL_TIME',
        'Joining Date': e.joiningDate ? e.joiningDate.split('T')[0] : '',
      };

      if (canAccessSensitive) {
        row['Phone'] = e.phone || '';
      }

      return sanitizeCsvRow(row);
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');

    // Record audit event for export action
    await this.auditService.record({
      action: 'EMPLOYEE_EXPORTED',
      entity: 'Employee',
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        format,
        recordCount: exportRows.length,
        filters: {
          search: query.search || null,
          departmentId: query.departmentId || null,
          designationId: query.designationId || null,
          branchId: query.branchId || null,
          status: query.status || null,
        },
      },
    });

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'xlsx') {
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `employees_export_${timestamp}.xlsx`,
      };
    } else {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      return {
        buffer: Buffer.from(csv, 'utf-8'),
        contentType: 'text/csv',
        filename: `employees_export_${timestamp}.csv`,
      };
    }
  }
}
