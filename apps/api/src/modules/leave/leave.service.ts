import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { EmployeesService } from '../employees/employees.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { LeaveLedgerService } from './leave-ledger.service';
import { LeaveCalculatorService } from './leave-calculator.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { DecideLeaveRequestDto } from './dto/decide-leave-request.dto';
import { CancelLeaveRequestDto } from './dto/cancel-leave-request.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { CalculateLeaveDaysDto } from './dto/calculate-leave-days.dto';
import { CreateHolidayDto, UpdateHolidayDto } from './dto/create-holiday.dto';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/create-leave-type.dto';
import {
  CreateLeavePolicyDto,
  UpdateLeavePolicyDto,
  AssignLeavePolicyDto,
} from './dto/create-leave-policy.dto';
import { AdjustLeaveBalanceDto } from './dto/adjust-leave-balance.dto';
import {
  ApprovalDecision,
  LeaveDurationType,
  LeaveRequestStatus,
  Prisma,
  VisitStatus,
  WfhStatus,
} from '@prisma/client';

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly hierarchyService: HierarchyService,
    private readonly employeesService: EmployeesService,
    private readonly notificationsService: NotificationsService,
    private readonly ledgerService: LeaveLedgerService,
    private readonly calculatorService: LeaveCalculatorService,
  ) {}

  // Helper: Resolve active Employee record for authenticated user
  private async resolveEmployee(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ userId: user.id }, { employeeCode: user.employeeCode }],
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No active employee profile linked to current user account.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    return employee;
  }

  // ===========================================================================
  // 1. LEAVE APPLICATION WORKFLOW
  // ===========================================================================

  /**
   * Submit a new leave request with comprehensive validation, collision checks, and balance reservation
   */
  async apply(user: AuthenticatedUser, dto: CreateLeaveRequestDto) {
    const employee = await this.resolveEmployee(user);
    const start = this.calculatorService.normalizeDateToUtc(dto.startDate);
    const end = this.calculatorService.normalizeDateToUtc(dto.endDate);
    const durationType = dto.durationType || LeaveDurationType.FULL_DAY;
    const leaveYear = start.getUTCFullYear();

    if (end < start) {
      throw new BadRequestException('End date cannot be earlier than start date.');
    }

    // 1. Validate leave type
    const leaveType = await this.prisma.leaveType.findFirst({
      where: {
        id: dto.leaveTypeId,
        organizationId: user.organizationId,
        isActive: true,
      },
    });
    if (!leaveType) {
      throw new BadRequestException('Specified leave type does not exist or is inactive.');
    }

    // Half-day validation
    if (durationType !== LeaveDurationType.FULL_DAY) {
      if (!leaveType.allowHalfDay) {
        throw new BadRequestException(`${leaveType.name} does not permit half-day applications.`);
      }
      if (start.getTime() !== end.getTime()) {
        throw new BadRequestException(
          'Half-day leave can only be applied for a single calendar day.',
        );
      }
    }

    // 2. Resolve applicable policy
    const policyAssignment = await this.prisma.employeeLeavePolicyAssignment.findFirst({
      where: {
        organizationId: user.organizationId,
        employeeId: employee.id,
        leavePolicy: { leaveTypeId: leaveType.id },
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      },
      include: { leavePolicy: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const policy = policyAssignment?.leavePolicy;

    // Check notice period
    if (policy && policy.minNoticeDays > 0) {
      const todayUtc = this.calculatorService.normalizeDateToUtc(new Date());
      const diffMs = start.getTime() - todayUtc.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < policy.minNoticeDays) {
        throw new BadRequestException(
          `Application violates notice requirement. At least ${policy.minNoticeDays} days advance notice required.`,
        );
      }
    }

    // 3. Collision / Overlap Detection
    // A. Check existing leave requests
    const overlappingLeave = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.APPROVED] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      include: { leaveType: true },
    });
    if (overlappingLeave) {
      throw new ConflictException(
        `Overlapping leave application found: ${overlappingLeave.leaveType.name} (${overlappingLeave.startDate.toISOString().split('T')[0]} to ${overlappingLeave.endDate.toISOString().split('T')[0]}).`,
      );
    }

    // B. Check overlapping Official Visits
    const overlappingVisit = await this.prisma.officialVisit.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: [VisitStatus.SUBMITTED, VisitStatus.APPROVED] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlappingVisit) {
      throw new ConflictException(
        `Cannot apply for leave during an active official visit window (${overlappingVisit.startDate.toISOString().split('T')[0]} to ${overlappingVisit.endDate.toISOString().split('T')[0]}).`,
      );
    }

    // C. Check overlapping WFH Requests
    const overlappingWfh = await this.prisma.wfhRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: [WfhStatus.SUBMITTED, WfhStatus.APPROVED] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlappingWfh) {
      throw new ConflictException(
        `Cannot apply for leave during an active work-from-home schedule (${overlappingWfh.startDate.toISOString().split('T')[0]} to ${overlappingWfh.endDate.toISOString().split('T')[0]}).`,
      );
    }

    // 4. Calculate Chargeable Days
    const calc = await this.calculatorService.calculateLeaveDays({
      organizationId: user.organizationId,
      employeeId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: start,
      endDate: end,
      durationType,
    });

    if (calc.chargeableDays <= 0) {
      throw new BadRequestException(
        'Selected leave period contains 0 chargeable working days (falls entirely on non-working days or holidays).',
      );
    }

    // Check max consecutive days
    if (policy && policy.maxConsecutiveDays && calc.chargeableDays > policy.maxConsecutiveDays) {
      throw new BadRequestException(
        `Request exceeds maximum consecutive leave duration of ${policy.maxConsecutiveDays} days under policy ${policy.name}.`,
      );
    }

    // Check document requirement
    if (
      leaveType.requiresDoc &&
      calc.chargeableDays >= leaveType.docThresholdDays &&
      !dto.attachmentUrl
    ) {
      throw new BadRequestException(
        `Supporting document is mandatory for ${leaveType.name} exceeding ${leaveType.docThresholdDays} days.`,
      );
    }

    // 5. Atomic Transaction: Create Request and Place Balance Reservation
    const result = await this.prisma.$transaction(async (tx) => {
      const leaveRequest = await tx.leaveRequest.create({
        data: {
          organizationId: user.organizationId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          leaveYear,
          startDate: start,
          endDate: end,
          durationType,
          chargeableDays: new Prisma.Decimal(calc.chargeableDays),
          reason: dto.reason.trim(),
          attachmentUrl: dto.attachmentUrl || null,
          attachmentName: dto.attachmentName || null,
          status: LeaveRequestStatus.SUBMITTED,
        },
      });

      // Place ledger reservation
      await this.ledgerService.reserveBalance(
        user.organizationId,
        employee.id,
        leaveType.id,
        leaveYear,
        leaveRequest.id,
        calc.chargeableDays,
        user.id,
        tx,
      );

      return leaveRequest;
    });

    // 6. Notify Manager & Audit Log
    if (employee.managerId) {
      const manager = await this.prisma.employee.findUnique({
        where: { id: employee.managerId },
        select: { userId: true },
      });
      if (manager?.userId) {
        this.notificationsService
          .createNotification({
            userId: manager.userId,
            organizationId: user.organizationId,
            title: 'New Leave Application',
            message: `${employee.displayName} applied for ${calc.chargeableDays} day(s) of ${leaveType.name} (${dto.startDate} to ${dto.endDate}).`,
            type: 'LEAVE_SUBMITTED',
            link: `/leave?tab=approvals&id=${result.id}`,
            idempotencyKey: `notif:leave_sub:${result.id}`,
          })
          .catch(() => null);
      }
    }

    this.auditService
      .record({
        action: 'LEAVE_APPLY',
        entity: 'LeaveRequest',
        entityId: result.id,
        userId: user.id,
        organizationId: user.organizationId,
        metadata: {
          leaveTypeId: leaveType.id,
          chargeableDays: calc.chargeableDays,
          startDate: dto.startDate,
          endDate: dto.endDate,
        },
      })
      .catch(() => null);

    return {
      success: true,
      message: 'Leave application submitted successfully.',
      data: result,
    };
  }

  // ===========================================================================
  // 2. APPROVAL & REJECTION WORKFLOW
  // ===========================================================================

  /**
   * Decide (Approve or Reject) an employee leave application
   */
  async decide(user: AuthenticatedUser, requestId: string, dto: DecideLeaveRequestDto) {
    const leaveRequest = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: true,
        leaveType: true,
      },
    });

    if (!leaveRequest || leaveRequest.organizationId !== user.organizationId) {
      throw new NotFoundException('Leave request not found.');
    }

    if (leaveRequest.status !== LeaveRequestStatus.SUBMITTED) {
      throw new BadRequestException(
        `Leave request cannot be decided because it is currently ${leaveRequest.status}.`,
      );
    }

    // 1. Self-approval Prevention
    if (leaveRequest.employee.userId === user.id) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Security policy violation: You cannot approve or reject your own leave request.',
        code: 'SELF_APPROVAL_FORBIDDEN',
      });
    }

    // 2. Authorization Scoping: Direct line manager OR Admin / HR
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    let isManager = false;

    if (!isAdminOrHr) {
      const userEmployee = await this.resolveEmployee(user);
      const isDirectManager = leaveRequest.employee.managerId === userEmployee.id;
      if (!isDirectManager) {
        const teamMemberIds = await this.hierarchyService.getTeamMemberIds(
          userEmployee.id,
          user.organizationId,
        );
        isManager = teamMemberIds.includes(leaveRequest.employee.id);
      } else {
        isManager = true;
      }

      if (!isManager) {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'You are not authorized to decide leave requests for this employee.',
          code: 'UNAUTHORIZED_APPROVER',
        });
      }
    }

    if (
      dto.decision === ApprovalDecision.REJECTED &&
      (!dto.comments || dto.comments.trim().length < 3)
    ) {
      throw new BadRequestException(
        'Mandatory rejection reason must be provided (minimum 3 characters).',
      );
    }

    // 3. Atomic Transaction: Update Request, Record Approval, Post Ledger Transition
    const updatedRequest = await this.prisma.$transaction(async (tx) => {
      const nextStatus =
        dto.decision === ApprovalDecision.APPROVED
          ? LeaveRequestStatus.APPROVED
          : LeaveRequestStatus.REJECTED;

      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
        },
      });

      await tx.leaveApproval.create({
        data: {
          leaveRequestId: requestId,
          approverId: user.id,
          decision: dto.decision,
          comments: dto.comments?.trim() || null,
        },
      });

      if (dto.decision === ApprovalDecision.APPROVED) {
        // Transition ledger reservation into consumption
        await this.ledgerService.consumeBalance(requestId, user.id, tx);
      } else {
        // Release ledger reservation back to available balance
        await this.ledgerService.releaseReservation(
          requestId,
          `Rejected: ${dto.comments?.trim() || 'No comments'}`,
          user.id,
          tx,
        );
      }

      return updated;
    });

    // 4. Notify Employee & Audit
    if (leaveRequest.employee.userId) {
      this.notificationsService
        .createNotification({
          userId: leaveRequest.employee.userId,
          organizationId: user.organizationId,
          title: `Leave Application ${dto.decision}`,
          message: `Your ${leaveRequest.leaveType.name} request for ${leaveRequest.startDate.toISOString().split('T')[0]} has been ${dto.decision.toLowerCase()}.`,
          type: `LEAVE_${dto.decision}`,
          link: `/leave?id=${leaveRequest.id}`,
          idempotencyKey: `notif:leave_dec:${leaveRequest.id}:${dto.decision}`,
        })
        .catch(() => null);
    }

    this.auditService
      .record({
        action: `LEAVE_${dto.decision}`,
        entity: 'LeaveRequest',
        entityId: leaveRequest.id,
        userId: user.id,
        organizationId: user.organizationId,
        metadata: {
          decision: dto.decision,
          comments: dto.comments,
          employeeId: leaveRequest.employeeId,
        },
      })
      .catch(() => null);

    return {
      success: true,
      message: `Leave request has been ${dto.decision.toLowerCase()} successfully.`,
      data: updatedRequest,
    };
  }

  // ===========================================================================
  // 3. CANCELLATION WORKFLOW
  // ===========================================================================

  /**
   * Cancel a leave request (reverses balance reservations or consumptions)
   */
  async cancel(user: AuthenticatedUser, requestId: string, dto: CancelLeaveRequestDto) {
    const leaveRequest = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { employee: true, leaveType: true },
    });

    if (!leaveRequest || leaveRequest.organizationId !== user.organizationId) {
      throw new NotFoundException('Leave request not found.');
    }

    if (
      leaveRequest.status !== LeaveRequestStatus.SUBMITTED &&
      leaveRequest.status !== LeaveRequestStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Leave request cannot be cancelled because it is currently ${leaveRequest.status}.`,
      );
    }

    // Authorization: Owner or Admin / HR
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    const isOwner = leaveRequest.employee.userId === user.id;

    if (!isOwner && !isAdminOrHr) {
      throw new ForbiddenException('You are not authorized to cancel this leave request.');
    }

    const previousStatus = leaveRequest.status;

    // Atomic Transaction: Cancel and Reverse Ledger
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: LeaveRequestStatus.CANCELLED,
          cancellationReason: dto.cancellationReason.trim(),
          cancelledAt: new Date(),
          cancelledById: user.id,
        },
      });

      if (previousStatus === LeaveRequestStatus.SUBMITTED) {
        await this.ledgerService.releaseReservation(
          requestId,
          `Cancelled: ${dto.cancellationReason.trim()}`,
          user.id,
          tx,
        );
      } else if (previousStatus === LeaveRequestStatus.APPROVED) {
        await this.ledgerService.reverseConsumption(
          requestId,
          `Cancelled: ${dto.cancellationReason.trim()}`,
          user.id,
          tx,
        );
      }

      return res;
    });

    this.auditService
      .record({
        action: 'LEAVE_CANCEL',
        entity: 'LeaveRequest',
        entityId: requestId,
        userId: user.id,
        organizationId: user.organizationId,
        metadata: {
          previousStatus,
          cancellationReason: dto.cancellationReason,
        },
      })
      .catch(() => null);

    return {
      success: true,
      message: 'Leave request cancelled successfully and balances reconciled.',
      data: updated,
    };
  }

  // ===========================================================================
  // 4. BALANCE & CALCULATION INQUIRY
  // ===========================================================================

  /**
   * Pre-flight calculation endpoint for frontend preview
   */
  async calculatePreview(user: AuthenticatedUser, dto: CalculateLeaveDaysDto) {
    let employeeId = dto.employeeId;
    if (!employeeId) {
      const employee = await this.resolveEmployee(user);
      employeeId = employee.id;
    }

    const start = this.calculatorService.normalizeDateToUtc(dto.startDate);
    const end = this.calculatorService.normalizeDateToUtc(dto.endDate);
    const leaveYear = start.getUTCFullYear();

    const calc = await this.calculatorService.calculateLeaveDays({
      organizationId: user.organizationId,
      employeeId,
      leaveTypeId: dto.leaveTypeId,
      startDate: start,
      endDate: end,
      durationType: dto.durationType,
    });

    const account = await this.ledgerService.getOrCreateAccount(
      user.organizationId,
      employeeId,
      dto.leaveTypeId,
      leaveYear,
    );

    const availableBalance = Number(account.closingBalance);
    const hasSufficientBalance = availableBalance >= calc.chargeableDays;

    return {
      success: true,
      data: {
        ...calc,
        hasSufficientBalance,
        availableBalance,
        pendingBalance: Number(account.pendingBalance),
      },
    };
  }

  /**
   * Get employee leave balance accounts for the current or specified leave year
   */
  async getLeaveBalances(user: AuthenticatedUser, targetEmployeeId?: string, year?: number) {
    let employeeId = targetEmployeeId;
    if (!employeeId) {
      const employee = await this.resolveEmployee(user);
      employeeId = employee.id;
    } else {
      // Permission verification
      const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
      if (!isAdminOrHr) {
        const userEmp = await this.resolveEmployee(user);
        if (userEmp.id !== employeeId) {
          const teamMemberIds = await this.hierarchyService.getTeamMemberIds(
            userEmp.id,
            user.organizationId,
          );
          if (!teamMemberIds.includes(employeeId)) {
            throw new ForbiddenException('Not authorized to view balances for this employee.');
          }
        }
      }
    }

    const leaveYear = year || new Date().getUTCFullYear();

    // Fetch all active leave types in the organization
    const leaveTypes = await this.prisma.leaveType.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const accounts = await Promise.all(
      leaveTypes.map(async (lt) => {
        const acc = await this.ledgerService.getOrCreateAccount(
          user.organizationId,
          employeeId!,
          lt.id,
          leaveYear,
        );

        return {
          leaveType: {
            id: lt.id,
            code: lt.code,
            name: lt.name,
            description: lt.description,
            color: lt.color,
            isPaid: lt.isPaid,
            allowHalfDay: lt.allowHalfDay,
          },
          leaveYear,
          openingBalance: Number(acc.openingBalance),
          accruedBalance: Number(acc.accruedBalance),
          allocatedBalance: Number(acc.allocatedBalance),
          usedBalance: Number(acc.usedBalance),
          pendingBalance: Number(acc.pendingBalance),
          closingBalance: Number(acc.closingBalance),
        };
      }),
    );

    return {
      success: true,
      data: accounts,
    };
  }

  /**
   * Get paginated leave applications with RBAC filtering
   */
  async getRequests(user: AuthenticatedUser, query: QueryLeaveRequestsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.LeaveRequestWhereInput = {
      organizationId: user.organizationId,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.leaveTypeId) {
      where.leaveTypeId = query.leaveTypeId;
    }
    if (query.leaveYear) {
      where.leaveYear = Number(query.leaveYear);
    }
    if (query.startDate) {
      where.startDate = { gte: this.calculatorService.normalizeDateToUtc(query.startDate) };
    }
    if (query.endDate) {
      where.endDate = { lte: this.calculatorService.normalizeDateToUtc(query.endDate) };
    }

    // Role-based scoping
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      const userEmployee = await this.resolveEmployee(user);
      if (user.roles.includes('MANAGER')) {
        const subIds = await this.hierarchyService.getTeamMemberIds(
          userEmployee.id,
          user.organizationId,
        );
        const allowedIds = [userEmployee.id, ...subIds];
        where.employeeId =
          query.employeeId && allowedIds.includes(query.employeeId)
            ? query.employeeId
            : { in: allowedIds };
      } else {
        where.employeeId = userEmployee.id;
      }
    } else if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { reason: { contains: term, mode: 'insensitive' } },
        { employee: { displayName: { contains: term, mode: 'insensitive' } } },
        { employee: { employeeCode: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.leaveRequest.count({ where }),
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
              profilePhoto: true,
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
      }),
    ]);

    return {
      success: true,
      data: items.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        employeeId: r.employeeId,
        employee: {
          id: r.employee.id,
          employeeCode: r.employee.employeeCode,
          displayName: r.employee.displayName,
          avatarUrl: r.employee.profilePhoto,
          department: r.employee.employment?.department?.name || null,
          designation: r.employee.employment?.designation?.title || null,
        },
        leaveTypeId: r.leaveTypeId,
        leaveType: r.leaveType,
        leaveYear: r.leaveYear,
        startDate: r.startDate.toISOString().split('T')[0],
        endDate: r.endDate.toISOString().split('T')[0],
        durationType: r.durationType,
        chargeableDays: Number(r.chargeableDays),
        reason: r.reason,
        attachmentUrl: r.attachmentUrl,
        attachmentName: r.attachmentName,
        status: r.status,
        cancellationReason: r.cancellationReason,
        cancelledAt: r.cancelledAt?.toISOString() || null,
        approvals: r.approvals.map((a) => ({
          id: a.id,
          approverId: a.approverId,
          approverName: `${a.approver.firstName} ${a.approver.lastName}`,
          decision: a.decision,
          comments: a.comments,
          decidedAt: a.decidedAt.toISOString(),
        })),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single leave request details by ID
   */
  async getRequestById(user: AuthenticatedUser, id: string) {
    const item = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            displayName: true,
            profilePhoto: true,
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
    });

    if (!item || item.organizationId !== user.organizationId) {
      throw new NotFoundException('Leave request not found.');
    }

    // Role scoping
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      const userEmployee = await this.resolveEmployee(user);
      if (item.employeeId !== userEmployee.id) {
        const teamMemberIds = await this.hierarchyService.getTeamMemberIds(
          userEmployee.id,
          user.organizationId,
        );
        if (!teamMemberIds.includes(item.employeeId)) {
          throw new ForbiddenException('Not authorized to access this leave request.');
        }
      }
    }

    return {
      success: true,
      data: item,
    };
  }

  // ===========================================================================
  // 5. HOLIDAY MANAGEMENT (ADMIN / HR)
  // ===========================================================================

  async getHolidays(organizationId: string, year?: number, branchId?: string) {
    const targetYear = year || new Date().getUTCFullYear();
    const where: Prisma.HolidayWhereInput = {
      organizationId,
      year: targetYear,
    };
    if (branchId) {
      where.OR = [{ branchId: null }, { branchId }];
    }

    const holidays = await this.prisma.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });

    return {
      success: true,
      data: holidays.map((h) => ({
        id: h.id,
        organizationId: h.organizationId,
        branchId: h.branchId,
        branchName: h.branch?.name || 'All Branches (National)',
        name: h.name,
        date: h.date.toISOString().split('T')[0],
        year: h.year,
        isOptional: h.isOptional,
        description: h.description,
      })),
    };
  }

  async createHoliday(user: AuthenticatedUser, dto: CreateHolidayDto) {
    const holidayDate = this.calculatorService.normalizeDateToUtc(dto.date);
    const year = holidayDate.getUTCFullYear();

    const existing = await this.prisma.holiday.findUnique({
      where: {
        organizationId_branchId_date: {
          organizationId: user.organizationId,
          branchId: dto.branchId || (null as any),
          date: holidayDate,
        },
      },
    });

    if (existing) {
      throw new ConflictException('A holiday is already registered for this date and branch.');
    }

    const holiday = await this.prisma.holiday.create({
      data: {
        organizationId: user.organizationId,
        branchId: dto.branchId || null,
        name: dto.name.trim(),
        date: holidayDate,
        year,
        isOptional: dto.isOptional ?? false,
        description: dto.description?.trim() || null,
      },
    });

    this.auditService
      .record({
        action: 'HOLIDAY_CREATE',
        entity: 'Holiday',
        entityId: holiday.id,
        userId: user.id,
        organizationId: user.organizationId,
        metadata: { name: holiday.name, date: dto.date },
      })
      .catch(() => null);

    return {
      success: true,
      message: 'Holiday created successfully.',
      data: holiday,
    };
  }

  async updateHoliday(user: AuthenticatedUser, id: string, dto: UpdateHolidayDto) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday || holiday.organizationId !== user.organizationId) {
      throw new NotFoundException('Holiday not found.');
    }

    const data: Prisma.HolidayUpdateInput = {};
    if (dto.name) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.isOptional !== undefined) data.isOptional = dto.isOptional;
    if (dto.branchId !== undefined) {
      data.branch = dto.branchId ? { connect: { id: dto.branchId } } : { disconnect: true };
    }
    if (dto.date) {
      const d = this.calculatorService.normalizeDateToUtc(dto.date);
      data.date = d;
      data.year = d.getUTCFullYear();
    }

    const updated = await this.prisma.holiday.update({
      where: { id },
      data,
    });

    return { success: true, message: 'Holiday updated successfully.', data: updated };
  }

  async deleteHoliday(user: AuthenticatedUser, id: string) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday || holiday.organizationId !== user.organizationId) {
      throw new NotFoundException('Holiday not found.');
    }

    await this.prisma.holiday.delete({ where: { id } });
    return { success: true, message: 'Holiday deleted successfully.' };
  }

  // ===========================================================================
  // 6. LEAVE TYPES & POLICIES ADMIN
  // ===========================================================================

  async getLeaveTypes(organizationId: string) {
    const types = await this.prisma.leaveType.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: {
        policies: { where: { isActive: true } },
      },
    });
    return { success: true, data: types };
  }

  async createLeaveType(user: AuthenticatedUser, dto: CreateLeaveTypeDto) {
    const existing = await this.prisma.leaveType.findUnique({
      where: {
        organizationId_code: {
          organizationId: user.organizationId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Leave type with code ${dto.code} already exists.`);
    }

    const leaveType = await this.prisma.leaveType.create({
      data: {
        organizationId: user.organizationId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        color: dto.color || '#d97706',
        isPaid: dto.isPaid ?? true,
        allowHalfDay: dto.allowHalfDay ?? true,
        requiresDoc: dto.requiresDoc ?? false,
        docThresholdDays: dto.docThresholdDays ?? 2,
        isActive: dto.isActive ?? true,
      },
    });

    return { success: true, message: 'Leave type created successfully.', data: leaveType };
  }

  async getLeavePolicies(organizationId: string) {
    const policies = await this.prisma.leavePolicy.findMany({
      where: { organizationId },
      include: { leaveType: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, data: policies };
  }

  async createLeavePolicy(user: AuthenticatedUser, dto: CreateLeavePolicyDto) {
    const policy = await this.prisma.leavePolicy.create({
      data: {
        organizationId: user.organizationId,
        leaveTypeId: dto.leaveTypeId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        description: dto.description?.trim() || null,
        annualEntitlement: new Prisma.Decimal(dto.annualEntitlement),
        accrualFrequency: dto.accrualFrequency,
        carryForwardLimit: new Prisma.Decimal(dto.carryForwardLimit ?? 0),
        maxConsecutiveDays: dto.maxConsecutiveDays || null,
        minNoticeDays: dto.minNoticeDays ?? 0,
        countWeekendsAsLeave: dto.countWeekendsAsLeave ?? false,
        countHolidaysAsLeave: dto.countHolidaysAsLeave ?? false,
        allowNegativeBalance: dto.allowNegativeBalance ?? false,
        maxNegativeBalance: new Prisma.Decimal(dto.maxNegativeBalance ?? 0),
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        isActive: dto.isActive ?? true,
      },
    });

    return { success: true, message: 'Leave policy created successfully.', data: policy };
  }

  async assignPolicy(user: AuthenticatedUser, dto: AssignLeavePolicyDto) {
    const assignment = await this.prisma.employeeLeavePolicyAssignment.upsert({
      where: {
        employeeId_leavePolicyId_effectiveFrom: {
          employeeId: dto.employeeId,
          leavePolicyId: dto.leavePolicyId,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date('2026-01-01'),
        },
      },
      update: {
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
      create: {
        organizationId: user.organizationId,
        employeeId: dto.employeeId,
        leavePolicyId: dto.leavePolicyId,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date('2026-01-01'),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
    });

    return { success: true, message: 'Leave policy assigned successfully.', data: assignment };
  }

  async adjustBalance(user: AuthenticatedUser, dto: AdjustLeaveBalanceDto) {
    const updated = await this.ledgerService.recordManualAdjustment({
      organizationId: user.organizationId,
      employeeId: dto.employeeId,
      leaveTypeId: dto.leaveTypeId,
      leaveYear: dto.leaveYear,
      amount: dto.amount,
      reason: dto.reason.trim(),
      actorId: user.id,
    });

    this.auditService
      .record({
        action: 'LEAVE_BALANCE_ADJUST',
        entity: 'LeaveBalanceAccount',
        entityId: updated.id,
        userId: user.id,
        organizationId: user.organizationId,
        metadata: {
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          amount: dto.amount,
          reason: dto.reason,
        },
      })
      .catch(() => null);

    return {
      success: true,
      message: 'Leave balance adjusted successfully.',
      data: updated,
    };
  }

  /**
   * Explicit interface method for adjacent modules (e.g. WFH and Visits)
   */
  async checkOverlappingLeave(
    employeeId: string,
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ hasOverlap: boolean; reason?: string }> {
    const overlapping = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        organizationId,
        status: { in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: { leaveType: true },
    });

    if (overlapping) {
      return {
        hasOverlap: true,
        reason: `Active leave scheduled: ${overlapping.leaveType.name} (${overlapping.startDate.toISOString().split('T')[0]} to ${overlapping.endDate.toISOString().split('T')[0]})`,
      };
    }

    return { hasOverlap: false };
  }
}
