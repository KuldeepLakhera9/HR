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
import { AttendancePoliciesService } from '../attendance/attendance-policies.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { CreateWfhRequestDto } from './dto/create-wfh-request.dto';
import { UpdateWfhRequestDto } from './dto/update-wfh-request.dto';
import { CancelWfhRequestDto } from './dto/cancel-wfh-request.dto';
import { QueryWfhRequestsDto } from './dto/query-wfh-requests.dto';
import { DecideWfhRequestDto } from './dto/decide-wfh-request.dto';
import {
  LeaveIntegrationService,
  DefaultLeaveIntegrationService,
} from './interfaces/leave-integration.interface';
import { ApprovalDecision, Prisma, VisitStatus, WfhDurationType, WfhStatus } from '@prisma/client';

@Injectable()
export class WfhService {
  private readonly logger = new Logger(WfhService.name);
  private readonly leaveIntegration: LeaveIntegrationService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly hierarchyService: HierarchyService,
    private readonly policiesService: AttendancePoliciesService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.leaveIntegration = new DefaultLeaveIntegrationService();
  }

  // Helper: Normalize ISO string to UTC Midnight
  private normalizeDateToUtc(dateInput: string | Date): Date {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date format provided');
    }
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }

  // Helper: Resolve active Employee record for authenticated user
  private async resolveEmployee(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ userId: user.id }, { employeeCode: user.employeeCode }],
        deletedAt: null,
      },
      include: {
        employment: true,
        manager: {
          select: {
            id: true,
            userId: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No active employee profile linked to current user account.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    const eligibleStatuses = ['ACTIVE', 'PROBATION', 'ON_NOTICE'];
    if (!eligibleStatuses.includes(employee.status)) {
      throw new ForbiddenException({
        statusCode: 403,
        message: `Employee is not in an active employment status (current status: ${employee.status}).`,
        code: 'EMPLOYMENT_INACTIVE',
      });
    }

    return employee;
  }

  // Helper: Overlap check across WFH, Official Visits, and Leave
  private async checkOverlappingRequests(
    tx: Prisma.TransactionClient,
    employeeId: string,
    organizationId: string,
    startUtc: Date,
    endUtc: Date,
    excludeWfhId?: string,
  ) {
    // 1. Check existing WFH requests
    const wfhWhere: Prisma.WfhRequestWhereInput = {
      organizationId,
      employeeId,
      status: { in: [WfhStatus.SUBMITTED, WfhStatus.APPROVED] },
      startDate: { lte: endUtc },
      endDate: { gte: startUtc },
    };
    if (excludeWfhId) {
      wfhWhere.id = { not: excludeWfhId };
    }

    const conflictingWfh = await tx.wfhRequest.findFirst({
      where: wfhWhere,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        durationType: true,
      },
    });

    if (conflictingWfh) {
      throw new ConflictException({
        statusCode: 409,
        message: `A work from home request is already ${conflictingWfh.status.toLowerCase()} for overlapping dates (${conflictingWfh.startDate.toISOString().slice(0, 10)} to ${conflictingWfh.endDate.toISOString().slice(0, 10)}).`,
        code: 'WFH_OVERLAP_CONFLICT',
      });
    }

    // 2. Check existing Official Visits
    const conflictingVisit = await tx.officialVisit.findFirst({
      where: {
        organizationId,
        employeeId,
        status: { in: [VisitStatus.SUBMITTED, VisitStatus.APPROVED, VisitStatus.IN_PROGRESS] },
        startDate: { lte: endUtc },
        endDate: { gte: startUtc },
      },
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });

    if (conflictingVisit) {
      throw new ConflictException({
        statusCode: 409,
        message: `An official visit ("${conflictingVisit.title}") is already ${conflictingVisit.status.toLowerCase()} for overlapping dates.`,
        code: 'OFFICIAL_VISIT_OVERLAP_CONFLICT',
      });
    }

    // 3. Check Leave via explicit integration interface (do not fabricate fake leave data)
    const leaveCheck = await this.leaveIntegration.checkOverlappingLeave(
      employeeId,
      organizationId,
      startUtc,
      endUtc,
    );

    if (leaveCheck.hasOverlap) {
      throw new ConflictException({
        statusCode: 409,
        message: leaveCheck.reason || 'Approved leave already scheduled for overlapping dates.',
        code: 'LEAVE_OVERLAP_CONFLICT',
      });
    }
  }

  /**
   * 1. CREATE WFH REQUEST
   */
  async createWfhRequest(user: AuthenticatedUser, dto: CreateWfhRequestDto) {
    const employee = await this.resolveEmployee(user);

    const startUtc = this.normalizeDateToUtc(dto.startDate);
    const endUtc = this.normalizeDateToUtc(dto.endDate);

    if (startUtc > endUtc) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'End date must be on or after start date.',
        code: 'INVALID_DATE_RANGE',
      });
    }

    const durationType = dto.durationType || WfhDurationType.FULL_DAY;

    // Validate duration type alignment
    if (
      durationType === WfhDurationType.FIRST_HALF ||
      durationType === WfhDurationType.SECOND_HALF
    ) {
      if (startUtc.getTime() !== endUtc.getTime()) {
        throw new BadRequestException({
          statusCode: 400,
          message:
            'Half-day WFH requests (FIRST_HALF or SECOND_HALF) can only be submitted for a single date.',
          code: 'INVALID_HALF_DAY_RANGE',
        });
      }
    } else if (durationType === WfhDurationType.CUSTOM_RANGE) {
      if (startUtc.getTime() === endUtc.getTime()) {
        throw new BadRequestException({
          statusCode: 400,
          message:
            'CUSTOM_RANGE duration type requires a multi-day date range (startDate < endDate). Use FULL_DAY for single days.',
          code: 'INVALID_CUSTOM_RANGE',
        });
      }
    }

    // Policy & Shift Resolution
    await this.policiesService.resolveEffectivePolicyAndShift(
      employee.id,
      startUtc,
      user.organizationId,
    );

    // Atomic collision check and creation
    const createdRequest = await this.prisma.$transaction(async (tx) => {
      await this.checkOverlappingRequests(tx, employee.id, user.organizationId, startUtc, endUtc);

      const request = await tx.wfhRequest.create({
        data: {
          organizationId: user.organizationId,
          employeeId: employee.id,
          startDate: startUtc,
          endDate: endUtc,
          durationType,
          reason: dto.reason.trim(),
          status: WfhStatus.SUBMITTED,
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
          },
        },
      });

      return request;
    });

    // Record audit history
    await this.auditService.record({
      action: 'WFH_CREATED',
      entity: 'WfhRequest',
      entityId: createdRequest.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        startDate: createdRequest.startDate.toISOString(),
        endDate: createdRequest.endDate.toISOString(),
        durationType: createdRequest.durationType,
        reason: createdRequest.reason,
      },
    });

    // Notify reporting manager about newly submitted request
    try {
      if (employee.manager?.userId) {
        await this.notificationsService.createNotification({
          userId: employee.manager.userId,
          organizationId: user.organizationId,
          title: `New WFH Request: ${employee.displayName || user.firstName}`,
          message: `${employee.displayName || user.firstName} requested work from home for ${dto.startDate} to ${dto.endDate} (${durationType}). Reason: "${createdRequest.reason}"`,
          type: 'INFO',
          link: `/wfh`,
          idempotencyKey: `notif:wfh_submit:${createdRequest.id}`,
          metadata: {
            requestId: createdRequest.id,
            employeeId: employee.id,
            startDate: dto.startDate,
            endDate: dto.endDate,
            durationType,
          },
        });
      }
    } catch (err) {
      this.logger.debug(`Notification dispatch failed: ${(err as Error).message}`);
    }

    return {
      message: 'Work from home request submitted successfully',
      data: createdRequest,
    };
  }

  /**
   * 2. LIST WFH REQUESTS (Scoped, Filtered, Paginated)
   */
  async getWfhRequests(user: AuthenticatedUser, query: QueryWfhRequestsDto) {
    const employee = await this.resolveEmployee(user);
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    const isManager = user.roles.includes('MANAGER' as any);

    const where: Prisma.WfhRequestWhereInput = {
      organizationId: user.organizationId,
    };

    const scope = query.scope || 'my';

    if (scope === 'organization') {
      if (!isAdminOrHr) {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'Organization-wide scope requires HR or Admin role',
          code: 'FORBIDDEN_SCOPE',
        });
      }
    } else if (scope === 'team') {
      if (!isManager && !isAdminOrHr) {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'Team scope requires Manager role',
          code: 'FORBIDDEN_SCOPE',
        });
      }
      const team = await this.hierarchyService.getTeam(employee.id, user.organizationId);
      where.employeeId = { in: team.allMemberIds };
    } else {
      // scope === 'my'
      where.employeeId = employee.id;
    }

    // Specific employee filter override
    if (query.employeeId) {
      if (query.employeeId === employee.id) {
        where.employeeId = employee.id;
      } else if (isAdminOrHr) {
        where.employeeId = query.employeeId;
      } else if (isManager) {
        const isSubordinate = await this.hierarchyService.isManagerOf(
          employee.id,
          query.employeeId,
          user.organizationId,
        );
        if (!isSubordinate) {
          throw new ForbiddenException({
            statusCode: 403,
            message: 'Employee is not within your reporting hierarchy',
            code: 'FORBIDDEN_OUTSIDE_SCOPE',
          });
        }
        where.employeeId = query.employeeId;
      } else {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'Employees can only view their own WFH requests',
          code: 'FORBIDDEN_OUTSIDE_SCOPE',
        });
      }
    }

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Date range filter
    if (query.startDate) {
      const startUtc = this.normalizeDateToUtc(query.startDate);
      where.endDate = { gte: startUtc };
    }
    if (query.endDate) {
      const endUtc = this.normalizeDateToUtc(query.endDate);
      where.startDate = { lte: endUtc };
    }

    // Search query on reason
    if (query.search) {
      where.reason = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.wfhRequest.count({ where }),
      this.prisma.wfhRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { decidedAt: 'desc' },
          },
          cancelledBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return {
      message: 'Work from home requests retrieved successfully',
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 3. GET WFH REQUEST BY ID
   */
  async getWfhRequestById(user: AuthenticatedUser, id: string) {
    const employee = await this.resolveEmployee(user);
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    const isManager = user.roles.includes('MANAGER' as any);

    const request = await this.prisma.wfhRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            managerId: true,
          },
        },
        approvals: {
          include: {
            approver: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { decidedAt: 'desc' },
        },
        cancelledBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!request || request.organizationId !== user.organizationId) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Work from home request not found',
        code: 'WFH_NOT_FOUND',
      });
    }

    const isOwner = request.employeeId === employee.id;
    if (!isOwner && !isAdminOrHr) {
      if (isManager) {
        const isSubordinate = await this.hierarchyService.isManagerOf(
          employee.id,
          request.employeeId,
          user.organizationId,
        );
        if (!isSubordinate) {
          throw new ForbiddenException({
            statusCode: 403,
            message: 'You are not authorized to view this WFH request',
            code: 'FORBIDDEN_OUTSIDE_SCOPE',
          });
        }
      } else {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'You are not authorized to view this WFH request',
          code: 'FORBIDDEN_OUTSIDE_SCOPE',
        });
      }
    }

    return {
      message: 'Work from home request retrieved successfully',
      data: request,
    };
  }

  /**
   * 4. UPDATE WFH REQUEST (Handles Material Changes & Reapproval Trigger)
   */
  async updateWfhRequest(user: AuthenticatedUser, id: string, dto: UpdateWfhRequestDto) {
    const employee = await this.resolveEmployee(user);
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);

    const existing = await this.prisma.wfhRequest.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            manager: {
              select: {
                id: true,
                userId: true,
                firstName: true,
                lastName: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!existing || existing.organizationId !== user.organizationId) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Work from home request not found',
        code: 'WFH_NOT_FOUND',
      });
    }

    const isOwner = existing.employeeId === employee.id;
    if (!isOwner && !isAdminOrHr) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'You are not authorized to modify this WFH request',
        code: 'FORBIDDEN_OUTSIDE_SCOPE',
      });
    }

    // Terminal status enforcement
    const terminalStatuses: WfhStatus[] = [
      WfhStatus.CANCELLED,
      WfhStatus.REJECTED,
      WfhStatus.COMPLETED,
    ];
    if (terminalStatuses.includes(existing.status)) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Cannot update a WFH request in terminal status "${existing.status}"`,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    const startUtc = dto.startDate ? this.normalizeDateToUtc(dto.startDate) : existing.startDate;
    const endUtc = dto.endDate ? this.normalizeDateToUtc(dto.endDate) : existing.endDate;

    if (startUtc > endUtc) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'End date must be on or after start date',
        code: 'INVALID_DATE_RANGE',
      });
    }

    const durationType = dto.durationType || existing.durationType;

    if (
      durationType === WfhDurationType.FIRST_HALF ||
      durationType === WfhDurationType.SECOND_HALF
    ) {
      if (startUtc.getTime() !== endUtc.getTime()) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Half-day WFH requests can only be configured for a single date.',
          code: 'INVALID_HALF_DAY_RANGE',
        });
      }
    } else if (durationType === WfhDurationType.CUSTOM_RANGE) {
      if (startUtc.getTime() === endUtc.getTime()) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'CUSTOM_RANGE duration type requires a multi-day range (startDate < endDate).',
          code: 'INVALID_CUSTOM_RANGE',
        });
      }
    }

    // Material Change Detection
    const isMaterialChange =
      startUtc.getTime() !== existing.startDate.getTime() ||
      endUtc.getTime() !== existing.endDate.getTime() ||
      durationType !== existing.durationType;

    let targetStatus: WfhStatus = dto.status || existing.status;
    let isReapprovalTriggered = false;

    if (existing.status === WfhStatus.APPROVED && isMaterialChange) {
      targetStatus = WfhStatus.SUBMITTED;
      isReapprovalTriggered = true;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (isMaterialChange) {
        await this.checkOverlappingRequests(
          tx,
          existing.employeeId,
          user.organizationId,
          startUtc,
          endUtc,
          existing.id,
        );
      }

      const res = await tx.wfhRequest.update({
        where: { id: existing.id },
        data: {
          startDate: startUtc,
          endDate: endUtc,
          durationType,
          reason: dto.reason ? dto.reason.trim() : existing.reason,
          status: targetStatus,
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { decidedAt: 'desc' },
          },
        },
      });

      return res;
    });

    // Write audit record
    await this.auditService.record({
      action: isReapprovalTriggered ? 'WFH_REAPPROVAL_TRIGGERED' : 'WFH_UPDATED',
      entity: 'WfhRequest',
      entityId: updated.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        previousStatus: existing.status,
        newStatus: updated.status,
        isReapprovalTriggered,
        reason: updated.reason,
      },
    });

    if (isReapprovalTriggered) {
      try {
        if (existing.employee?.manager?.userId) {
          await this.notificationsService.createNotification({
            userId: existing.employee.manager.userId,
            organizationId: user.organizationId,
            title: `WFH Re-approval Required: ${existing.employee.displayName || existing.employee.firstName}`,
            message: `${existing.employee.displayName || existing.employee.firstName} modified their approved WFH dates. Status reset to SUBMITTED and re-approval is required.`,
            type: 'WARNING',
            link: `/wfh`,
            metadata: {
              requestId: updated.id,
              employeeId: existing.employeeId,
              isReapprovalTriggered: true,
            },
          });
        }
        if (existing.employee?.userId) {
          await this.notificationsService.createNotification({
            userId: existing.employee.userId,
            organizationId: user.organizationId,
            title: 'WFH Status Reset to SUBMITTED',
            message:
              'Your material updates have reset your WFH request status to SUBMITTED. Awaiting manager re-approval.',
            type: 'WARNING',
            link: `/wfh`,
            metadata: {
              requestId: updated.id,
              isReapprovalTriggered: true,
            },
          });
        }
      } catch (err) {
        this.logger.debug(`Notification dispatch failed: ${(err as Error).message}`);
      }
    }

    const responseMessage = isReapprovalTriggered
      ? 'WFH request modified with material changes and returned to SUBMITTED for re-approval'
      : 'WFH request updated successfully';

    return {
      message: responseMessage,
      data: updated,
      meta: { reapprovalTriggered: isReapprovalTriggered },
    };
  }

  /**
   * 5. CANCEL WFH REQUEST
   */
  async cancelWfhRequest(user: AuthenticatedUser, id: string, dto: CancelWfhRequestDto) {
    const employee = await this.resolveEmployee(user);
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    const isManager = user.roles.includes('MANAGER' as any);

    const request = await this.prisma.wfhRequest.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            manager: {
              select: {
                id: true,
                userId: true,
                firstName: true,
                lastName: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!request || request.organizationId !== user.organizationId) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Work from home request not found',
        code: 'WFH_NOT_FOUND',
      });
    }

    if (request.status === WfhStatus.CANCELLED) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'WFH request is already cancelled',
        code: 'WFH_ALREADY_CANCELLED',
      });
    }

    const nonCancellableStatuses: WfhStatus[] = [WfhStatus.REJECTED, WfhStatus.COMPLETED];
    if (nonCancellableStatuses.includes(request.status)) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Cannot cancel a WFH request in status "${request.status}"`,
        code: 'WFH_ALREADY_TERMINAL',
      });
    }

    const isOwner = request.employeeId === employee.id;
    let isAuthorizedManager = false;
    if (isManager && !isOwner) {
      isAuthorizedManager = await this.hierarchyService.isManagerOf(
        employee.id,
        request.employeeId,
        user.organizationId,
      );
    }

    if (!isOwner && !isAdminOrHr && !isAuthorizedManager) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'You are not authorized to cancel this WFH request',
        code: 'FORBIDDEN_OUTSIDE_SCOPE',
      });
    }

    // Commencement Policy: If today >= startDate, owning employee cannot self-cancel
    const todayUtc = this.normalizeDateToUtc(new Date());
    const hasCommenced = todayUtc.getTime() >= request.startDate.getTime();
    if (hasCommenced && isOwner && !isAdminOrHr && !isAuthorizedManager) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'WFH request has already commenced or is scheduled for today. Cancellation requires manager or HR authorization.',
        code: 'WFH_ALREADY_COMMENCED',
      });
    }

    const cancelledRequest = await this.prisma.wfhRequest.update({
      where: { id: request.id },
      data: {
        status: WfhStatus.CANCELLED,
        cancellationReason: dto.cancellationReason.trim(),
        cancelledAt: new Date(),
        cancelledById: user.id,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
    });

    await this.auditService.record({
      action: 'WFH_CANCELLED',
      entity: 'WfhRequest',
      entityId: cancelledRequest.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        reason: dto.cancellationReason,
        cancelledBy: user.email,
        wasCommenced: hasCommenced,
        previousStatus: request.status,
      },
    });

    try {
      const isCancelledByOwner = request.employeeId === employee.id;
      if (isCancelledByOwner && request.employee?.manager?.userId) {
        await this.notificationsService.createNotification({
          userId: request.employee.manager.userId,
          organizationId: user.organizationId,
          title: `WFH Request Cancelled: ${request.employee.displayName || request.employee.firstName}`,
          message: `${request.employee.displayName || request.employee.firstName} cancelled their WFH request for ${request.startDate.toISOString().slice(0, 10)} to ${request.endDate.toISOString().slice(0, 10)}. Reason: "${dto.cancellationReason}"`,
          type: 'INFO',
          link: `/wfh`,
          idempotencyKey: `notif:wfh_cancel:${request.id}`,
          metadata: {
            requestId: request.id,
            cancellationReason: dto.cancellationReason,
          },
        });
      } else if (!isCancelledByOwner && request.employee?.userId) {
        await this.notificationsService.createNotification({
          userId: request.employee.userId,
          organizationId: user.organizationId,
          title: 'WFH Request Cancelled by Reviewer',
          message: `Your WFH request for ${request.startDate.toISOString().slice(0, 10)} to ${request.endDate.toISOString().slice(0, 10)} was cancelled by ${user.firstName} ${user.lastName}. Reason: "${dto.cancellationReason}"`,
          type: 'WARNING',
          link: `/wfh`,
          idempotencyKey: `notif:wfh_cancel:${request.id}`,
          metadata: {
            requestId: request.id,
            cancellationReason: dto.cancellationReason,
            cancelledById: user.id,
          },
        });
      }
    } catch (err) {
      this.logger.debug(`Notification dispatch failed: ${(err as Error).message}`);
    }

    return {
      message: 'Work from home request cancelled successfully',
      data: cancelledRequest,
    };
  }

  /**
   * 6. DECIDE WFH REQUEST (APPROVE / REJECT)
   */
  async decideWfhRequest(user: AuthenticatedUser, id: string, dto: DecideWfhRequestDto) {
    const reviewerEmployee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ userId: user.id }, { employeeCode: user.employeeCode }],
      },
    });

    const request = await this.prisma.wfhRequest.findUnique({
      where: { id },
      include: {
        employee: true,
      },
    });

    if (!request || request.organizationId !== user.organizationId) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Work from home request not found',
        code: 'WFH_NOT_FOUND',
      });
    }

    // 1. Prevent Self-Approval
    const isSelfApproval =
      (reviewerEmployee && request.employeeId === reviewerEmployee.id) ||
      (request.employee && request.employee.userId === user.id);

    if (isSelfApproval) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'Self-approval is strictly disallowed. You cannot approve or reject your own WFH request.',
        code: 'SELF_APPROVAL_DISALLOWED',
      });
    }

    // 2. Status Validation
    if (request.status === WfhStatus.CANCELLED) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Cannot review a WFH request that has been cancelled.',
        code: 'WFH_ALREADY_CANCELLED',
      });
    }

    if (request.status === WfhStatus.APPROVED || request.status === WfhStatus.REJECTED) {
      throw new BadRequestException({
        statusCode: 400,
        message: `WFH request has already been ${request.status.toLowerCase()}.`,
        code: 'REQUEST_ALREADY_DECIDED',
      });
    }

    if (request.status !== WfhStatus.SUBMITTED) {
      throw new BadRequestException({
        statusCode: 400,
        message: `WFH request must be in SUBMITTED status to be reviewed (current status: "${request.status}").`,
        code: 'INVALID_STATUS_FOR_DECISION',
      });
    }

    // 3. Reviewer comments mandatory on REJECTION
    if (dto.decision === ApprovalDecision.REJECTED && (!dto.comments || !dto.comments.trim())) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Reviewer comments are mandatory when rejecting a WFH request.',
        code: 'REJECTION_COMMENTS_REQUIRED',
      });
    }

    // 4. Manager Hierarchy Check OR HR/Admin Oversight Permission
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    const hasOversightPermission =
      isAdminOrHr ||
      (user.permissions &&
        (user.permissions.includes('WFH_APPROVE_ALL') ||
          user.permissions.includes('WFH_OVERSIGHT') ||
          user.permissions.includes('WFH_APPROVE_ANY')));

    let isAuthorizedManager = false;
    if (reviewerEmployee) {
      isAuthorizedManager = await this.hierarchyService.isManagerOf(
        reviewerEmployee.id,
        request.employeeId,
        user.organizationId,
      );
    }

    if (!isAuthorizedManager && !hasOversightPermission) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'Access denied: You are only authorized to review WFH requests from your assigned reporting team.',
        code: 'FORBIDDEN_OUTSIDE_SCOPE',
      });
    }

    const isEscalationOverride = !isAuthorizedManager && hasOversightPermission;

    const targetStatus =
      dto.decision === ApprovalDecision.APPROVED ? WfhStatus.APPROVED : WfhStatus.REJECTED;

    const result = await this.prisma.$transaction(async (tx) => {
      // Concurrency protection: atomic update where status is still SUBMITTED
      const updateResult = await tx.wfhRequest.updateMany({
        where: {
          id: request.id,
          organizationId: user.organizationId,
          status: WfhStatus.SUBMITTED,
        },
        data: {
          status: targetStatus,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          statusCode: 409,
          message: 'This WFH request has already been reviewed or altered by another reviewer.',
          code: 'CONCURRENT_REVIEW_CONFLICT',
        });
      }

      const approvalRecord = await tx.wfhApproval.create({
        data: {
          requestId: request.id,
          approverId: user.id,
          decision: dto.decision,
          comments: dto.comments ? dto.comments.trim() : null,
          decidedAt: new Date(),
        },
        include: {
          approver: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      const updatedRequest = await tx.wfhRequest.findUnique({
        where: { id: request.id },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { decidedAt: 'desc' },
          },
        },
      });

      return { request: updatedRequest, approval: approvalRecord };
    });

    // Record audit history covering explicit dates, day portions, and escalation override
    await this.auditService.record({
      action: dto.decision === ApprovalDecision.APPROVED ? 'WFH_APPROVED' : 'WFH_REJECTED',
      entity: 'WfhRequest',
      entityId: request.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        decision: dto.decision,
        comments: dto.comments,
        startDate: request.startDate.toISOString().slice(0, 10),
        endDate: request.endDate.toISOString().slice(0, 10),
        durationType: request.durationType,
        isEscalationOverride,
        requesterId: request.employeeId,
      },
    });

    // In-app notification to employee
    try {
      if (request.employee?.userId) {
        await this.notificationsService.createNotification({
          userId: request.employee.userId,
          organizationId: user.organizationId,
          title: `WFH Request ${dto.decision}: ${request.startDate.toISOString().slice(0, 10)}`,
          message: `Your WFH request for ${request.startDate.toISOString().slice(0, 10)} to ${request.endDate.toISOString().slice(0, 10)} (${request.durationType}) has been ${dto.decision.toLowerCase()} by ${user.firstName} ${user.lastName}.${dto.comments ? ` Remarks: "${dto.comments}"` : ''}`,
          type: dto.decision === ApprovalDecision.APPROVED ? 'SUCCESS' : 'WARNING',
          link: `/wfh`,
          idempotencyKey: `notif:wfh_decide:${request.id}:${dto.decision}`,
          metadata: {
            requestId: request.id,
            decision: dto.decision,
            approverId: user.id,
            isEscalationOverride,
            startDate: request.startDate.toISOString().slice(0, 10),
            endDate: request.endDate.toISOString().slice(0, 10),
            durationType: request.durationType,
          },
        });
      }
    } catch (err) {
      this.logger.debug(`Notification dispatch failed: ${(err as Error).message}`);
    }

    return {
      message: `Work from home request ${dto.decision.toLowerCase()} successfully`,
      data: result.request,
      approval: result.approval,
    };
  }

  /**
   * 7. GET MANAGER PENDING WFH REQUESTS
   */
  async getManagerPendingWfh(user: AuthenticatedUser, query: QueryWfhRequestsDto) {
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    let allowedEmployeeIds: string[] | null = null;

    if (isAdminOrHr && query.scope === 'organization') {
      // Oversight view of all pending requests in organization
      allowedEmployeeIds = null;
    } else {
      const employee = await this.resolveEmployee(user);
      const team = await this.hierarchyService.getTeam(employee.id, user.organizationId);
      allowedEmployeeIds = team.allMemberIds;
    }

    const where: Prisma.WfhRequestWhereInput = {
      organizationId: user.organizationId,
      status: WfhStatus.SUBMITTED,
      ...(allowedEmployeeIds ? { employeeId: { in: allowedEmployeeIds } } : {}),
    };

    if (query.search) {
      where.reason = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.wfhRequest.count({ where }),
      this.prisma.wfhRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      message: 'Pending team WFH requests retrieved successfully',
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves WFH operations overview, status breakdown, duration breakdown, and today's activity
   */
  async getOperationsOverview(user: AuthenticatedUser, query: QueryWfhRequestsDto) {
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    let scopedEmployeeIds: string[] | null = null;

    if (!isAdminOrHr) {
      const reviewer = await this.resolveEmployee(user);
      const team = await this.hierarchyService.getTeam(reviewer.id, user.organizationId);
      scopedEmployeeIds = team.allMemberIds;
    }

    const todayUtc = this.normalizeDateToUtc(new Date());

    const baseWhere: Prisma.WfhRequestWhereInput = {
      organizationId: user.organizationId,
    };

    if (scopedEmployeeIds !== null) {
      baseWhere.employeeId = { in: scopedEmployeeIds };
    }

    if (query.status) {
      baseWhere.status = query.status;
    }

    if (query.startDate && query.endDate) {
      const s = this.normalizeDateToUtc(query.startDate);
      const e = this.normalizeDateToUtc(query.endDate);
      baseWhere.startDate = { lte: e };
      baseWhere.endDate = { gte: s };
    }

    const statusCountsRaw = await this.prisma.wfhRequest.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {
      SUBMITTED: 0,
      APPROVED: 0,
      REJECTED: 0,
      CANCELLED: 0,
      COMPLETED: 0,
      total: 0,
    };
    for (const c of statusCountsRaw) {
      if (statusCounts[c.status] !== undefined) {
        statusCounts[c.status] = c._count.id;
      }
      statusCounts.total += c._count.id;
    }

    const durationCountsRaw = await this.prisma.wfhRequest.groupBy({
      by: ['durationType'],
      where: baseWhere,
      _count: { id: true },
    });

    const durationCounts: Record<string, number> = {
      FULL_DAY: 0,
      FIRST_HALF: 0,
      SECOND_HALF: 0,
      CUSTOM_RANGE: 0,
    };
    for (const c of durationCountsRaw) {
      if (durationCounts[c.durationType] !== undefined) {
        durationCounts[c.durationType] = c._count.id;
      }
    }

    const endOfTodayUtc = new Date(todayUtc);
    endOfTodayUtc.setUTCHours(23, 59, 59, 999);

    const todayWfh = await this.prisma.wfhRequest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(scopedEmployeeIds !== null ? { employeeId: { in: scopedEmployeeIds } } : {}),
        status: WfhStatus.APPROVED,
        startDate: { lte: endOfTodayUtc },
        endDate: { gte: todayUtc },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            employeeCode: true,
          },
        },
        attendanceSessions: {
          where: { date: todayUtc },
          select: { id: true, status: true, checkInTime: true, checkOutTime: true },
        },
      },
    });

    const approvedToday = todayWfh.length;
    const checkedInToday = todayWfh.filter(
      (w) => w.attendanceSessions && w.attendanceSessions.length > 0,
    ).length;
    const notCheckedIn = Math.max(0, approvedToday - checkedInToday);

    return {
      message: 'WFH operations overview retrieved successfully',
      data: {
        statusCounts,
        durationCounts,
        todayActivity: {
          approvedToday,
          checkedInToday,
          notCheckedIn,
          requests: todayWfh,
        },
      },
    };
  }
}
