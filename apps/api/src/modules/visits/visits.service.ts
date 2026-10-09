import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  VisitStatus,
  ApprovalDecision,
  Prisma,
  OfficialVisit,
  VisitDestination,
} from '@hrms/database';
import { CreateOfficialVisitDto, CreateVisitDestinationDto } from './dto/create-official-visit.dto';
import { UpdateOfficialVisitDto } from './dto/update-official-visit.dto';
import { CancelOfficialVisitDto } from './dto/cancel-official-visit.dto';
import { QueryOfficialVisitsDto } from './dto/query-official-visits.dto';
import { DecideOfficialVisitDto } from './dto/decide-official-visit.dto';

export const MAX_VISIT_DURATION_DAYS = 30;
export const MAX_RETROSPECTIVE_DAYS = 7;

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Resolves the Employee record associated with the authenticated user
   */
  async resolveEmployee(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ userId: user.id }, { employeeCode: user.employeeCode }],
        isActive: true,
      },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Active employee profile not found for user',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    return employee;
  }

  /**
   * Normalizes an ISO date or YYYY-MM-DD string to UTC midnight
   */
  normalizeDateToUtc(dateInput: string | Date): Date {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid date provided',
        code: 'INVALID_DATE',
      });
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  }

  /**
   * Helper to check for overlapping active visits for an employee
   */
  async checkOverlappingVisits(
    tx: Prisma.TransactionClient,
    employeeId: string,
    organizationId: string,
    startDate: Date,
    endDate: Date,
    excludeVisitId?: string,
  ) {
    const overlapping = await tx.officialVisit.findFirst({
      where: {
        organizationId,
        employeeId,
        id: excludeVisitId ? { not: excludeVisitId } : undefined,
        status: {
          in: [VisitStatus.SUBMITTED, VisitStatus.APPROVED, VisitStatus.IN_PROGRESS],
        },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: {
        destinations: true,
      },
    });

    if (overlapping) {
      const fromStr = overlapping.startDate.toISOString().slice(0, 10);
      const toStr = overlapping.endDate.toISOString().slice(0, 10);
      throw new ConflictException({
        statusCode: 409,
        message: `An overlapping official visit already exists for this employee ("${overlapping.title}", status: ${overlapping.status}) from ${fromStr} to ${toStr}.`,
        code: 'REQUEST_OVERLAP_CONFLICT',
      });
    }
  }

  /**
   * Determines if a change to an APPROVED visit is material, necessitating reapproval
   */
  isMaterialChange(
    existing: OfficialVisit & { destinations: VisitDestination[] },
    dto: UpdateOfficialVisitDto,
    newStartUtc?: Date,
    newEndUtc?: Date,
  ): boolean {
    if (newStartUtc && existing.startDate.getTime() !== newStartUtc.getTime()) {
      return true;
    }
    if (newEndUtc && existing.endDate.getTime() !== newEndUtc.getTime()) {
      return true;
    }
    if (dto.destinations) {
      if (dto.destinations.length !== existing.destinations.length) {
        return true;
      }
      for (let i = 0; i < dto.destinations.length; i++) {
        const d = dto.destinations[i];
        const ex = existing.destinations[i];
        if (!ex) return true;
        if (d.destinationName !== ex.destinationName) return true;
        if (d.latitude !== ex.latitude || d.longitude !== ex.longitude) return true;
        if (d.radiusMeters !== undefined && d.radiusMeters !== ex.radiusMeters) return true;
        if (d.isGeofenceRequired !== undefined && d.isGeofenceRequired !== ex.isGeofenceRequired)
          return true;
      }
    }
    return false;
  }

  /**
   * 1. CREATE OFFICIAL VISIT
   */
  async createVisit(user: AuthenticatedUser, dto: CreateOfficialVisitDto) {
    const employee = await this.resolveEmployee(user);
    const startUtc = this.normalizeDateToUtc(dto.startDate);
    const endUtc = this.normalizeDateToUtc(dto.endDate);

    if (startUtc > endUtc) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'End date must be on or after start date',
        code: 'INVALID_DATE_RANGE',
      });
    }

    const calculatedDays =
      Math.round((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (calculatedDays > MAX_VISIT_DURATION_DAYS) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Official visit duration cannot exceed ${MAX_VISIT_DURATION_DAYS} days`,
        code: 'EXCEEDS_MAX_DURATION',
      });
    }

    // Policy: past dates restricted to maximum 7 retrospective days for non-admins
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    const todayUtc = this.normalizeDateToUtc(new Date());
    const minAllowed = new Date(todayUtc);
    minAllowed.setUTCDate(minAllowed.getUTCDate() - MAX_RETROSPECTIVE_DAYS);

    if (startUtc < minAllowed && !isAdminOrHr) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Official visit start date cannot be more than ${MAX_RETROSPECTIVE_DAYS} days in the past`,
        code: 'PAST_DATE_PROHIBITED',
      });
    }

    const initialStatus = dto.status || VisitStatus.SUBMITTED;
    if (initialStatus !== VisitStatus.DRAFT && initialStatus !== VisitStatus.SUBMITTED) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Initial visit status can only be DRAFT or SUBMITTED',
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    // Execute within transaction
    const createdVisit = await this.prisma.$transaction(async (tx) => {
      // Overlap prevention for submitted visits
      if (initialStatus === VisitStatus.SUBMITTED) {
        await this.checkOverlappingVisits(tx, employee.id, user.organizationId, startUtc, endUtc);
      }

      const visit = await tx.officialVisit.create({
        data: {
          organizationId: user.organizationId,
          employeeId: employee.id,
          title: dto.title,
          purpose: dto.purpose,
          startDate: startUtc,
          endDate: endUtc,
          expectedDurationDays: dto.expectedDurationDays ?? calculatedDays,
          status: initialStatus,
          destinations: {
            create: dto.destinations.map((dest: CreateVisitDestinationDto) => ({
              destinationName: dest.destinationName,
              address: dest.address ?? null,
              city: dest.city ?? null,
              latitude: dest.latitude ?? null,
              longitude: dest.longitude ?? null,
              radiusMeters: dest.radiusMeters ?? 200,
              isGeofenceRequired: dest.isGeofenceRequired ?? true,
            })),
          },
        },
        include: {
          destinations: true,
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

      return visit;
    });

    // Write audit record
    await this.auditService.record({
      action: 'VISIT_CREATED',
      entity: 'OfficialVisit',
      entityId: createdVisit.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        title: createdVisit.title,
        status: createdVisit.status,
        startDate: createdVisit.startDate.toISOString(),
        endDate: createdVisit.endDate.toISOString(),
        destinationCount: createdVisit.destinations.length,
      },
    });

    return {
      message: 'Official visit created successfully',
      data: createdVisit,
    };
  }

  /**
   * 2. LIST OFFICIAL VISITS (with scope, pagination, and multi-filter search)
   */
  async getVisits(user: AuthenticatedUser, query: QueryOfficialVisitsDto) {
    const employee = await this.resolveEmployee(user);
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    const isManager = user.roles.includes('MANAGER' as any);

    const where: Prisma.OfficialVisitWhereInput = {
      organizationId: user.organizationId,
    };

    // Scope Resolution & Authorization
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

    // Explicit employeeId filter override
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
          message: 'Employees can only view their own visits',
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

    // Text search on title or purpose
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { purpose: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.officialVisit.count({ where }),
      this.prisma.officialVisit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
        include: {
          destinations: true,
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
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
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
      message: 'Official visits retrieved successfully',
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
   * 3. GET OFFICIAL VISIT BY ID
   */
  async getVisitById(user: AuthenticatedUser, id: string) {
    const employee = await this.resolveEmployee(user);
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    const isManager = user.roles.includes('MANAGER' as any);

    const visit = await this.prisma.officialVisit.findUnique({
      where: { id },
      include: {
        destinations: true,
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

    if (!visit || visit.organizationId !== user.organizationId) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Official visit not found',
        code: 'VISIT_NOT_FOUND',
      });
    }

    // Access authorization
    const isOwner = visit.employeeId === employee.id;
    if (!isOwner && !isAdminOrHr) {
      if (isManager) {
        const isSubordinate = await this.hierarchyService.isManagerOf(
          employee.id,
          visit.employeeId,
          user.organizationId,
        );
        if (!isSubordinate) {
          throw new ForbiddenException({
            statusCode: 403,
            message: 'You are not authorized to view this official visit',
            code: 'FORBIDDEN_OUTSIDE_SCOPE',
          });
        }
      } else {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'You are not authorized to view this official visit',
          code: 'FORBIDDEN_OUTSIDE_SCOPE',
        });
      }
    }

    return {
      message: 'Official visit retrieved successfully',
      data: visit,
    };
  }

  /**
   * 4. UPDATE OFFICIAL VISIT (Handles material changes, reapproval & status transitions)
   */
  async updateVisit(user: AuthenticatedUser, id: string, dto: UpdateOfficialVisitDto) {
    const employee = await this.resolveEmployee(user);
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);

    const existing = await this.prisma.officialVisit.findUnique({
      where: { id },
      include: {
        destinations: true,
        employee: true,
      },
    });

    if (!existing || existing.organizationId !== user.organizationId) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Official visit not found',
        code: 'VISIT_NOT_FOUND',
      });
    }

    // Ownership check: only owner or HR/Admin can update
    const isOwner = existing.employeeId === employee.id;
    if (!isOwner && !isAdminOrHr) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'You are not authorized to modify this official visit',
        code: 'FORBIDDEN_OUTSIDE_SCOPE',
      });
    }

    // Status transition validity check
    const terminalStatuses: VisitStatus[] = [
      VisitStatus.CANCELLED,
      VisitStatus.REJECTED,
      VisitStatus.IN_PROGRESS,
      VisitStatus.COMPLETED,
      VisitStatus.EXPIRED,
    ];
    if (terminalStatuses.includes(existing.status)) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Cannot update an official visit in status "${existing.status}"`,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    // Target status resolution
    let targetStatus: VisitStatus = dto.status || existing.status;
    let isReapprovalTriggered = false;

    // Validate requested status transition
    if (dto.status && dto.status !== existing.status) {
      if (
        (existing.status === VisitStatus.DRAFT && dto.status !== VisitStatus.SUBMITTED) ||
        (existing.status === VisitStatus.SUBMITTED && dto.status !== VisitStatus.DRAFT) ||
        (existing.status === VisitStatus.APPROVED && dto.status !== VisitStatus.SUBMITTED)
      ) {
        throw new BadRequestException({
          statusCode: 400,
          message: `Direct transition from "${existing.status}" to "${dto.status}" is not permitted via update`,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
    }

    // Normalized dates
    const startUtc = dto.startDate ? this.normalizeDateToUtc(dto.startDate) : existing.startDate;
    const endUtc = dto.endDate ? this.normalizeDateToUtc(dto.endDate) : existing.endDate;

    if (startUtc > endUtc) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'End date must be on or after start date',
        code: 'INVALID_DATE_RANGE',
      });
    }

    const calculatedDays =
      Math.round((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (calculatedDays > MAX_VISIT_DURATION_DAYS) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Official visit duration cannot exceed ${MAX_VISIT_DURATION_DAYS} days`,
        code: 'EXCEEDS_MAX_DURATION',
      });
    }

    // Material Change Check on APPROVED visits:
    // If APPROVED visit has dates or destinations modified, automatically reset status to SUBMITTED
    if (existing.status === VisitStatus.APPROVED) {
      const material = this.isMaterialChange(existing, dto, startUtc, endUtc);
      if (material) {
        targetStatus = VisitStatus.SUBMITTED;
        isReapprovalTriggered = true;
      }
    }

    // Transaction execution
    const updatedVisit = await this.prisma.$transaction(async (tx) => {
      // Check overlaps if submitted or approved
      if (targetStatus === VisitStatus.SUBMITTED || targetStatus === VisitStatus.APPROVED) {
        await this.checkOverlappingVisits(
          tx,
          existing.employeeId,
          user.organizationId,
          startUtc,
          endUtc,
          existing.id,
        );
      }

      // If destinations updated, replace them
      if (dto.destinations && dto.destinations.length > 0) {
        await tx.visitDestination.deleteMany({
          where: { visitId: existing.id },
        });

        await tx.visitDestination.createMany({
          data: dto.destinations.map((d: CreateVisitDestinationDto) => ({
            visitId: existing.id,
            destinationName: d.destinationName,
            address: d.address ?? null,
            city: d.city ?? null,
            latitude: d.latitude ?? null,
            longitude: d.longitude ?? null,
            radiusMeters: d.radiusMeters ?? 200,
            isGeofenceRequired: d.isGeofenceRequired ?? true,
          })),
        });
      }

      const updated = await tx.officialVisit.update({
        where: { id: existing.id },
        data: {
          title: dto.title ?? existing.title,
          purpose: dto.purpose ?? existing.purpose,
          startDate: startUtc,
          endDate: endUtc,
          expectedDurationDays: dto.expectedDurationDays ?? calculatedDays,
          status: targetStatus,
        },
        include: {
          destinations: true,
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

      return updated;
    });

    // Write audit record
    await this.auditService.record({
      action: isReapprovalTriggered ? 'VISIT_REAPPROVAL_TRIGGERED' : 'VISIT_UPDATED',
      entity: 'OfficialVisit',
      entityId: updatedVisit.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        previousStatus: existing.status,
        newStatus: updatedVisit.status,
        isReapprovalTriggered,
        changes: {
          title: dto.title,
          dates: dto.startDate || dto.endDate ? { start: startUtc, end: endUtc } : undefined,
          destinationsCount: dto.destinations ? dto.destinations.length : undefined,
        },
      },
    });

    const responseMessage = isReapprovalTriggered
      ? 'Official visit modified with material changes and returned to SUBMITTED for re-approval'
      : 'Official visit updated successfully';

    return {
      message: responseMessage,
      data: updatedVisit,
      meta: { reapprovalTriggered: isReapprovalTriggered },
    };
  }

  /**
   * 5. CANCEL OFFICIAL VISIT
   */
  async cancelVisit(user: AuthenticatedUser, id: string, dto: CancelOfficialVisitDto) {
    const employee = await this.resolveEmployee(user);
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    const isManager = user.roles.includes('MANAGER' as any);

    const visit = await this.prisma.officialVisit.findUnique({
      where: { id },
      include: {
        employee: true,
        destinations: true,
      },
    });

    if (!visit || visit.organizationId !== user.organizationId) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Official visit not found',
        code: 'VISIT_NOT_FOUND',
      });
    }

    if (visit.status === VisitStatus.CANCELLED) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Official visit is already cancelled',
        code: 'VISIT_ALREADY_CANCELLED',
      });
    }

    const nonCancellableStatuses: VisitStatus[] = [
      VisitStatus.REJECTED,
      VisitStatus.COMPLETED,
      VisitStatus.EXPIRED,
    ];
    if (nonCancellableStatuses.includes(visit.status)) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Cannot cancel an official visit in status "${visit.status}"`,
        code: 'VISIT_ALREADY_TERMINAL',
      });
    }

    const isOwner = visit.employeeId === employee.id;
    let isAuthorizedManager = false;
    if (isManager && !isOwner) {
      isAuthorizedManager = await this.hierarchyService.isManagerOf(
        employee.id,
        visit.employeeId,
        user.organizationId,
      );
    }

    if (!isOwner && !isAdminOrHr && !isAuthorizedManager) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'You are not authorized to cancel this official visit',
        code: 'FORBIDDEN_OUTSIDE_SCOPE',
      });
    }

    // Commencement Policy: If visit date has arrived (today or past), owning employee cannot self-cancel
    const todayUtc = this.normalizeDateToUtc(new Date());
    const hasCommenced = todayUtc.getTime() >= visit.startDate.getTime();
    if (hasCommenced && isOwner && !isAdminOrHr && !isAuthorizedManager) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'Visit has already commenced or is scheduled for today. Cancellation requires manager or HR authorization.',
        code: 'VISIT_ALREADY_COMMENCED',
      });
    }

    const cancelledVisit = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.officialVisit.update({
        where: { id: visit.id },
        data: {
          status: VisitStatus.CANCELLED,
          cancellationReason: dto.cancellationReason,
          cancelledAt: new Date(),
          cancelledById: user.id,
        },
        include: {
          destinations: true,
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
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

      return updated;
    });

    // Write audit record
    await this.auditService.record({
      action: 'VISIT_CANCELLED',
      entity: 'OfficialVisit',
      entityId: cancelledVisit.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        reason: dto.cancellationReason,
        cancelledBy: user.email,
        wasCommenced: hasCommenced,
        previousStatus: visit.status,
      },
    });

    return {
      message: 'Official visit cancelled successfully',
      data: cancelledVisit,
    };
  }

  /**
   * 6. DECIDE OFFICIAL VISIT (APPROVE / REJECT)
   * Enforces:
   *  - Manager team hierarchy check OR HR/Admin escalation override
   *  - Prevention of self-approval
   *  - Rejection of cancelled, expired, or already-decided requests
   *  - Concurrency conflict protection via atomic state transition
   *  - Creation of VisitApproval record with comments, decision, reviewer and timestamp
   *  - In-app notification to requester
   *  - Transactional audit log recording
   */
  async decideVisit(user: AuthenticatedUser, id: string, dto: DecideOfficialVisitDto) {
    const reviewerEmployee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ userId: user.id }, { employeeCode: user.employeeCode }],
      },
    });

    const visit = await this.prisma.officialVisit.findUnique({
      where: { id },
      include: {
        employee: true,
        destinations: true,
      },
    });

    if (!visit || visit.organizationId !== user.organizationId) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Official visit request not found',
        code: 'VISIT_NOT_FOUND',
      });
    }

    // 1. Prevent Self-Approval
    const isSelfApproval =
      (reviewerEmployee && visit.employeeId === reviewerEmployee.id) ||
      (visit.employee && visit.employee.userId === user.id);

    if (isSelfApproval) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'Self-approval is strictly disallowed. You cannot approve or reject your own official visit request.',
        code: 'SELF_APPROVAL_DISALLOWED',
      });
    }

    // 2. State & Expiration Validations
    if (visit.status === VisitStatus.CANCELLED) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Cannot review an official visit request that has been cancelled.',
        code: 'VISIT_ALREADY_CANCELLED',
      });
    }

    if (visit.status === VisitStatus.APPROVED || visit.status === VisitStatus.REJECTED) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Official visit request has already been ${visit.status.toLowerCase()}.`,
        code: 'REQUEST_ALREADY_DECIDED',
      });
    }

    if (visit.status !== VisitStatus.SUBMITTED) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Official visit must be in SUBMITTED status to be reviewed (current status: "${visit.status}").`,
        code: 'INVALID_STATUS_FOR_DECISION',
      });
    }

    // Expiration check: if visit end date has passed, auto-expire
    const todayUtc = this.normalizeDateToUtc(new Date());
    if (todayUtc.getTime() > visit.endDate.getTime()) {
      await this.prisma.officialVisit.update({
        where: { id: visit.id },
        data: { status: VisitStatus.EXPIRED },
      });
      throw new BadRequestException({
        statusCode: 400,
        message:
          'Official visit date window has already elapsed. Request is expired and can no longer be approved.',
        code: 'REQUEST_EXPIRED',
      });
    }

    // 3. Reviewer Scope & Escalation / HR Exception Handling
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);
    const isManager = user.roles.includes('MANAGER' as any);

    let isAuthorizedManager = false;
    if (reviewerEmployee) {
      isAuthorizedManager = await this.hierarchyService.isManagerOf(
        reviewerEmployee.id,
        visit.employeeId,
        user.organizationId,
      );
    }

    if (!isAuthorizedManager && !isAdminOrHr) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'Access denied: You are only authorized to review official visit requests from your assigned reporting team.',
        code: 'FORBIDDEN_OUTSIDE_SCOPE',
      });
    }

    // Escalation flag: HR/Admin approving outside the direct supervisor chain
    const isEscalationOverride = !isAuthorizedManager && isAdminOrHr;

    // 4. Concurrency Protection & Transactional Decision Execution
    const targetStatus =
      dto.decision === ApprovalDecision.APPROVED ? VisitStatus.APPROVED : VisitStatus.REJECTED;

    const result = await this.prisma.$transaction(async (tx) => {
      // Atomic condition: only update if status is STILL SUBMITTED
      const updateResult = await tx.officialVisit.updateMany({
        where: {
          id: visit.id,
          organizationId: user.organizationId,
          status: VisitStatus.SUBMITTED,
        },
        data: {
          status: targetStatus,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          statusCode: 409,
          message:
            'This official visit request has already been reviewed or altered by another reviewer.',
          code: 'CONCURRENT_REVIEW_CONFLICT',
        });
      }

      // Record reviewer identity, timestamp, decision, and comments
      const approvalRecord = await tx.visitApproval.create({
        data: {
          visitId: visit.id,
          approverId: user.id,
          decision: dto.decision,
          comments: dto.comments || null,
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

      const updated = await tx.officialVisit.findUnique({
        where: { id: visit.id },
        include: {
          destinations: true,
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

      return { updated, approvalRecord };
    });

    // 5. In-App Notification Dispatch
    try {
      if (visit.employee && visit.employee.userId) {
        await this.notificationsService.createNotification({
          userId: visit.employee.userId,
          organizationId: user.organizationId,
          title: `Official Visit ${dto.decision}: ${visit.title}`,
          message: `Your official visit request "${visit.title}" has been ${dto.decision.toLowerCase()} by ${user.firstName} ${user.lastName}.${dto.comments ? ` Comments: "${dto.comments}"` : ''}`,
          type: dto.decision === ApprovalDecision.APPROVED ? 'SUCCESS' : 'WARNING',
          link: `/visits`,
          metadata: {
            visitId: visit.id,
            decision: dto.decision,
            approverId: user.id,
            isEscalationOverride,
          },
        });
      }
    } catch {
      // Notification dispatch failure should not block core transaction
    }

    // 6. Audit Trail Logging
    await this.auditService.record({
      action: `VISIT_${dto.decision}`,
      entity: 'OfficialVisit',
      entityId: visit.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        decision: dto.decision,
        comments: dto.comments,
        isEscalationOverride,
        employeeId: visit.employeeId,
        approverEmail: user.email,
        title: visit.title,
      },
    });

    return {
      message: `Official visit request ${dto.decision.toLowerCase()} successfully${isEscalationOverride ? ' (via HR escalation)' : ''}`,
      data: result.updated,
      approval: result.approvalRecord,
      meta: {
        isEscalationOverride,
      },
    };
  }

  /**
   * 7. GET MANAGER PENDING VISITS
   */
  async getManagerPendingVisits(user: AuthenticatedUser, query: QueryOfficialVisitsDto) {
    const isAdminOrHr = user.roles.includes('ADMIN' as any) || user.roles.includes('HR' as any);

    return this.getVisits(user, {
      ...query,
      scope: isAdminOrHr ? 'organization' : 'team',
      status: VisitStatus.SUBMITTED,
    });
  }
}
