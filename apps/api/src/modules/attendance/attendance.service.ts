import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { AttendancePoliciesService } from './attendance-policies.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { BreakDto } from './dto/break.dto';
import {
  haversineDistance,
  validateCoordinates,
  validateGpsAccuracy,
  validateTimestampFreshness,
} from './utils/geofence.util';
import {
  resolveWorkingDay,
  calculateShiftWindow,
  getTimezoneParts,
} from './utils/policy-evaluator.util';
import { calculateDailyAttendance } from './utils/daily-attendance-calculator.util';
import { RecalculateAttendanceDto } from './dto/recalculate-attendance.dto';
import { SubmitCorrectionRequestDto } from './dto/correction-request.dto';
import { AttendanceOperationsQueryDto } from './dto/attendance-operations-query.dto';
import { DecideCorrectionRequestDto } from './dto/decide-correction.dto';
import { AttendanceExceptionQueryDto } from './dto/attendance-exception-query.dto';
import { ResolveExceptionDto } from './dto/resolve-exception.dto';
import { RemoteFieldOverviewQueryDto } from './dto/remote-field-overview-query.dto';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AttendanceDayStatus, AttendanceExceptionType } from '@hrms/types';
import {
  VisitStatus,
  AttendanceMode,
  OfficialVisit,
  VisitDestination,
  WfhStatus,
  WfhDurationType,
  WfhRequest,
} from '@hrms/database';

export function formatCorrectionReason(
  category: string,
  explanation: string,
  evidence?: any,
): string {
  return JSON.stringify({
    category: category || 'MISSING_CHECKOUT',
    explanation: (explanation || '').trim(),
    evidence: evidence || null,
  });
}

export function parseCorrectionReason(rawReason: string) {
  if (typeof rawReason === 'string' && rawReason.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawReason);
      return {
        reasonCategory: parsed.category || 'OTHER',
        explanation: parsed.explanation || rawReason,
        evidenceMetadata: parsed.evidence || null,
      };
    } catch {
      // fallback
    }
  }
  return {
    reasonCategory: 'OTHER',
    explanation: rawReason || '',
    evidenceMetadata: null,
  };
}

export function enrichCorrectionRequest(req: any) {
  if (!req) return req;
  const parsed = parseCorrectionReason(req.reason);
  return {
    ...req,
    reasonCategory: parsed.reasonCategory,
    explanation: parsed.explanation,
    evidenceMetadata: parsed.evidenceMetadata,
  };
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly policiesService: AttendancePoliciesService,
    private readonly hierarchyService: HierarchyService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Idempotent Attendance Exception Recorder
   * Automatically sanitizes credentials, tokens, and precise GPS coordinates.
   * Dispatches internal in-app notifications and records audit events.
   */
  async recordAttendanceException(params: {
    organizationId: string;
    employeeId: string;
    date: Date;
    exceptionType: AttendanceExceptionType;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH';
    details: Record<string, any>;
    idempotencyKey?: string;
    actorUserId?: string;
    notify?: boolean;
  }) {
    const dateOnly = params.date.toISOString().split('T')[0];
    const dateUtc = new Date(`${dateOnly}T00:00:00.000Z`);
    const idempotencyKey =
      params.idempotencyKey || `ex:${params.exceptionType}:${params.employeeId}:${dateOnly}`;

    try {
      // 1. Idempotency Check
      const existing = await this.prisma.attendanceException.findUnique({
        where: { idempotencyKey },
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

      if (existing) {
        return existing;
      }

      // 2. Redact sensitive coordinates & credentials
      const sanitizedDetails: Record<string, any> = { ...params.details };
      delete sanitizedDetails.password;
      delete sanitizedDetails.token;
      delete sanitizedDetails.accessToken;
      delete sanitizedDetails.latitude;
      delete sanitizedDetails.longitude;

      const created = await this.prisma.attendanceException.create({
        data: {
          organizationId: params.organizationId,
          employeeId: params.employeeId,
          date: dateUtc,
          exceptionType: params.exceptionType,
          severity: params.severity || 'MEDIUM',
          details: sanitizedDetails,
          status: 'OPEN',
          resolved: false,
          idempotencyKey,
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

      // 3. Dispatch internal in-app notification without paid services
      const emp = (created as any)?.employee;
      const empName = emp ? `${emp.firstName} ${emp.lastName}` : 'Employee';
      const empCode = emp?.employeeCode ? ` (${emp.employeeCode})` : '';

      if (params.notify !== false && this.notificationsService) {
        await this.notificationsService
          .createNotification({
            organizationId: params.organizationId,
            title: `Attendance Exception: ${params.exceptionType.replace(/_/g, ' ')}`,
            message: `${empName}${empCode} flagged for ${params.exceptionType.replace(/_/g, ' ').toLowerCase()} on ${dateOnly}.`,
            type: 'EXCEPTION_ALERT',
            metadata: {
              exceptionId: created.id,
              employeeId: params.employeeId,
              exceptionType: params.exceptionType,
            },
          })
          .catch((err) =>
            this.logger.warn(`Failed to dispatch in-app notification: ${err.message}`),
          );
      }

      // 4. Audit Log (without credentials or raw coordinates)
      await this.auditService
        .record({
          organizationId: params.organizationId,
          userId: params.actorUserId || 'SYSTEM',
          action: 'ATTENDANCE_EXCEPTION_FLAGGED',
          entity: 'AttendanceException',
          entityId: created.id,
          metadata: {
            employeeId: params.employeeId,
            exceptionType: params.exceptionType,
            severity: params.severity || 'MEDIUM',
            idempotencyKey,
          },
        })
        .catch((err) => this.logger.warn(`Failed to record audit log: ${err.message}`));

      return created;
    } catch (err: any) {
      if (err.code === 'P2002') {
        const found = await this.prisma.attendanceException.findUnique({
          where: { idempotencyKey },
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });
        if (found) return found;
      }
      this.logger.warn(`Exception recording error: ${err.message}`);
      return null;
    }
  }

  // ===========================================================================
  // 1. OFFICE CHECK-IN
  // ===========================================================================

  /**
   * Authoritative Office Check-In Handler
   */
  async checkIn(user: AuthenticatedUser, dto: CheckInDto, clientIp?: string, userAgent?: string) {
    const now = new Date();

    // 1. Idempotency Check
    const existingEvent = await this.prisma.attendanceEvent.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: {
        session: true,
        branch: true,
        officeLocation: true,
      },
    });

    if (existingEvent) {
      if (existingEvent.organizationId !== user.organizationId) {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'Idempotency key belongs to another organization.',
          code: 'IDEMPOTENCY_ORG_MISMATCH',
        });
      }

      const summary = await this.prisma.attendanceDailySummary.findFirst({
        where: {
          organizationId: user.organizationId,
          employeeId: existingEvent.employeeId,
          date: existingEvent.session?.date,
        },
      });

      return {
        success: true,
        message: 'Attendance check-in already processed (idempotent replay).',
        data: {
          session: existingEvent.session,
          event: existingEvent,
          summary,
          isIdempotentReplay: true,
        },
      };
    }

    // 2. Resolve requested attendance mode
    const mode = (
      dto.attendanceMode ||
      (dto.officialVisitId ? 'OFFICIAL_VISIT' : dto.wfhRequestId ? 'WFH' : 'OFFICE')
    ).toUpperCase();
    if (mode !== 'OFFICE' && mode !== 'OFFICIAL_VISIT' && mode !== 'WFH') {
      throw new BadRequestException({
        statusCode: 400,
        message: `Attendance mode '${mode}' is not permitted. Only verified OFFICE, OFFICIAL_VISIT, and WFH punches are supported.`,
        code: 'UNAPPROVED_ATTENDANCE_MODE',
      });
    }

    // 3. Resolve current employee & employment
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
    if (!employee.isActive || !eligibleStatuses.includes(employee.status)) {
      throw new ForbiddenException({
        statusCode: 403,
        message: `Employment status '${employee.status}' is not eligible for attendance marking.`,
        code: 'EMPLOYMENT_INACTIVE',
      });
    }

    const branchId = employee.employment?.branchId || null;

    // 4. Resolve policy, shift & working day
    const initialResolution = await this.policiesService.resolveEffectivePolicyAndShift(
      employee.id,
      now,
      employee.organizationId,
    );

    const timezone = initialResolution.policy.timezone || 'Asia/Kolkata';
    const workingDayResult = resolveWorkingDay(
      now,
      initialResolution.policy.workingDayStartHour,
      timezone,
    );
    const workingDateStr = workingDayResult.workingDateStr;
    const workingDateUtc = new Date(`${workingDateStr}T00:00:00.000Z`);

    // 4b. Detect suspicious rapid punch attempts (< 45s ago)
    const recentPunch = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId: employee.id,
        eventTimestamp: { gte: new Date(now.getTime() - 45 * 1000) },
      },
      orderBy: { eventTimestamp: 'desc' },
    });
    if (recentPunch) {
      this.recordAttendanceException({
        organizationId: employee.organizationId,
        employeeId: employee.id,
        date: workingDateUtc,
        exceptionType: 'SUSPICIOUS_REPEATED_ATTEMPTS',
        severity: 'HIGH',
        details: {
          recentEventType: recentPunch.eventType,
          timeDeltaSeconds: Math.floor(
            (now.getTime() - recentPunch.eventTimestamp.getTime()) / 1000,
          ),
          action: 'CHECK_IN',
        },
        idempotencyKey: `ex:suspicious_attempts:${employee.id}:${workingDateStr}:${Math.floor(now.getTime() / 60000)}`,
      }).catch(() => null);
    }

    const resolved = await this.policiesService.resolveEffectivePolicyAndShift(
      employee.id,
      workingDateUtc,
      employee.organizationId,
    );

    const { policy, shift } = resolved;

    // 5. Mode-Specific Validations
    let office: any = null;
    let distanceMeters: number | null = null;
    let officialVisit: (OfficialVisit & { destinations: VisitDestination[] }) | null = null;
    let matchedDest: VisitDestination | null = null;
    let wfhRequest: WfhRequest | null = null;
    let isGpsException = false;
    let verificationOutcome = 'VERIFIED';

    if (mode === 'OFFICIAL_VISIT') {
      // 5A. OFFICIAL VISIT VALIDATION
      // Resolve Visit (never trust client-supplied status, distance, or employeeId)
      if (dto.officialVisitId) {
        officialVisit = await this.prisma.officialVisit.findFirst({
          where: {
            id: dto.officialVisitId,
            organizationId: user.organizationId,
          },
          include: { destinations: true },
        });

        if (!officialVisit) {
          throw new NotFoundException({
            statusCode: 404,
            message: 'Official visit request not found in organization.',
            code: 'VISIT_NOT_FOUND',
          });
        }
      } else {
        // Auto-resolve active approved/in-progress visit for current working day
        officialVisit = await this.prisma.officialVisit.findFirst({
          where: {
            organizationId: user.organizationId,
            employeeId: employee.id,
            status: { in: [VisitStatus.APPROVED, VisitStatus.IN_PROGRESS] },
            startDate: { lte: workingDateUtc },
            endDate: { gte: workingDateUtc },
          },
          include: { destinations: true },
          orderBy: { startDate: 'asc' },
        });

        if (!officialVisit) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'No approved official visit active for today found for your employee profile.',
            code: 'VISIT_NOT_FOUND',
          });
        }
      }

      // Check ownership
      if (officialVisit.employeeId !== employee.id) {
        throw new ForbiddenException({
          statusCode: 403,
          message: "You are not authorized to check in for another employee's official visit.",
          code: 'VISIT_NOT_OWNED',
        });
      }

      // Check visit status
      if (officialVisit.status === VisitStatus.CANCELLED) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Official visit has been cancelled.',
          code: 'VISIT_ALREADY_CANCELLED',
        });
      }
      if (officialVisit.status === VisitStatus.COMPLETED) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Official visit is already completed.',
          code: 'VISIT_ALREADY_COMPLETED',
        });
      }
      if (
        officialVisit.status !== VisitStatus.APPROVED &&
        officialVisit.status !== VisitStatus.IN_PROGRESS
      ) {
        throw new BadRequestException({
          statusCode: 400,
          message: `Official visit status is "${officialVisit.status}". Only APPROVED or IN_PROGRESS visits can be attended.`,
          code: 'INVALID_VISIT_STATUS',
        });
      }

      // Check date window
      if (
        workingDateUtc.getTime() < officialVisit.startDate.getTime() ||
        workingDateUtc.getTime() > officialVisit.endDate.getTime()
      ) {
        throw new BadRequestException({
          statusCode: 400,
          message: `Current date is outside the approved visit window (${officialVisit.startDate.toISOString().split('T')[0]} to ${officialVisit.endDate.toISOString().split('T')[0]}).`,
          code: 'VISIT_OUTSIDE_DATE_WINDOW',
        });
      }

      // Candidate destinations
      let candidateDests = officialVisit.destinations;
      if (dto.destinationId) {
        candidateDests = officialVisit.destinations.filter((d) => d.id === dto.destinationId);
        if (candidateDests.length === 0) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'Specified destination does not belong to this official visit.',
            code: 'INVALID_DESTINATION',
          });
        }
      }

      if (candidateDests.length === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Approved official visit has no registered destinations.',
          code: 'NO_DESTINATIONS',
        });
      }

      // Check coordinates & GPS policy
      const hasCoords =
        dto.latitude !== undefined &&
        dto.latitude !== null &&
        dto.longitude !== undefined &&
        dto.longitude !== null;

      if (!hasCoords) {
        const hasDocReason = dto.gpsExceptionReason && dto.gpsExceptionReason.trim().length >= 10;
        if (!hasDocReason) {
          throw new BadRequestException({
            statusCode: 400,
            message:
              'A documented explanation (minimum 10 characters) is required by policy for visits where GPS is unsuitable or exempt.',
            code: 'GPS_EXCEPTION_REQUIRED',
          });
        }
        isGpsException = true;
        matchedDest = candidateDests[0];
        verificationOutcome = 'GPS_EXCEPTION_DOCUMENTED';
      } else {
        const coordCheck = validateCoordinates(dto.latitude, dto.longitude);
        if (!coordCheck.valid) {
          throw new BadRequestException({
            statusCode: 400,
            message: coordCheck.error || 'Invalid GPS coordinates provided.',
            code: 'INVALID_COORDINATES',
          });
        }

        if (dto.timestamp !== undefined && dto.timestamp !== null) {
          const freshness = validateTimestampFreshness(dto.timestamp, 300, now);
          if (!freshness.valid) {
            throw new BadRequestException({
              statusCode: 400,
              message:
                freshness.error ||
                `Stale or skewed GPS timestamp (${Math.round(freshness.skewSeconds || 0)}s skew).`,
              code: 'STALE_LOCATION',
            });
          }
        }

        const maxFieldAccuracy = Math.max(150, policy.maxGpsAccuracyMeters || 100);
        if (dto.accuracyMeters !== undefined && dto.accuracyMeters !== null) {
          const accuracyCheck = validateGpsAccuracy(dto.accuracyMeters, maxFieldAccuracy);
          if (!accuracyCheck.valid) {
            throw new BadRequestException({
              statusCode: 400,
              message:
                accuracyCheck.error ||
                `GPS accuracy (${dto.accuracyMeters}m) exceeds acceptable threshold (${maxFieldAccuracy}m).`,
              code: 'LOW_GPS_ACCURACY',
            });
          }
        }

        // Distance calculation against candidate destination(s)
        let minDistance = Infinity;
        for (const dest of candidateDests) {
          if (dest.latitude !== null && dest.longitude !== null) {
            const dist = haversineDistance(
              dto.latitude!,
              dto.longitude!,
              dest.latitude,
              dest.longitude,
            );
            if (dist < minDistance) {
              minDistance = dist;
              matchedDest = dest;
            }
          }
        }

        if (!matchedDest) {
          // Dest has no coordinates configured
          const hasDocReason = dto.gpsExceptionReason && dto.gpsExceptionReason.trim().length >= 10;
          if (!hasDocReason) {
            throw new BadRequestException({
              statusCode: 400,
              message:
                'No geographic coordinates are configured for this visit destination. Documented exception required (min 10 characters).',
              code: 'GPS_EXCEPTION_REQUIRED',
            });
          }
          isGpsException = true;
          matchedDest = candidateDests[0];
          verificationOutcome = 'GPS_EXCEPTION_DOCUMENTED';
        } else {
          distanceMeters = minDistance;
          const isInside = minDistance <= matchedDest.radiusMeters;
          if (isInside) {
            verificationOutcome = 'VERIFIED';
          } else {
            const hasDocReason =
              dto.gpsExceptionReason && dto.gpsExceptionReason.trim().length >= 10;
            if ((!matchedDest.isGeofenceRequired || hasDocReason) && hasDocReason) {
              isGpsException = true;
              verificationOutcome = 'GPS_EXCEPTION_DOCUMENTED';
            } else {
              throw new BadRequestException({
                statusCode: 400,
                message: `Outside approved visit destination area. You are ${Math.round(minDistance)}m from ${matchedDest.destinationName} (allowed radius: ${matchedDest.radiusMeters}m).`,
                code: 'OUTSIDE_APPROVED_AREA',
                distanceMeters: Math.round(minDistance),
                allowedRadiusMeters: matchedDest.radiusMeters,
              });
            }
          }
        }
      }
    } else if (mode === 'WFH') {
      // 5B. WFH ATTENDANCE VALIDATION
      // Resolve WFH request (never trust client-supplied status or employeeId)
      if (dto.wfhRequestId) {
        wfhRequest = await this.prisma.wfhRequest.findFirst({
          where: {
            id: dto.wfhRequestId,
            organizationId: user.organizationId,
          },
        });

        if (!wfhRequest) {
          throw new NotFoundException({
            statusCode: 404,
            message: 'WFH request not found in organization.',
            code: 'WFH_REQUEST_NOT_FOUND',
          });
        }
      } else {
        // Auto-resolve active approved WFH request for current working day
        wfhRequest = await this.prisma.wfhRequest.findFirst({
          where: {
            organizationId: user.organizationId,
            employeeId: employee.id,
            status: WfhStatus.APPROVED,
            startDate: { lte: workingDateUtc },
            endDate: { gte: workingDateUtc },
          },
          orderBy: { startDate: 'asc' },
        });

        if (!wfhRequest) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'No approved WFH request active for today found for your employee profile.',
            code: 'WFH_REQUEST_NOT_FOUND',
          });
        }
      }

      // Check ownership
      if (wfhRequest.employeeId !== employee.id) {
        throw new ForbiddenException({
          statusCode: 403,
          message: "You are not authorized to check in for another employee's WFH request.",
          code: 'WFH_NOT_OWNED',
        });
      }

      // Check request status
      if (wfhRequest.status === WfhStatus.CANCELLED) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'WFH request has been cancelled.',
          code: 'WFH_ALREADY_CANCELLED',
        });
      }
      if (wfhRequest.status !== WfhStatus.APPROVED) {
        throw new BadRequestException({
          statusCode: 400,
          message: `WFH request status is "${wfhRequest.status}". Only APPROVED requests permit remote check-in.`,
          code: 'WFH_NOT_APPROVED',
        });
      }

      // Check date window
      if (
        workingDateUtc.getTime() < wfhRequest.startDate.getTime() ||
        workingDateUtc.getTime() > wfhRequest.endDate.getTime()
      ) {
        throw new BadRequestException({
          statusCode: 400,
          message: `Current date is outside the approved WFH window (${wfhRequest.startDate.toISOString().split('T')[0]} to ${wfhRequest.endDate.toISOString().split('T')[0]}).`,
          code: 'WFH_OUTSIDE_DATE_WINDOW',
        });
      }

      // Check day portion / allowed time window against shift
      if (
        wfhRequest.durationType === WfhDurationType.FIRST_HALF ||
        wfhRequest.durationType === WfhDurationType.SECOND_HALF
      ) {
        const nowParts = getTimezoneParts(now, timezone);
        const [wY, wM, wD] = workingDateStr.split('-').map(Number);
        const dayOffset = nowParts.day - wD;
        const nowMinutes =
          nowParts.hour * 60 + nowParts.minute + (dayOffset > 0 ? dayOffset * 24 * 60 : 0);

        let startMinutes = 9 * 60;
        let endMinutes = 18 * 60;
        if (shift) {
          const [sH, sM] = shift.startTime.split(':').map(Number);
          const [eH, eM] = shift.endTime.split(':').map(Number);
          startMinutes = sH * 60 + sM;
          const isOvernight = shift.isOvernight || eH < sH || (eH === sH && eM < sM);
          endMinutes = eH * 60 + eM + (isOvernight ? 24 * 60 : 0);
        }
        const shiftMidpointMinutes = startMinutes + Math.floor((endMinutes - startMinutes) / 2);
        const midH = Math.floor((shiftMidpointMinutes % (24 * 60)) / 60);
        const midM = shiftMidpointMinutes % 60;
        const midpointFormatted = `${String(midH).padStart(2, '0')}:${String(midM).padStart(2, '0')}`;
        const currentFormatted = `${String(nowParts.hour).padStart(2, '0')}:${String(nowParts.minute).padStart(2, '0')}`;

        if (
          wfhRequest.durationType === WfhDurationType.FIRST_HALF &&
          nowMinutes > shiftMidpointMinutes
        ) {
          throw new BadRequestException({
            statusCode: 400,
            message: `Approved WFH request is for FIRST_HALF only. Current check-in time (${currentFormatted}) is past the shift midpoint (${midpointFormatted}).`,
            code: 'WFH_HALF_DAY_MISMATCH',
          });
        }

        if (
          wfhRequest.durationType === WfhDurationType.SECOND_HALF &&
          nowMinutes < shiftMidpointMinutes
        ) {
          throw new BadRequestException({
            statusCode: 400,
            message: `Approved WFH request is for SECOND_HALF only. Current check-in time (${currentFormatted}) is before the shift midpoint (${midpointFormatted}).`,
            code: 'WFH_HALF_DAY_MISMATCH',
          });
        }
      }

      // Home GPS privacy: Do NOT collect home GPS by default.
      if (
        dto.latitude !== undefined &&
        dto.longitude !== undefined &&
        dto.latitude !== null &&
        dto.longitude !== null
      ) {
        const coordCheck = validateCoordinates(dto.latitude, dto.longitude);
        if (!coordCheck.valid) {
          throw new BadRequestException({
            statusCode: 400,
            message: coordCheck.error || 'Invalid GPS coordinates provided.',
            code: 'INVALID_COORDINATES',
          });
        }
      }

      // WFH punches are exempt from office geofencing
      isGpsException = true;
      verificationOutcome = 'WFH_VERIFIED';
    } else {
      // 5C. OFFICE CHECK-IN VALIDATION
      if (
        dto.latitude === undefined ||
        dto.latitude === null ||
        dto.longitude === undefined ||
        dto.longitude === null
      ) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'GPS coordinates are required for office check-in.',
          code: 'INVALID_COORDINATES',
        });
      }

      const coordCheck = validateCoordinates(dto.latitude, dto.longitude);
      if (!coordCheck.valid) {
        throw new BadRequestException({
          statusCode: 400,
          message: coordCheck.error || 'Invalid GPS coordinates provided.',
          code: 'INVALID_COORDINATES',
        });
      }

      if (dto.timestamp !== undefined && dto.timestamp !== null) {
        const freshness = validateTimestampFreshness(dto.timestamp, 120, now);
        if (!freshness.valid) {
          throw new BadRequestException({
            statusCode: 400,
            message:
              freshness.error ||
              `Stale or skewed GPS timestamp (${Math.round(freshness.skewSeconds || 0)}s skew). Please synchronize device clock.`,
            code: 'STALE_LOCATION',
            skewSeconds: freshness.skewSeconds,
          });
        }
      }

      const maxAccuracyMeters = policy.maxGpsAccuracyMeters || 100;
      if (dto.accuracyMeters !== undefined && dto.accuracyMeters !== null) {
        const accuracyCheck = validateGpsAccuracy(dto.accuracyMeters, maxAccuracyMeters);
        if (!accuracyCheck.valid) {
          this.recordAttendanceException({
            organizationId: employee.organizationId,
            employeeId: employee.id,
            date: workingDateUtc,
            exceptionType: 'LOW_GPS_ACCURACY',
            severity: 'HIGH',
            details: {
              reportedAccuracy: dto.accuracyMeters,
              maxAllowedAccuracy: maxAccuracyMeters,
              action: 'CHECK_IN',
            },
            idempotencyKey: `ex:low_accuracy:${employee.id}:${workingDateStr}:CHECK_IN`,
          }).catch(() => null);

          throw new BadRequestException({
            statusCode: 400,
            message:
              accuracyCheck.error ||
              `GPS accuracy (${dto.accuracyMeters}m) exceeds maximum allowable threshold (${maxAccuracyMeters}m). Please ensure clear sky visibility.`,
            code: 'LOW_GPS_ACCURACY',
            reportedAccuracy: dto.accuracyMeters,
            maxAllowedAccuracy: maxAccuracyMeters,
          });
        }
      }

      if (dto.officeLocationId) {
        office = await this.prisma.officeLocation.findFirst({
          where: {
            id: dto.officeLocationId,
            organizationId: employee.organizationId,
            isActive: true,
          },
        });
        if (!office) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'Specified office location does not exist or is inactive.',
            code: 'INVALID_OFFICE_LOCATION',
          });
        }
        if (branchId && office.branchId && office.branchId !== branchId) {
          throw new ForbiddenException({
            statusCode: 403,
            message: 'You are not assigned to this office branch location.',
            code: 'BRANCH_MISMATCH',
          });
        }
      } else {
        office = await this.resolveOfficeForEmployee(employee.organizationId, branchId);
      }

      if (!office) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'No active office location configured for your branch or organization.',
          code: 'UNASSIGNED_OFFICE',
        });
      }

      distanceMeters = haversineDistance(
        dto.latitude,
        dto.longitude,
        office.latitude,
        office.longitude,
      );
      const isWithinGeofence = distanceMeters <= office.geofenceRadiusMeters;

      if (policy.geofenceEnforcement && !isWithinGeofence) {
        await this.recordAttendanceException({
          organizationId: employee.organizationId,
          employeeId: employee.id,
          date: workingDateUtc,
          exceptionType: 'OUTSIDE_GEOFENCE',
          severity: 'HIGH',
          details: {
            distanceMeters: Math.round(distanceMeters),
            allowedRadiusMeters: office.geofenceRadiusMeters,
            officeName: office.name,
            action: 'CHECK_IN',
          },
          idempotencyKey: `ex:outside_geofence:${employee.id}:${workingDateStr}:CHECK_IN`,
        });

        throw new BadRequestException({
          statusCode: 400,
          message: `Outside office geofence. You are ${Math.round(distanceMeters)}m from ${office.name} (allowed perimeter: ${office.geofenceRadiusMeters}m).`,
          code: 'OUTSIDE_GEOFENCE',
          distanceMeters: Math.round(distanceMeters),
          allowedRadiusMeters: office.geofenceRadiusMeters,
          officeName: office.name,
        });
      }
    }

    // 6. Atomic Transaction: Concurrency protection & creation
    try {
      const { session, event, summary } = await this.prisma.$transaction(async (tx) => {
        // A. Prevent overlapping / duplicate open sessions
        const openSession = await tx.attendanceSession.findFirst({
          where: {
            employeeId: employee.id,
            status: 'OPEN',
          },
        });

        if (openSession) {
          this.recordAttendanceException({
            organizationId: employee.organizationId,
            employeeId: employee.id,
            date: workingDateUtc,
            exceptionType: 'INVALID_STATE',
            severity: 'MEDIUM',
            details: {
              attemptedAction: 'CHECK_IN',
              conflict: 'SESSION_ALREADY_OPEN',
              activeSessionId: openSession.id,
            },
            idempotencyKey: `ex:invalid_state:${employee.id}:${workingDateStr}:CHECK_IN_ALREADY_OPEN`,
          }).catch(() => null);

          throw new ConflictException({
            statusCode: 409,
            message:
              'An attendance session is already active. You must check out before checking in again.',
            code: 'SESSION_ALREADY_OPEN',
            activeSessionId: openSession.id,
            checkInTime: openSession.checkInTime,
          });
        }

        // B. Check policy multiple sessions restriction
        if (!policy.allowMultipleSessions) {
          const existingSession = await tx.attendanceSession.findFirst({
            where: {
              employeeId: employee.id,
              date: workingDateUtc,
            },
          });
          if (existingSession) {
            throw new ConflictException({
              statusCode: 409,
              message:
                'Multiple sessions on the same working day are not permitted by attendance policy.',
              code: 'MULTIPLE_SESSIONS_NOT_ALLOWED',
            });
          }
        }

        // C. Session number assignment
        const sessionCount = await tx.attendanceSession.count({
          where: {
            employeeId: employee.id,
            date: workingDateUtc,
          },
        });

        // D. Create AttendanceSession
        const newSession = await tx.attendanceSession.create({
          data: {
            organizationId: employee.organizationId,
            employeeId: employee.id,
            date: workingDateUtc,
            sessionNumber: sessionCount + 1,
            checkInTime: now,
            status: 'OPEN',
            attendanceMode: mode as AttendanceMode,
            officialVisitId: officialVisit ? officialVisit.id : null,
            wfhRequestId: wfhRequest ? wfhRequest.id : null,
            totalWorkMinutes: 0,
            totalBreakMinutes: 0,
          },
        });

        // E. Create immutable AttendanceEvent
        const newEvent = await tx.attendanceEvent.create({
          data: {
            organizationId: employee.organizationId,
            employeeId: employee.id,
            sessionId: newSession.id,
            eventType: 'CHECK_IN',
            eventTimestamp: now,
            attendanceMode: mode as AttendanceMode,
            latitude: dto.latitude ?? null,
            longitude: dto.longitude ?? null,
            accuracyMeters: dto.accuracyMeters ?? null,
            branchId: office?.branchId || branchId,
            officeLocationId: office?.id ?? null,
            distanceFromOfficeMeters:
              distanceMeters !== null && distanceMeters !== Infinity ? distanceMeters : null,
            geofenceStatus: mode === 'WFH' ? 'EXEMPT' : isGpsException ? 'EXEMPT' : 'VERIFIED',
            idempotencyKey: dto.idempotencyKey,
            deviceInfo: dto.deviceInfo ?? null,
            ipAddress: clientIp ?? null,
            actorUserId: user.id,
            officialVisitId: officialVisit ? officialVisit.id : null,
            wfhRequestId: wfhRequest ? wfhRequest.id : null,
            metadata: {
              policyId: policy.id,
              shiftId: shift?.id ?? null,
              officeName: office?.name ?? null,
              workingDate: workingDateStr,
              officialVisitTitle: officialVisit?.title ?? null,
              destinationName: matchedDest?.destinationName ?? null,
              isException: isGpsException,
              isWfh: mode === 'WFH',
              wfhRequestId: wfhRequest?.id ?? null,
              wfhDurationType: wfhRequest?.durationType ?? null,
              wfhReason: wfhRequest?.reason ?? null,
            },
          },
        });

        // F. Official Visit: record location verification & transition status
        if (officialVisit) {
          await tx.visitLocationVerification.create({
            data: {
              organizationId: employee.organizationId,
              visitId: officialVisit.id,
              employeeId: employee.id,
              destinationId: matchedDest?.id ?? null,
              outcome: verificationOutcome,
              isVerified: true,
              isException: isGpsException,
              exceptionReason: isGpsException ? dto.gpsExceptionReason?.trim() : null,
              latitude: dto.latitude ?? null,
              longitude: dto.longitude ?? null,
              accuracyMeters: dto.accuracyMeters ?? null,
              distanceMeters:
                distanceMeters !== null && distanceMeters !== Infinity ? distanceMeters : null,
              allowedRadiusMeters: matchedDest?.radiusMeters ?? null,
              deviceInfo: dto.deviceInfo ?? null,
            },
          });

          if (officialVisit.status === VisitStatus.APPROVED) {
            await tx.officialVisit.update({
              where: { id: officialVisit.id },
              data: { status: VisitStatus.IN_PROGRESS },
            });
          }
        }

        // G. Evaluate status (check if late)
        let dayStatus: AttendanceDayStatus = 'PRESENT';
        let lateMinutes = 0;
        if (shift) {
          const shiftWindow = calculateShiftWindow(
            shift,
            workingDateStr,
            policy.gracePeriodMinutes || 0,
            timezone,
          );
          if (now > shiftWindow.graceEndDate) {
            dayStatus = 'LATE';
            lateMinutes = Math.max(
              0,
              Math.floor((now.getTime() - shiftWindow.shiftStartDate.getTime()) / 60000),
            );
            this.recordAttendanceException({
              organizationId: employee.organizationId,
              employeeId: employee.id,
              date: workingDateUtc,
              exceptionType: 'LATE_ARRIVAL',
              severity: lateMinutes > 60 ? 'MEDIUM' : 'LOW',
              details: {
                lateMinutes,
                shiftStartTime: shift.startTime,
                firstCheckIn: now.toISOString(),
                gracePeriodMinutes: policy.gracePeriodMinutes || 0,
              },
              idempotencyKey: `ex:late_arrival:${employee.id}:${workingDateStr}`,
            }).catch(() => null);
          }
        }

        const persistedPolicyId =
          policy?.id && !policy.id.startsWith('synthetic') ? policy.id : null;
        const persistedShiftId = shift?.id && !shift.id.startsWith('synthetic') ? shift.id : null;

        // H. Upsert Daily Summary
        const dailySummary = await tx.attendanceDailySummary.upsert({
          where: {
            organizationId_employeeId_date: {
              organizationId: employee.organizationId,
              employeeId: employee.id,
              date: workingDateUtc,
            },
          },
          create: {
            organizationId: employee.organizationId,
            employeeId: employee.id,
            date: workingDateUtc,
            firstCheckIn: now,
            status: dayStatus,
            lateMinutes,
            shiftId: persistedShiftId,
            policyId: persistedPolicyId,
            primaryAttendanceMode: mode as AttendanceMode,
            officialVisitId: officialVisit ? officialVisit.id : null,
            wfhRequestId: wfhRequest ? wfhRequest.id : null,
          },
          update: {
            status: dayStatus,
            shiftId: persistedShiftId,
            policyId: persistedPolicyId,
            primaryAttendanceMode: mode as AttendanceMode,
            officialVisitId: officialVisit ? officialVisit.id : null,
            wfhRequestId: wfhRequest ? wfhRequest.id : null,
            ...(sessionCount === 0 ? { firstCheckIn: now, lateMinutes } : {}),
          },
        });

        return { session: newSession, event: newEvent, summary: dailySummary };
      });

      // 7. Audit Record
      await this.auditService.record({
        organizationId: employee.organizationId,
        userId: user.id,
        action: 'ATTENDANCE_CHECK_IN',
        entity: 'AttendanceSession',
        entityId: session.id,
        ipAddress: clientIp,
        userAgent,
        metadata: {
          employeeId: employee.id,
          workingDate: workingDateStr,
          sessionId: session.id,
          eventId: event.id,
          mode,
          officeId: office?.id ?? null,
          officeName: office?.name ?? null,
          officialVisitId: officialVisit?.id ?? null,
          destinationId: matchedDest?.id ?? null,
          wfhRequestId: wfhRequest?.id ?? null,
          distanceMeters:
            distanceMeters !== null && distanceMeters !== Infinity
              ? Math.round(distanceMeters)
              : null,
          status: summary.status,
          lateMinutes: summary.lateMinutes,
          isException: isGpsException,
        },
      });

      // 8. Safe structured response
      const successMessage =
        mode === 'OFFICIAL_VISIT'
          ? 'Official visit check-in verified and recorded successfully.'
          : mode === 'WFH'
            ? 'WFH check-in verified and recorded successfully.'
            : 'Office check-in verified and recorded successfully.';

      return {
        success: true,
        message: successMessage,
        data: {
          session,
          event,
          summary,
          policy,
          shift,
          office: office
            ? {
                id: office.id,
                name: office.name,
                distanceMeters: distanceMeters !== null ? Math.round(distanceMeters) : null,
                allowedRadiusMeters: office.geofenceRadiusMeters,
              }
            : null,
          officialVisit: officialVisit
            ? {
                id: officialVisit.id,
                title: officialVisit.title,
                status: VisitStatus.IN_PROGRESS,
                matchedDestination: matchedDest
                  ? {
                      id: matchedDest.id,
                      name: matchedDest.destinationName,
                      distanceMeters: distanceMeters !== null ? Math.round(distanceMeters) : null,
                      allowedRadiusMeters: matchedDest.radiusMeters,
                    }
                  : null,
                isException: isGpsException,
              }
            : null,
        },
      };
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Concurrent check-in submission detected or idempotency key collision.',
          code: 'CONCURRENT_CHECK_IN_CONFLICT',
        });
      }
      throw err;
    }
  }

  // ===========================================================================
  // 2. BREAK MANAGEMENT (START & END)
  // ===========================================================================

  /**
   * Start Session Break
   */
  async startBreak(user: AuthenticatedUser, dto: BreakDto, clientIp?: string, userAgent?: string) {
    const serverNow = new Date();

    // Idempotency check
    const existingEvent = await this.prisma.attendanceEvent.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { session: true },
    });

    if (existingEvent) {
      return {
        success: true,
        message: 'Break start already processed (idempotent replay).',
        data: {
          event: existingEvent,
          session: existingEvent.session,
          isOnBreak: true,
          isIdempotentReplay: true,
        },
      };
    }

    const employee = await this.resolveActiveEmployee(user.id, user.organizationId);

    const { event, activeSession } = await this.prisma.$transaction(async (tx) => {
      const activeSession = await tx.attendanceSession.findFirst({
        where: { employeeId: employee.id, status: 'OPEN' },
        include: { events: { orderBy: { eventTimestamp: 'asc' } } },
      });

      if (!activeSession) {
        this.recordAttendanceException({
          organizationId: employee.organizationId,
          employeeId: employee.id,
          date: serverNow,
          exceptionType: 'INVALID_STATE',
          severity: 'MEDIUM',
          details: {
            attemptedAction: 'BREAK_START',
            conflict: 'NO_ACTIVE_SESSION',
          },
          idempotencyKey: `ex:invalid_state:${employee.id}:${serverNow.toISOString().split('T')[0]}:BREAK_START_NO_SESSION`,
        }).catch(() => null);

        throw new BadRequestException({
          statusCode: 400,
          message: 'No active attendance session found. You must check in before taking a break.',
          code: 'NO_ACTIVE_SESSION',
        });
      }

      // Check current break status
      let isOnBreak = false;
      for (const ev of activeSession.events) {
        if (ev.eventType === 'BREAK_START') isOnBreak = true;
        else if (ev.eventType === 'BREAK_END') isOnBreak = false;
      }

      if (isOnBreak) {
        this.recordAttendanceException({
          organizationId: employee.organizationId,
          employeeId: employee.id,
          date: serverNow,
          exceptionType: 'INVALID_STATE',
          severity: 'MEDIUM',
          details: {
            attemptedAction: 'BREAK_START',
            conflict: 'BREAK_ALREADY_ACTIVE',
          },
          idempotencyKey: `ex:invalid_state:${employee.id}:${serverNow.toISOString().split('T')[0]}:BREAK_ALREADY_ACTIVE`,
        }).catch(() => null);

        throw new BadRequestException({
          statusCode: 400,
          message:
            'A break is already active. You must conclude the current break before starting another.',
          code: 'BREAK_ALREADY_ACTIVE',
        });
      }

      const newEvent = await tx.attendanceEvent.create({
        data: {
          organizationId: employee.organizationId,
          employeeId: employee.id,
          sessionId: activeSession.id,
          eventType: 'BREAK_START',
          eventTimestamp: serverNow,
          attendanceMode: activeSession.attendanceMode || 'OFFICE',
          officialVisitId: activeSession.officialVisitId ?? null,
          wfhRequestId: activeSession.wfhRequestId ?? null,
          idempotencyKey: dto.idempotencyKey,
          deviceInfo: dto.deviceInfo ?? null,
          ipAddress: clientIp ?? null,
          actorUserId: user.id,
          metadata: { reason: dto.reason ?? 'Break initiated' },
        },
      });

      return { event: newEvent, activeSession };
    });

    await this.auditService.record({
      organizationId: employee.organizationId,
      userId: user.id,
      action: 'ATTENDANCE_BREAK_START',
      entity: 'AttendanceSession',
      entityId: activeSession.id,
      ipAddress: clientIp,
      userAgent,
      metadata: {
        employeeId: employee.id,
        sessionId: activeSession.id,
        eventId: event.id,
        wfhRequestId: activeSession.wfhRequestId ?? null,
        reason: dto.reason,
      },
    });

    return {
      success: true,
      message: 'Break started successfully.',
      data: {
        event,
        session: activeSession,
        isOnBreak: true,
      },
    };
  }

  /**
   * Conclude Session Break
   */
  async endBreak(user: AuthenticatedUser, dto: BreakDto, clientIp?: string, userAgent?: string) {
    const serverNow = new Date();

    // Idempotency check
    const existingEvent = await this.prisma.attendanceEvent.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { session: true },
    });

    if (existingEvent) {
      return {
        success: true,
        message: 'Break conclusion already processed (idempotent replay).',
        data: {
          event: existingEvent,
          session: existingEvent.session,
          isOnBreak: false,
          isIdempotentReplay: true,
        },
      };
    }

    const employee = await this.resolveActiveEmployee(user.id, user.organizationId);

    const { event, activeSession, totalBreakMinutes } = await this.prisma.$transaction(
      async (tx) => {
        const activeSession = await tx.attendanceSession.findFirst({
          where: { employeeId: employee.id, status: 'OPEN' },
          include: { events: { orderBy: { eventTimestamp: 'asc' } } },
        });

        if (!activeSession) {
          this.recordAttendanceException({
            organizationId: employee.organizationId,
            employeeId: employee.id,
            date: serverNow,
            exceptionType: 'INVALID_STATE',
            severity: 'MEDIUM',
            details: {
              attemptedAction: 'BREAK_END',
              conflict: 'NO_ACTIVE_SESSION',
            },
            idempotencyKey: `ex:invalid_state:${employee.id}:${serverNow.toISOString().split('T')[0]}:BREAK_END_NO_SESSION`,
          }).catch(() => null);

          throw new BadRequestException({
            statusCode: 400,
            message: 'No active attendance session found to end break.',
            code: 'NO_ACTIVE_SESSION',
          });
        }

        // Verify if currently on break
        let isOnBreak = false;
        for (const ev of activeSession.events) {
          if (ev.eventType === 'BREAK_START') isOnBreak = true;
          else if (ev.eventType === 'BREAK_END') isOnBreak = false;
        }

        if (!isOnBreak) {
          this.recordAttendanceException({
            organizationId: employee.organizationId,
            employeeId: employee.id,
            date: serverNow,
            exceptionType: 'INVALID_STATE',
            severity: 'MEDIUM',
            details: {
              attemptedAction: 'BREAK_END',
              conflict: 'NO_ACTIVE_BREAK',
            },
            idempotencyKey: `ex:invalid_state:${employee.id}:${serverNow.toISOString().split('T')[0]}:NO_ACTIVE_BREAK`,
          }).catch(() => null);

          throw new BadRequestException({
            statusCode: 400,
            message: 'No active break found to conclude.',
            code: 'NO_ACTIVE_BREAK',
          });
        }

        const newEvent = await tx.attendanceEvent.create({
          data: {
            organizationId: employee.organizationId,
            employeeId: employee.id,
            sessionId: activeSession.id,
            eventType: 'BREAK_END',
            eventTimestamp: serverNow,
            attendanceMode: activeSession.attendanceMode || 'OFFICE',
            officialVisitId: activeSession.officialVisitId ?? null,
            wfhRequestId: activeSession.wfhRequestId ?? null,
            idempotencyKey: dto.idempotencyKey,
            deviceInfo: dto.deviceInfo ?? null,
            ipAddress: clientIp ?? null,
            actorUserId: user.id,
            metadata: { reason: dto.reason ?? 'Break concluded' },
          },
        });

        // Recalculate session break duration
        const allEvents = [...activeSession.events, newEvent];
        let totalBreakMinutes = 0;
        let currentStart: Date | null = null;
        for (const ev of allEvents) {
          if (ev.eventType === 'BREAK_START') {
            currentStart = ev.eventTimestamp;
          } else if (ev.eventType === 'BREAK_END' && currentStart) {
            const dur = Math.max(
              0,
              Math.floor((ev.eventTimestamp.getTime() - currentStart.getTime()) / 60000),
            );
            totalBreakMinutes += dur;
            currentStart = null;
          }
        }

        await tx.attendanceSession.update({
          where: { id: activeSession.id },
          data: { totalBreakMinutes },
        });

        return { event: newEvent, activeSession, totalBreakMinutes };
      },
    );

    await this.auditService.record({
      organizationId: employee.organizationId,
      userId: user.id,
      action: 'ATTENDANCE_BREAK_END',
      entity: 'AttendanceSession',
      entityId: activeSession.id,
      ipAddress: clientIp,
      userAgent,
      metadata: {
        employeeId: employee.id,
        sessionId: activeSession.id,
        eventId: event.id,
        wfhRequestId: activeSession.wfhRequestId ?? null,
        totalBreakMinutes,
      },
    });

    return {
      success: true,
      message: 'Break concluded successfully.',
      data: {
        event,
        session: activeSession,
        totalBreakMinutes,
        isOnBreak: false,
      },
    };
  }

  // ===========================================================================
  // 3. OFFICE CHECK-OUT
  // ===========================================================================

  /**
   * Authoritative Office Check-Out Handler
   */
  async checkOut(user: AuthenticatedUser, dto: CheckOutDto, clientIp?: string, userAgent?: string) {
    const serverNow = new Date();

    // 1. Idempotency Check
    const existingEvent = await this.prisma.attendanceEvent.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { session: true },
    });

    if (existingEvent) {
      const summary = await this.prisma.attendanceDailySummary.findFirst({
        where: {
          organizationId: user.organizationId,
          employeeId: existingEvent.employeeId,
          date: existingEvent.session?.date,
        },
      });

      return {
        success: true,
        message: 'Attendance check-out already processed (idempotent replay).',
        data: {
          session: existingEvent.session,
          event: existingEvent,
          summary,
          isIdempotentReplay: true,
        },
      };
    }

    const employee = await this.resolveActiveEmployee(user.id, user.organizationId);

    // 1b. Check for rapid consecutive punches (< 45s ago)
    const recentPunch = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId: employee.id,
        eventTimestamp: { gte: new Date(serverNow.getTime() - 45 * 1000) },
      },
      orderBy: { eventTimestamp: 'desc' },
    });
    if (recentPunch) {
      this.recordAttendanceException({
        organizationId: employee.organizationId,
        employeeId: employee.id,
        date: serverNow,
        exceptionType: 'SUSPICIOUS_REPEATED_ATTEMPTS',
        severity: 'HIGH',
        details: {
          recentEventType: recentPunch.eventType,
          timeDeltaSeconds: Math.floor(
            (serverNow.getTime() - recentPunch.eventTimestamp.getTime()) / 1000,
          ),
          action: 'CHECK_OUT',
        },
        idempotencyKey: `ex:suspicious_attempts:${employee.id}:${serverNow.toISOString().split('T')[0]}:${Math.floor(serverNow.getTime() / 60000)}`,
      }).catch(() => null);
    }

    // 2. Perform atomic checkout in transaction
    const { session, event, summary, grossMinutes, netWorkMinutes, sessionBreakMinutes } =
      await this.prisma.$transaction(async (tx) => {
        // Find active open session
        const activeSession = await tx.attendanceSession.findFirst({
          where: { employeeId: employee.id, status: 'OPEN' },
          include: { events: { orderBy: { eventTimestamp: 'asc' } } },
        });

        if (!activeSession) {
          this.recordAttendanceException({
            organizationId: employee.organizationId,
            employeeId: employee.id,
            date: serverNow,
            exceptionType: 'INVALID_STATE',
            severity: 'MEDIUM',
            details: {
              attemptedAction: 'CHECK_OUT',
              conflict: 'NO_ACTIVE_SESSION',
            },
            idempotencyKey: `ex:invalid_state:${employee.id}:${serverNow.toISOString().split('T')[0]}:CHECK_OUT_NO_SESSION`,
          }).catch(() => null);

          throw new BadRequestException({
            statusCode: 400,
            message: 'No active open session found to check out.',
            code: 'NO_ACTIVE_SESSION',
          });
        }

        // Resolve Policy & Shift for the session's working date
        const { policy, shift } = await this.policiesService.resolveEffectivePolicyAndShift(
          employee.id,
          activeSession.date,
          employee.organizationId,
        );

        const isOfficialVisit =
          activeSession.attendanceMode === 'OFFICIAL_VISIT' || !!activeSession.officialVisitId;
        const isWfh = activeSession.attendanceMode === 'WFH' || !!activeSession.wfhRequestId;

        // Optional Location validation under policy
        let checkoutDistanceMeters: number | null = null;
        let officeLocationId: string | null = null;

        if (dto.latitude !== undefined && dto.longitude !== undefined) {
          const coordCheck = validateCoordinates(dto.latitude, dto.longitude);
          if (!coordCheck.valid) {
            throw new BadRequestException({
              statusCode: 400,
              message: coordCheck.error || 'Invalid GPS coordinates provided.',
              code: 'INVALID_COORDINATES',
            });
          }

          if (dto.timestamp !== undefined && dto.timestamp !== null) {
            const freshness = validateTimestampFreshness(dto.timestamp, 300, serverNow);
            if (!freshness.valid) {
              throw new BadRequestException({
                statusCode: 400,
                message:
                  freshness.error ||
                  `Stale or skewed GPS timestamp (${Math.round(freshness.skewSeconds || 0)}s skew).`,
                code: 'STALE_LOCATION',
                skewSeconds: freshness.skewSeconds,
              });
            }
          }

          const maxAccuracy = isOfficialVisit
            ? Math.max(150, policy.maxGpsAccuracyMeters || 100)
            : policy.maxGpsAccuracyMeters || 100;
          if (dto.accuracyMeters !== undefined && dto.accuracyMeters !== null) {
            const accuracyCheck = validateGpsAccuracy(dto.accuracyMeters, maxAccuracy);
            if (!accuracyCheck.valid) {
              this.recordAttendanceException({
                organizationId: employee.organizationId,
                employeeId: employee.id,
                date: activeSession.date,
                exceptionType: 'LOW_GPS_ACCURACY',
                severity: 'HIGH',
                details: {
                  reportedAccuracy: dto.accuracyMeters,
                  maxAllowedAccuracy: maxAccuracy,
                  action: 'CHECK_OUT',
                },
                idempotencyKey: `ex:low_accuracy:${employee.id}:${activeSession.date.toISOString().split('T')[0]}:CHECK_OUT`,
              }).catch(() => null);

              throw new BadRequestException({
                statusCode: 400,
                message:
                  accuracyCheck.error ||
                  `GPS accuracy (${dto.accuracyMeters}m) exceeds acceptable threshold (${maxAccuracy}m).`,
                code: 'LOW_GPS_ACCURACY',
              });
            }
          }

          if (!isOfficialVisit && !isWfh) {
            const branchId = employee.employment?.branchId || null;
            const office = await this.resolveOfficeForEmployee(employee.organizationId, branchId);
            if (office) {
              officeLocationId = office.id;
              checkoutDistanceMeters = haversineDistance(
                dto.latitude,
                dto.longitude,
                office.latitude,
                office.longitude,
              );

              if (
                policy.geofenceEnforcement &&
                checkoutDistanceMeters > office.geofenceRadiusMeters
              ) {
                this.recordAttendanceException({
                  organizationId: employee.organizationId,
                  employeeId: employee.id,
                  date: activeSession.date,
                  exceptionType: 'OUTSIDE_GEOFENCE',
                  severity: 'HIGH',
                  details: {
                    distanceMeters: Math.round(checkoutDistanceMeters),
                    allowedRadiusMeters: office.geofenceRadiusMeters,
                    officeName: office.name,
                    action: 'CHECK_OUT',
                  },
                  idempotencyKey: `ex:outside_geofence:${employee.id}:${activeSession.date.toISOString().split('T')[0]}:CHECK_OUT`,
                }).catch(() => null);

                throw new BadRequestException({
                  statusCode: 400,
                  message: `Outside office geofence for checkout. You are ${Math.round(checkoutDistanceMeters)}m from ${office.name} (allowed perimeter: ${office.geofenceRadiusMeters}m).`,
                  code: 'OUTSIDE_GEOFENCE',
                  distanceMeters: Math.round(checkoutDistanceMeters),
                  allowedRadiusMeters: office.geofenceRadiusMeters,
                });
              }
            }
          }
        }

        // Auto-conclude any active open break at checkout time
        let wasOnBreak = false;
        for (const ev of activeSession.events) {
          if (ev.eventType === 'BREAK_START') wasOnBreak = true;
          else if (ev.eventType === 'BREAK_END') wasOnBreak = false;
        }

        if (wasOnBreak) {
          await tx.attendanceEvent.create({
            data: {
              organizationId: employee.organizationId,
              employeeId: employee.id,
              sessionId: activeSession.id,
              eventType: 'BREAK_END',
              eventTimestamp: serverNow,
              attendanceMode: isOfficialVisit ? 'OFFICIAL_VISIT' : isWfh ? 'WFH' : 'OFFICE',
              officialVisitId: activeSession.officialVisitId ?? null,
              wfhRequestId: activeSession.wfhRequestId ?? null,
              idempotencyKey: `auto-break-end-${dto.idempotencyKey}`,
              deviceInfo: 'Auto-concluded on checkout',
              actorUserId: user.id,
              metadata: { note: 'Auto-concluded on session checkout' },
            },
          });
        }

        // Create immutable append-only CHECK_OUT event
        const checkoutEvent = await tx.attendanceEvent.create({
          data: {
            organizationId: employee.organizationId,
            employeeId: employee.id,
            sessionId: activeSession.id,
            eventType: 'CHECK_OUT',
            eventTimestamp: serverNow,
            attendanceMode: isOfficialVisit ? 'OFFICIAL_VISIT' : isWfh ? 'WFH' : 'OFFICE',
            officialVisitId: activeSession.officialVisitId ?? null,
            wfhRequestId: activeSession.wfhRequestId ?? null,
            latitude: dto.latitude ?? null,
            longitude: dto.longitude ?? null,
            accuracyMeters: dto.accuracyMeters ?? null,
            branchId: employee.employment?.branchId ?? null,
            officeLocationId: officeLocationId,
            distanceFromOfficeMeters: checkoutDistanceMeters,
            geofenceStatus: isWfh ? 'EXEMPT' : 'VERIFIED',
            idempotencyKey: dto.idempotencyKey,
            deviceInfo: dto.deviceInfo ?? null,
            ipAddress: clientIp ?? null,
            actorUserId: user.id,
            metadata: {
              workingDate: activeSession.date.toISOString().split('T')[0],
              isOfficialVisit,
              isWfh,
              wfhRequestId: activeSession.wfhRequestId ?? null,
            },
          },
        });

        // Compute break and work durations without trusting client clock
        const allSessionEvents = await tx.attendanceEvent.findMany({
          where: { sessionId: activeSession.id },
          orderBy: { eventTimestamp: 'asc' },
        });

        let sessionBreakMinutes = 0;
        let curBreakStart: Date | null = null;
        for (const ev of allSessionEvents) {
          if (ev.eventType === 'BREAK_START') {
            curBreakStart = ev.eventTimestamp;
          } else if (ev.eventType === 'BREAK_END' && curBreakStart) {
            sessionBreakMinutes += Math.max(
              0,
              Math.floor((ev.eventTimestamp.getTime() - curBreakStart.getTime()) / 60000),
            );
            curBreakStart = null;
          }
        }

        const grossMinutes = Math.max(
          0,
          Math.floor((serverNow.getTime() - activeSession.checkInTime.getTime()) / 60000),
        );
        const netWorkMinutes = Math.max(0, grossMinutes - sessionBreakMinutes);

        const closedSession = await tx.attendanceSession.update({
          where: { id: activeSession.id },
          data: {
            status: 'COMPLETED',
            checkOutTime: serverNow,
            totalWorkMinutes: netWorkMinutes,
            totalBreakMinutes: sessionBreakMinutes,
          },
        });

        // Transition official visit if checkout concludes the visit
        if (activeSession.officialVisitId) {
          const officialVisit = await tx.officialVisit.findUnique({
            where: { id: activeSession.officialVisitId },
          });
          if (officialVisit) {
            const isAtOrAfterEnd = activeSession.date.getTime() >= officialVisit.endDate.getTime();
            if (isAtOrAfterEnd || dto.isVisitConcluded) {
              await tx.officialVisit.update({
                where: { id: officialVisit.id },
                data: { status: VisitStatus.COMPLETED },
              });
            }
          }
        }

        // Recalculate daily summary for this working date
        const updatedSummary = await this.recalculateDailySummary(
          tx,
          employee.id,
          employee.organizationId,
          activeSession.date,
          policy,
          shift,
        );

        return {
          session: closedSession,
          event: checkoutEvent,
          summary: updatedSummary,
          grossMinutes,
          netWorkMinutes,
          sessionBreakMinutes,
        };
      });

    await this.auditService.record({
      organizationId: employee.organizationId,
      userId: user.id,
      action: 'ATTENDANCE_CHECK_OUT',
      entity: 'AttendanceSession',
      entityId: session.id,
      ipAddress: clientIp,
      userAgent,
      metadata: {
        employeeId: employee.id,
        sessionId: session.id,
        eventId: event.id,
        mode: session.attendanceMode,
        officialVisitId: session.officialVisitId,
        wfhRequestId: session.wfhRequestId,
        isWfh: session.attendanceMode === 'WFH' || !!session.wfhRequestId,
        netWorkMinutes,
        grossMinutes,
        sessionBreakMinutes,
        status: summary.status,
      },
    });

    if (summary && summary.earlyExitMinutes > 0) {
      this.recordAttendanceException({
        organizationId: employee.organizationId,
        employeeId: employee.id,
        date: session.date,
        exceptionType: 'EARLY_DEPARTURE',
        severity: summary.earlyExitMinutes > 60 ? 'MEDIUM' : 'LOW',
        details: {
          earlyExitMinutes: summary.earlyExitMinutes,
          lastCheckOut: serverNow.toISOString(),
          shiftEndTime: summary.shift?.endTime || '18:00',
        },
        idempotencyKey: `ex:early_departure:${employee.id}:${session.date.toISOString().split('T')[0]}`,
      }).catch(() => null);
    }

    const successMessage =
      session.attendanceMode === 'OFFICIAL_VISIT'
        ? 'Official visit check-out verified and recorded successfully.'
        : session.attendanceMode === 'WFH'
          ? 'WFH check-out verified and recorded successfully.'
          : 'Office check-out verified and recorded successfully.';

    return {
      success: true,
      message: successMessage,
      data: {
        session,
        event,
        summary,
        grossMinutes,
        netWorkMinutes,
        sessionBreakMinutes,
      },
    };
  }

  // ===========================================================================
  // 4. MISSING CHECKOUT RECONCILIATION
  // ===========================================================================

  /**
   * Identifies unclosed open sessions past their working day or shift window,
   * transitions them to AUTO_CLOSED, and flags an AttendanceException without
   * fabricating a fake CHECK_OUT event.
   */
  async reconcileMissingCheckouts(organizationId: string, cutoffDate?: Date) {
    const referenceDate = cutoffDate || new Date();

    const staleSessions = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId,
        status: 'OPEN',
        date: { lt: new Date(referenceDate.toISOString().split('T')[0] + 'T00:00:00.000Z') },
      },
      include: {
        employee: true,
      },
    });

    const reconciled: string[] = [];

    for (const session of staleSessions) {
      await this.prisma.$transaction(async (tx) => {
        // 1. Mark session as AUTO_CLOSED without fabricating CHECK_OUT event
        await tx.attendanceSession.update({
          where: { id: session.id },
          data: {
            status: 'AUTO_CLOSED',
            // checkOutTime remains NULL
          },
        });

        // 2. Log AttendanceException
        await tx.attendanceException.create({
          data: {
            organizationId,
            employeeId: session.employeeId,
            date: session.date,
            exceptionType: 'MISSING_CHECKOUT',
            severity: 'MEDIUM',
            status: 'OPEN',
            resolved: false,
            idempotencyKey: `ex:missing_checkout:${session.id}`,
            details: {
              sessionId: session.id,
              checkInTime: session.checkInTime.toISOString(),
              message:
                'Session automatically closed by reconciliation engine due to missing employee checkout punch.',
            },
          },
        });

        // 3. Update summary
        await tx.attendanceDailySummary.upsert({
          where: {
            organizationId_employeeId_date: {
              organizationId,
              employeeId: session.employeeId,
              date: session.date,
            },
          },
          create: {
            organizationId,
            employeeId: session.employeeId,
            date: session.date,
            firstCheckIn: session.checkInTime,
            lastCheckOut: null,
            totalWorkMinutes: 0,
            status: 'INCOMPLETE',
            correctionNotes:
              'Missing checkout flagged by reconciliation engine (incomplete session)',
          },
          update: {
            lastCheckOut: null,
            status: 'INCOMPLETE',
            correctionNotes:
              'Missing checkout flagged by reconciliation engine (incomplete session)',
          },
        });
      });

      reconciled.push(session.id);
    }

    this.logger.log(
      `Reconciled ${reconciled.length} missing check-out sessions in org ${organizationId}`,
    );

    return {
      success: true,
      message: `Successfully reconciled ${reconciled.length} unclosed attendance sessions.`,
      reconciledCount: reconciled.length,
      sessionIds: reconciled,
    };
  }

  // ===========================================================================
  // 5. SAFE DAILY SUMMARY RECALCULATION
  // ===========================================================================

  /**
   * Safely recalculates working-day aggregates from all sessions on a given working date using
   * the deterministic daily attendance calculation engine.
   */
  async recalculateDailySummary(
    tx: any,
    employeeId: string,
    organizationId: string,
    workingDateUtc: Date,
    policy: any,
    shift: any,
    options?: {
      isHoliday?: boolean;
      isApprovedLeave?: boolean;
      referenceNow?: Date;
    },
  ) {
    const allSessions = await tx.attendanceSession.findMany({
      where: { employeeId, date: workingDateUtc },
      orderBy: { sessionNumber: 'asc' },
      include: {
        events: {
          orderBy: { eventTimestamp: 'asc' },
        },
      },
    });

    const workingDateStr = workingDateUtc.toISOString().split('T')[0];
    const allEvents = allSessions.flatMap((s: any) => s.events || []);

    const calculation = calculateDailyAttendance({
      workingDate: workingDateStr,
      sessions: allSessions,
      events: allEvents,
      shift,
      policy,
      isHoliday: options?.isHoliday ?? false,
      isApprovedLeave: options?.isApprovedLeave ?? false,
      referenceNow: options?.referenceNow ?? new Date(),
    });

    const persistedPolicyId = policy?.id && !policy.id.startsWith('synthetic') ? policy.id : null;
    const persistedShiftId = shift?.id && !shift.id.startsWith('synthetic') ? shift.id : null;

    const visitSession = allSessions.find(
      (s: any) => s.attendanceMode === 'OFFICIAL_VISIT' || s.officialVisitId,
    );
    const wfhSession = allSessions.find((s: any) => s.attendanceMode === 'WFH' || s.wfhRequestId);
    const primaryMode = visitSession ? 'OFFICIAL_VISIT' : wfhSession ? 'WFH' : 'OFFICE';
    const primaryVisitId = visitSession?.officialVisitId ?? null;
    const primaryWfhId = wfhSession?.wfhRequestId ?? null;

    return tx.attendanceDailySummary.upsert({
      where: {
        organizationId_employeeId_date: {
          organizationId,
          employeeId,
          date: workingDateUtc,
        },
      },
      create: {
        organizationId,
        employeeId,
        date: workingDateUtc,
        firstCheckIn: calculation.firstCheckIn,
        lastCheckOut: calculation.lastCheckOut,
        totalWorkMinutes: calculation.netWorkMinutes,
        totalBreakMinutes: calculation.breakDurationMinutes,
        lateMinutes: calculation.lateMinutes,
        earlyExitMinutes: calculation.earlyDepartureMinutes,
        overtimeMinutes: calculation.overtimeCandidateMinutes,
        status: calculation.status,
        shiftId: persistedShiftId,
        policyId: persistedPolicyId,
        primaryAttendanceMode: primaryMode as AttendanceMode,
        officialVisitId: primaryVisitId,
        wfhRequestId: primaryWfhId,
      },
      update: {
        firstCheckIn: calculation.firstCheckIn,
        lastCheckOut: calculation.lastCheckOut,
        totalWorkMinutes: calculation.netWorkMinutes,
        totalBreakMinutes: calculation.breakDurationMinutes,
        lateMinutes: calculation.lateMinutes,
        earlyExitMinutes: calculation.earlyDepartureMinutes,
        overtimeMinutes: calculation.overtimeCandidateMinutes,
        status: calculation.status,
        shiftId: persistedShiftId,
        policyId: persistedPolicyId,
        primaryAttendanceMode: primaryMode as AttendanceMode,
        officialVisitId: primaryVisitId,
        wfhRequestId: primaryWfhId,
      },
    });
  }

  /**
   * Recalculates attendance summaries across an employee or all active employees in an organization
   * for a given date range.
   */
  async recalculateAttendance(
    organizationId: string,
    dto: RecalculateAttendanceDto,
    actorUserId: string,
  ) {
    const startDateStr = dto.startDate;
    const endDateStr = dto.endDate || dto.startDate;
    const force = dto.force ?? false;

    let employees = [];
    if (dto.employeeId) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, organizationId, deletedAt: null },
      });
      if (!emp) {
        throw new NotFoundException({
          statusCode: 404,
          message: `Employee ${dto.employeeId} not found in this organization.`,
          code: 'EMPLOYEE_NOT_FOUND',
        });
      }
      employees = [emp];
    } else {
      employees = await this.prisma.employee.findMany({
        where: { organizationId, deletedAt: null, isActive: true },
      });
    }

    const curr = new Date(`${startDateStr}T00:00:00.000Z`);
    const end = new Date(`${endDateStr}T00:00:00.000Z`);

    if (curr.getTime() > end.getTime()) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'startDate must be before or equal to endDate.',
        code: 'INVALID_DATE_RANGE',
      });
    }

    const diffDays = Math.round((end.getTime() - curr.getTime()) / 86400000);
    if (diffDays > 365) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Date range cannot exceed 365 days.',
        code: 'DATE_RANGE_TOO_LARGE',
      });
    }

    const dates: string[] = [];
    const walker = new Date(curr);
    while (walker.getTime() <= end.getTime()) {
      dates.push(walker.toISOString().split('T')[0]);
      walker.setUTCDate(walker.getUTCDate() + 1);
    }

    const results = [];
    for (const employee of employees) {
      for (const dStr of dates) {
        const workingDateUtc = new Date(`${dStr}T00:00:00.000Z`);

        const existing = await this.prisma.attendanceDailySummary.findUnique({
          where: {
            organizationId_employeeId_date: {
              organizationId,
              employeeId: employee.id,
              date: workingDateUtc,
            },
          },
        });

        if (existing?.isCorrected && !force) {
          results.push({
            employeeId: employee.id,
            date: dStr,
            status: existing.status,
            skipped: true,
            reason: 'Manually corrected summary preserved (use force: true to overwrite)',
          });
          continue;
        }

        const { policy, shift } = await this.policiesService.resolveEffectivePolicyAndShift(
          employee.id,
          workingDateUtc,
          organizationId,
        );

        const summary = await this.recalculateDailySummary(
          this.prisma,
          employee.id,
          organizationId,
          workingDateUtc,
          policy,
          shift,
        );

        results.push({
          employeeId: employee.id,
          date: dStr,
          status: summary.status,
          netWorkMinutes: summary.totalWorkMinutes,
          lateMinutes: summary.lateMinutes,
          earlyExitMinutes: summary.earlyExitMinutes,
          overtimeMinutes: summary.overtimeMinutes,
          skipped: false,
        });
      }
    }

    await this.auditService.record({
      action: 'ATTENDANCE_SUMMARY_RECALCULATED',
      entity: 'AttendanceDailySummary',
      entityId: organizationId,
      userId: actorUserId,
      organizationId,
      metadata: {
        startDate: startDateStr,
        endDate: endDateStr,
        employeeCount: employees.length,
        totalRecalculated: results.filter((r) => !r.skipped).length,
        totalSkipped: results.filter((r) => r.skipped).length,
      },
    });

    return {
      success: true,
      message: `Recalculated attendance summaries for ${employees.length} employee(s) across ${dates.length} day(s).`,
      recalculatedCount: results.filter((r) => !r.skipped).length,
      skippedCount: results.filter((r) => r.skipped).length,
      data: results,
    };
  }

  // ===========================================================================
  // 6. TODAY STATUS (LIVE VIEW)
  // ===========================================================================

  /**
   * Retrieves today's live attendance status, open session, and policy context for the logged-in user.
   */
  async getToday(user: AuthenticatedUser) {
    const now = new Date();

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
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No employee record found for current user.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    const branchId = employee.employment?.branchId || null;

    const initialResolution = await this.policiesService.resolveEffectivePolicyAndShift(
      employee.id,
      now,
      employee.organizationId,
    );

    const timezone = initialResolution.policy.timezone || 'Asia/Kolkata';
    const workingDayResult = resolveWorkingDay(
      now,
      initialResolution.policy.workingDayStartHour,
      timezone,
    );
    const workingDateStr = workingDayResult.workingDateStr;
    const workingDateUtc = new Date(`${workingDateStr}T00:00:00.000Z`);

    const resolved = await this.policiesService.resolveEffectivePolicyAndShift(
      employee.id,
      workingDateUtc,
      employee.organizationId,
    );

    const { policy, shift } = resolved;

    // Fetch daily summary
    const summary = await this.prisma.attendanceDailySummary.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId: employee.organizationId,
          employeeId: employee.id,
          date: workingDateUtc,
        },
      },
    });

    // Fetch sessions today with events
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        employeeId: employee.id,
        date: workingDateUtc,
      },
      orderBy: { sessionNumber: 'asc' },
      include: {
        events: {
          orderBy: { eventTimestamp: 'asc' },
        },
        officialVisit: true,
        wfhRequest: true,
      },
    });

    const activeSession = sessions.find((s) => s.status === 'OPEN') || null;

    // Determine break status
    let isOnBreak = false;
    if (activeSession && activeSession.events.length > 0) {
      for (const ev of activeSession.events) {
        if (ev.eventType === 'BREAK_START') isOnBreak = true;
        else if (ev.eventType === 'BREAK_END') isOnBreak = false;
      }
    }

    const isCheckedIn = !!activeSession;
    const canCheckIn = !activeSession && (policy.allowMultipleSessions || sessions.length === 0);
    const canCheckOut = isCheckedIn;
    const canStartBreak = isCheckedIn && !isOnBreak;
    const canEndBreak = isCheckedIn && isOnBreak;

    // Resolve primary office
    const office = await this.resolveOfficeForEmployee(employee.organizationId, branchId);

    const allEvents = sessions.flatMap((s) => s.events);

    return {
      success: true,
      message: 'Today attendance status retrieved successfully.',
      data: {
        date: workingDateStr,
        workingDateUtc: workingDateUtc.toISOString(),
        employee: {
          id: employee.id,
          employeeCode: employee.employeeCode,
          displayName: employee.displayName,
          branchId: branchId,
        },
        currentStatus: {
          isCheckedIn,
          isOnBreak,
          canCheckIn,
          canCheckOut,
          canStartBreak,
          canEndBreak,
        },
        activeSession,
        sessions,
        events: allEvents,
        summary,
        policy,
        shift,
        office: office
          ? {
              id: office.id,
              name: office.name,
              latitude: office.latitude,
              longitude: office.longitude,
              geofenceRadiusMeters: office.geofenceRadiusMeters,
              timezone: office.timezone,
            }
          : null,
      },
    };
  }

  // ===========================================================================
  // 7. HELPER RESOLVERS
  // ===========================================================================

  private async resolveActiveEmployee(userId: string, organizationId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId, deletedAt: null },
      include: { employment: { include: { branch: true } } },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No active employee profile linked to current user account.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    const eligibleStatuses = ['ACTIVE', 'PROBATION', 'ON_NOTICE'];
    if (!employee.isActive || !eligibleStatuses.includes(employee.status)) {
      throw new ForbiddenException({
        statusCode: 403,
        message: `Employment status '${employee.status}' is not eligible for attendance marking.`,
        code: 'EMPLOYMENT_INACTIVE',
      });
    }

    return employee;
  }

  private async resolveOfficeForEmployee(organizationId: string, branchId?: string | null) {
    let office = null;
    if (branchId) {
      office = await this.prisma.officeLocation.findFirst({
        where: { organizationId, branchId, isActive: true },
      });
    }
    if (!office) {
      office = await this.prisma.officeLocation.findFirst({
        where: { organizationId, branchId: null, isActive: true },
      });
    }
    if (!office) {
      office = await this.prisma.officeLocation.findFirst({
        where: { organizationId, isActive: true },
      });
    }
    return office;
  }

  /**
   * Retrieves past attendance daily summaries and sessions for current employee
   */
  async getMyHistory(user: AuthenticatedUser, limit: number = 30) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId, deletedAt: null },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No employee record found for current user.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where: {
        organizationId: user.organizationId,
        employeeId: employee.id,
      },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        shift: true,
        officialVisit: true,
        wfhRequest: true,
      },
    });

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        employeeId: employee.id,
      },
      orderBy: { date: 'desc' },
      take: limit * 2,
      include: {
        events: {
          orderBy: { eventTimestamp: 'asc' },
        },
        officialVisit: true,
        wfhRequest: true,
      },
    });

    return {
      success: true,
      message: 'Attendance history retrieved successfully.',
      data: {
        summaries: summaries.map((s) => ({
          ...s,
          dateStr: s.date.toISOString().split('T')[0],
          grossHours: Math.round(((s.totalWorkMinutes + s.totalBreakMinutes) / 60) * 100) / 100,
          netHours: Math.round((s.totalWorkMinutes / 60) * 100) / 100,
          breakHours: Math.round((s.totalBreakMinutes / 60) * 100) / 100,
        })),
        sessions,
      },
    };
  }

  /**
   * Submits an attendance correction request for review
   */
  async submitCorrectionRequest(user: AuthenticatedUser, dto: SubmitCorrectionRequestDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId, deletedAt: null },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No employee record found for current user.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    const resolution = await this.policiesService.resolveEffectivePolicyAndShift(
      employee.id,
      new Date(),
      user.organizationId,
    );
    const timezone = resolution.policy?.timezone || 'Asia/Kolkata';
    const cutoffHour = resolution.policy?.workingDayStartHour ?? 5;
    const todayWorkingDate = resolveWorkingDay(new Date(), cutoffHour, timezone).workingDateStr;

    // 1. Prevent future date correction requests
    if (dto.targetDate > todayWorkingDate) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Cannot submit attendance correction requests for future dates.',
        code: 'FUTURE_DATE_NOT_ALLOWED',
      });
    }

    // 2. Validate time sequence if both check-in and check-out are provided
    if (dto.requestedCheckIn && dto.requestedCheckOut) {
      const inTime = new Date(dto.requestedCheckIn).getTime();
      const outTime = new Date(dto.requestedCheckOut).getTime();
      if (outTime <= inTime) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Requested check-out time must be after requested check-in time.',
          code: 'INVALID_TIME_SEQUENCE',
        });
      }
    }

    const targetDateUtc = new Date(`${dto.targetDate}T00:00:00.000Z`);

    // 3. Duplicate pending request check
    const existing = await this.prisma.attendanceCorrectionRequest.findFirst({
      where: {
        organizationId: user.organizationId,
        employeeId: employee.id,
        targetDate: targetDateUtc,
        status: 'PENDING',
      },
    });

    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: `A pending correction request already exists for date ${dto.targetDate}.`,
        code: 'DUPLICATE_CORRECTION_REQUEST',
      });
    }

    const formattedReason = formatCorrectionReason(
      dto.reasonCategory || 'MISSING_CHECKOUT',
      dto.reason,
      dto.evidenceMetadata,
    );

    const request = await this.prisma.attendanceCorrectionRequest.create({
      data: {
        organizationId: user.organizationId,
        employeeId: employee.id,
        targetDate: targetDateUtc,
        requestedCheckIn: dto.requestedCheckIn ? new Date(dto.requestedCheckIn) : null,
        requestedCheckOut: dto.requestedCheckOut ? new Date(dto.requestedCheckOut) : null,
        reason: formattedReason,
        status: 'PENDING',
      },
    });

    await this.auditService.record({
      action: 'ATTENDANCE_CORRECTION_REQUESTED',
      entity: 'AttendanceCorrectionRequest',
      entityId: request.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        targetDate: dto.targetDate,
        reasonCategory: dto.reasonCategory || 'MISSING_CHECKOUT',
        reason: dto.reason,
        requestedCheckIn: dto.requestedCheckIn,
        requestedCheckOut: dto.requestedCheckOut,
        hasEvidence: !!dto.evidenceMetadata,
      },
    });

    this.recordAttendanceException({
      organizationId: user.organizationId,
      employeeId: employee.id,
      date: targetDateUtc,
      exceptionType: 'PENDING_CORRECTION',
      severity: 'MEDIUM',
      details: {
        requestId: request.id,
        targetDate: dto.targetDate,
        reasonCategory: dto.reasonCategory || 'MISSING_CHECKOUT',
      },
      idempotencyKey: `ex:pending_correction:${request.id}`,
    }).catch(() => null);

    return {
      success: true,
      message: 'Attendance correction request submitted successfully.',
      data: enrichCorrectionRequest(request),
    };
  }

  /**
   * Retrieves all correction requests submitted by current user
   */
  async getMyCorrections(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId, deletedAt: null },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No employee record found for current user.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    const requests = await this.prisma.attendanceCorrectionRequest.findMany({
      where: {
        organizationId: user.organizationId,
        employeeId: employee.id,
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        decision: true,
      },
    });

    return {
      success: true,
      message: 'Correction requests retrieved successfully.',
      data: requests.map(enrichCorrectionRequest),
    };
  }

  // ===========================================================================
  // 8. HR ATTENDANCE DASHBOARD & OPERATIONS
  // ===========================================================================

  /**
   * Retrieves aggregated organizational attendance metrics, headcount, and trend data.
   */
  async getOperationsDashboard(organizationId: string, query: AttendanceOperationsQueryDto) {
    const defaultResolution = await this.policiesService.resolveEffectivePolicyAndShift(
      'default',
      new Date(),
      organizationId,
    );
    const timezone = defaultResolution.policy?.timezone || 'Asia/Kolkata';
    const cutoffHour = defaultResolution.policy?.workingDayStartHour ?? 5;

    const workingDateStr =
      query.date || resolveWorkingDay(new Date(), cutoffHour, timezone).workingDateStr;
    const workingDateUtc = new Date(`${workingDateStr}T00:00:00.000Z`);

    // Scoped employee filter
    const employeeWhere: any = {
      organizationId,
      deletedAt: null,
      isActive: true,
    };
    if (query.branchId) {
      employeeWhere.employment = { ...employeeWhere.employment, branchId: query.branchId };
    }
    if (query.departmentId) {
      employeeWhere.employment = { ...employeeWhere.employment, departmentId: query.departmentId };
    }

    const totalActiveEmployees = await this.prisma.employee.count({
      where: employeeWhere,
    });

    // Fetch daily summaries for the date
    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where: {
        organizationId,
        date: workingDateUtc,
        employee: employeeWhere,
      },
      include: {
        shift: true,
      },
    });

    let present = 0;
    let lateArrivals = 0;
    let halfDay = 0;
    let absent = 0;
    let onLeave = 0;
    let incomplete = 0;
    let pendingReview = 0;
    let weekOff = 0;
    let holiday = 0;
    let notScheduled = 0;

    for (const s of summaries) {
      if (s.status === 'PRESENT' || s.status === 'LATE') present++;
      if (s.lateMinutes > 0) lateArrivals++;
      if (s.status === 'HALF_DAY') halfDay++;
      if (s.status === 'ABSENT') absent++;
      if (s.status === 'ON_LEAVE') onLeave++;
      if (s.status === 'INCOMPLETE') incomplete++;
      if (s.status === 'PENDING_REVIEW') pendingReview++;
      if (s.status === 'WEEK_OFF' || s.status === 'WEEKEND_OFF') weekOff++;
      if (s.status === 'HOLIDAY') holiday++;
      if (s.status === 'NOT_SCHEDULED') notScheduled++;
    }

    // Live active checked-in count
    const checkedInNow = await this.prisma.attendanceSession.count({
      where: {
        organizationId,
        date: workingDateUtc,
        status: 'OPEN',
        employee: employeeWhere,
      },
    });

    // Unresolved exceptions count
    const unresolvedExceptions = await this.prisma.attendanceException.count({
      where: {
        organizationId,
        date: workingDateUtc,
        resolved: false,
        employee: employeeWhere,
      },
    });

    // Check-in modes count
    const checkInEvents = await this.prisma.attendanceEvent.findMany({
      where: {
        organizationId,
        session: { date: workingDateUtc },
        eventType: 'CHECK_IN',
        employee: employeeWhere,
      },
      select: { attendanceMode: true },
    });

    const modes = {
      office: checkInEvents.filter((e) => e.attendanceMode === 'OFFICE').length,
      officialVisit: checkInEvents.filter((e) => e.attendanceMode === 'OFFICIAL_VISIT').length,
      workFromHome: checkInEvents.filter((e) => e.attendanceMode === 'WFH').length,
    };

    // Past 7-day trend
    const trendDays = [];
    const [y, m, d] = workingDateStr.split('-').map(Number);
    for (let i = 6; i >= 0; i--) {
      const pastDate = new Date(Date.UTC(y, m - 1, d - i));
      const pastDateStr = pastDate.toISOString().split('T')[0];
      const pastDateUtc = new Date(`${pastDateStr}T00:00:00.000Z`);

      const pastSummaries = await this.prisma.attendanceDailySummary.findMany({
        where: {
          organizationId,
          date: pastDateUtc,
          employee: employeeWhere,
        },
        select: { status: true, lateMinutes: true },
      });

      const dayName = pastDate.toLocaleDateString('en-US', { weekday: 'short' });
      trendDays.push({
        date: pastDateStr,
        day: dayName,
        present: pastSummaries.filter((s) => s.status === 'PRESENT' || s.status === 'LATE').length,
        late: pastSummaries.filter((s) => s.lateMinutes > 0).length,
        absent: pastSummaries.filter((s) => s.status === 'ABSENT').length,
        halfDay: pastSummaries.filter((s) => s.status === 'HALF_DAY').length,
      });
    }

    return {
      success: true,
      message: 'Operations dashboard data retrieved successfully.',
      data: {
        date: workingDateStr,
        reportingTimestamp: new Date().toISOString(),
        timezone,
        cutoffHour,
        headcount: {
          totalActiveEmployees,
          checkedInNow,
          present,
          lateArrivals,
          halfDay,
          absent,
          onLeave,
          incomplete,
          pendingReview,
          weekOff,
          holiday,
          notScheduled,
          unresolvedExceptions,
        },
        modes,
        trend: trendDays,
      },
    };
  }

  /**
   * Retrieves paginated employee attendance records for HR management with GPS privacy protection.
   */
  async getOperationsRecords(user: AuthenticatedUser, query: AttendanceOperationsQueryDto) {
    const defaultResolution = await this.policiesService.resolveEffectivePolicyAndShift(
      'default',
      new Date(),
      user.organizationId,
    );
    const timezone = defaultResolution.policy?.timezone || 'Asia/Kolkata';
    const cutoffHour = defaultResolution.policy?.workingDayStartHour ?? 5;

    const workingDateStr =
      query.date || resolveWorkingDay(new Date(), cutoffHour, timezone).workingDateStr;
    const workingDateUtc = new Date(`${workingDateStr}T00:00:00.000Z`);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    // Build employee filter
    const employeeWhere: any = {
      organizationId: user.organizationId,
      deletedAt: null,
      isActive: true,
    };

    if (query.search?.trim()) {
      const term = query.search.trim();
      employeeWhere.OR = [
        { displayName: { contains: term, mode: 'insensitive' } },
        { employeeCode: { contains: term, mode: 'insensitive' } },
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.branchId) {
      employeeWhere.employment = { ...employeeWhere.employment, branchId: query.branchId };
    }
    if (query.departmentId) {
      employeeWhere.employment = { ...employeeWhere.employment, departmentId: query.departmentId };
    }

    // If filtered by status, match employee IDs having that status
    if (query.status && query.status !== 'ALL') {
      const matchingSummaries = await this.prisma.attendanceDailySummary.findMany({
        where: {
          organizationId: user.organizationId,
          date: workingDateUtc,
          status: query.status as any,
        },
        select: { employeeId: true },
      });
      employeeWhere.id = { in: matchingSummaries.map((s) => s.employeeId) };
    }

    const totalCount = await this.prisma.employee.count({ where: employeeWhere });

    const employees = await this.prisma.employee.findMany({
      where: employeeWhere,
      skip,
      take: limit,
      orderBy: { employeeCode: 'asc' },
      include: {
        employment: {
          include: {
            branch: true,
            department: true,
          },
        },
      },
    });

    const employeeIds = employees.map((e) => e.id);

    // Fetch summaries for these employees
    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        employeeId: { in: employeeIds },
      },
      include: {
        shift: true,
      },
    });

    // Fetch active/all sessions on this date
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        employeeId: { in: employeeIds },
      },
      orderBy: { sessionNumber: 'asc' },
      include: {
        events: {
          orderBy: { eventTimestamp: 'asc' },
          include: { officeLocation: true },
        },
      },
    });

    // Fetch unresolved exceptions
    const exceptions = await this.prisma.attendanceException.findMany({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        employeeId: { in: employeeIds },
      },
    });

    // Check GPS privacy permission
    const canViewPreciseGps =
      user.roles?.includes('ADMIN' as any) ||
      user.permissions?.includes('ATTENDANCE_VIEW_GPS') ||
      false;

    const records = employees.map((emp) => {
      const summary = summaries.find((s) => s.employeeId === emp.id) || null;
      const empSessions = sessions.filter((s) => s.employeeId === emp.id);
      const activeSession = empSessions.find((s) => s.status === 'OPEN') || null;
      const empExceptions = exceptions.filter((e) => e.employeeId === emp.id);

      // Latest check-in event for location details
      const latestCheckInEvent = empSessions
        .flatMap((s) => s.events)
        .filter((e) => e.eventType === 'CHECK_IN')
        .pop();

      return {
        employee: {
          id: emp.id,
          employeeCode: emp.employeeCode,
          displayName: emp.displayName,
          department: emp.employment?.department?.name || 'General',
          branch: emp.employment?.branch?.name || 'Main Office',
        },
        summary: summary
          ? {
              status: summary.status,
              firstCheckIn: summary.firstCheckIn,
              lastCheckOut: summary.lastCheckOut,
              totalWorkMinutes: summary.totalWorkMinutes,
              totalBreakMinutes: summary.totalBreakMinutes,
              netHours: Math.round((summary.totalWorkMinutes / 60) * 100) / 100,
              lateMinutes: summary.lateMinutes,
              earlyExitMinutes: summary.earlyExitMinutes,
              overtimeMinutes: summary.overtimeMinutes,
              isCorrected: summary.isCorrected,
            }
          : {
              status: 'NOT_SCHEDULED',
              firstCheckIn: null,
              lastCheckOut: null,
              totalWorkMinutes: 0,
              totalBreakMinutes: 0,
              netHours: 0,
              lateMinutes: 0,
              earlyExitMinutes: 0,
              overtimeMinutes: 0,
              isCorrected: false,
            },
        activeSession: activeSession
          ? {
              id: activeSession.id,
              sessionNumber: activeSession.sessionNumber,
              checkInTime: activeSession.checkInTime,
              status: activeSession.status,
            }
          : null,
        sessionCount: empSessions.length,
        exceptionCount: empExceptions.length,
        exceptions: empExceptions.map((ex) => ({
          id: ex.id,
          exceptionType: ex.exceptionType,
          severity: ex.severity,
          resolved: ex.resolved,
        })),
        locationVerification: latestCheckInEvent
          ? {
              officeName: latestCheckInEvent.officeLocation?.name || 'Office',
              geofenceStatus: latestCheckInEvent.geofenceStatus,
              distanceMeters: latestCheckInEvent.distanceFromOfficeMeters,
              latitude: canViewPreciseGps ? latestCheckInEvent.latitude : null,
              longitude: canViewPreciseGps ? latestCheckInEvent.longitude : null,
              isGpsRedacted: !canViewPreciseGps,
            }
          : null,
      };
    });

    return {
      success: true,
      message: 'Operations attendance records retrieved successfully.',
      data: records,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  }

  /**
   * Retrieves detailed timeline, sessions, events, and exceptions for a specific employee on a date.
   */
  async getOperationsEmployeeDetail(user: AuthenticatedUser, employeeId: string, dateStr?: string) {
    const defaultResolution = await this.policiesService.resolveEffectivePolicyAndShift(
      'default',
      new Date(),
      user.organizationId,
    );
    const timezone = defaultResolution.policy?.timezone || 'Asia/Kolkata';
    const cutoffHour = defaultResolution.policy?.workingDayStartHour ?? 5;

    const workingDateStr =
      dateStr || resolveWorkingDay(new Date(), cutoffHour, timezone).workingDateStr;
    const workingDateUtc = new Date(`${workingDateStr}T00:00:00.000Z`);

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        employment: {
          include: {
            branch: true,
            department: true,
            designation: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Employee not found.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    // Authorization & Scope enforcement (anti-horizontal privilege escalation)
    const isGlobalOrAdmin =
      user.roles?.includes('ADMIN' as any) || user.roles?.includes('HR' as any);

    if (!isGlobalOrAdmin) {
      if (user.roles?.includes('MANAGER' as any)) {
        // Managers can view their own details or their team members' details
        const managerEmployee = await this.prisma.employee.findFirst({
          where: {
            userId: user.id,
            organizationId: user.organizationId,
            deletedAt: null,
          },
        });

        if (!managerEmployee) {
          throw new ForbiddenException({
            statusCode: 403,
            message: 'No manager profile linked to current user account.',
            code: 'FORBIDDEN_NOT_MANAGER',
          });
        }

        if (managerEmployee.id !== employee.id) {
          const isSubordinate = await this.hierarchyService.isManagerOf(
            managerEmployee.id,
            employee.id,
            user.organizationId,
          );

          if (!isSubordinate) {
            throw new ForbiddenException({
              statusCode: 403,
              message:
                'Access denied: You are not authorized to view attendance details for an employee outside your reporting hierarchy.',
              code: 'FORBIDDEN_OUTSIDE_HIERARCHY',
            });
          }
        }
      } else {
        // Standard EMPLOYEE: can ONLY view their own records
        if (employee.userId !== user.id) {
          throw new ForbiddenException({
            statusCode: 403,
            message:
              'Access denied: Employees are strictly prohibited from viewing attendance records of another employee.',
            code: 'FORBIDDEN_EMPLOYEE_ACCESS',
          });
        }
      }
    }

    const { policy, shift } = await this.policiesService.resolveEffectivePolicyAndShift(
      employee.id,
      workingDateUtc,
      user.organizationId,
    );

    const summary = await this.prisma.attendanceDailySummary.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId: user.organizationId,
          employeeId: employee.id,
          date: workingDateUtc,
        },
      },
      include: { shift: true },
    });

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        employeeId: employee.id,
        date: workingDateUtc,
      },
      orderBy: { sessionNumber: 'asc' },
      include: {
        events: {
          orderBy: { eventTimestamp: 'asc' },
          include: { officeLocation: true },
        },
      },
    });

    const exceptions = await this.prisma.attendanceException.findMany({
      where: {
        organizationId: user.organizationId,
        employeeId: employee.id,
        date: workingDateUtc,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check GPS privacy authorization
    const canViewPreciseGps =
      user.roles?.includes('ADMIN' as any) ||
      user.permissions?.includes('ATTENDANCE_VIEW_GPS') ||
      false;

    const sanitizedSessions = sessions.map((sess) => ({
      ...sess,
      events: sess.events.map((ev) => ({
        id: ev.id,
        eventType: ev.eventType,
        eventTimestamp: ev.eventTimestamp,
        attendanceMode: ev.attendanceMode,
        geofenceStatus: ev.geofenceStatus,
        distanceFromOfficeMeters: ev.distanceFromOfficeMeters,
        officeName: ev.officeLocation?.name || null,
        deviceInfo: ev.deviceInfo,
        latitude: canViewPreciseGps ? ev.latitude : null,
        longitude: canViewPreciseGps ? ev.longitude : null,
        isGpsRedacted: !canViewPreciseGps,
      })),
    }));

    return {
      success: true,
      message: 'Employee attendance details retrieved successfully.',
      data: {
        date: workingDateStr,
        employee: {
          id: employee.id,
          employeeCode: employee.employeeCode,
          displayName: employee.displayName,
          designation: employee.employment?.designation?.name || 'Staff',
          department: employee.employment?.department?.name || 'General',
          branch: employee.employment?.branch?.name || 'Main Office',
          status: employee.status,
        },
        shift,
        policy: {
          name: policy.name,
          standardWorkMinutes: policy.standardWorkMinutes,
          fullDayThresholdMinutes: policy.fullDayThresholdMinutes,
          gracePeriodMinutes: policy.gracePeriodMinutes,
          timezone: policy.timezone,
        },
        summary,
        sessions: sanitizedSessions,
        exceptions,
      },
    };
  }

  async getTodaySummary() {
    return {
      date: new Date().toISOString().split('T')[0],
      totalEmployees: 72,
      present: 64,
      onLeave: 5,
      absent: 3,
      modes: {
        office: 52,
        officialVisit: 4,
        workFromHome: 8,
      },
    };
  }

  async getAttendancePolicy() {
    return {
      modesSupported: ['OFFICE', 'OFFICIAL_VISIT', 'WORK_FROM_HOME'],
      standardWorkHours: 8.5,
      gracePeriodMinutes: 15,
      geofenceValidationEnabled: true,
    };
  }

  // ===========================================================================
  // 9. MANAGER TEAM ATTENDANCE (PHASE 4 STEP 10)
  // ===========================================================================

  /**
   * Resolves the current manager's employee profile and their authorized direct/team reporting tree
   * according to Phase 3 hierarchy rules.
   */
  async resolveManagerTeam(user: AuthenticatedUser) {
    const managerEmployee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        employment: true,
      },
    });

    if (!managerEmployee) {
      return {
        managerEmployee: null,
        teamMemberIds: [],
        directReports: [],
      };
    }

    const team = await this.hierarchyService.getTeam(managerEmployee.id, user.organizationId);

    return {
      managerEmployee,
      teamMemberIds: team.allMemberIds,
      directReports: team.directReports,
    };
  }

  /**
   * Retrieves scoped manager team attendance summary, headcount status, and pending corrections count.
   */
  async getManagerTeamDashboard(user: AuthenticatedUser, dateStr?: string) {
    const { managerEmployee, teamMemberIds } = await this.resolveManagerTeam(user);

    const defaultResolution = await this.policiesService.resolveEffectivePolicyAndShift(
      managerEmployee?.id || 'default',
      new Date(),
      user.organizationId,
    );
    const timezone = defaultResolution.policy?.timezone || 'Asia/Kolkata';
    const cutoffHour = defaultResolution.policy?.workingDayStartHour ?? 5;

    const workingDateStr =
      dateStr || resolveWorkingDay(new Date(), cutoffHour, timezone).workingDateStr;
    const workingDateUtc = new Date(`${workingDateStr}T00:00:00.000Z`);

    if (!managerEmployee || teamMemberIds.length === 0) {
      return {
        success: true,
        message: 'Manager team attendance dashboard retrieved.',
        data: {
          date: workingDateStr,
          reportingTimestamp: new Date().toISOString(),
          timezone,
          cutoffHour,
          teamSize: 0,
          headcount: {
            totalTeamMembers: 0,
            checkedInNow: 0,
            present: 0,
            lateArrivals: 0,
            halfDay: 0,
            absent: 0,
            onLeave: 0,
            incomplete: 0,
            pendingReview: 0,
            notScheduled: 0,
            unresolvedExceptions: 0,
          },
          pendingCorrectionsCount: 0,
        },
      };
    }

    // Daily summaries strictly scoped to team member IDs
    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        employeeId: { in: teamMemberIds },
      },
      include: {
        shift: true,
      },
    });

    let present = 0;
    let lateArrivals = 0;
    let halfDay = 0;
    let absent = 0;
    let onLeave = 0;
    let incomplete = 0;
    let pendingReview = 0;
    let notScheduled = 0;

    for (const s of summaries) {
      if (s.status === 'PRESENT' || s.status === 'LATE') present++;
      if (s.lateMinutes > 0) lateArrivals++;
      if (s.status === 'HALF_DAY') halfDay++;
      if (s.status === 'ABSENT') absent++;
      if (s.status === 'ON_LEAVE') onLeave++;
      if (s.status === 'INCOMPLETE') incomplete++;
      if (s.status === 'PENDING_REVIEW') pendingReview++;
      if (s.status === 'NOT_SCHEDULED') notScheduled++;
    }

    // Checked-in now count for team
    const checkedInNow = await this.prisma.attendanceSession.count({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        status: 'OPEN',
        employeeId: { in: teamMemberIds },
      },
    });

    // Unresolved exceptions for team
    const unresolvedExceptions = await this.prisma.attendanceException.count({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        resolved: false,
        employeeId: { in: teamMemberIds },
      },
    });

    // Pending correction requests specifically for this manager's team
    const pendingCorrectionsCount = await this.prisma.attendanceCorrectionRequest.count({
      where: {
        organizationId: user.organizationId,
        status: 'PENDING',
        employeeId: { in: teamMemberIds },
      },
    });

    return {
      success: true,
      message: 'Manager team attendance dashboard retrieved.',
      data: {
        date: workingDateStr,
        reportingTimestamp: new Date().toISOString(),
        timezone,
        cutoffHour,
        teamSize: teamMemberIds.length,
        headcount: {
          totalTeamMembers: teamMemberIds.length,
          checkedInNow,
          present,
          lateArrivals,
          halfDay,
          absent,
          onLeave,
          incomplete,
          pendingReview,
          notScheduled,
          unresolvedExceptions,
        },
        pendingCorrectionsCount,
      },
    };
  }

  /**
   * Retrieves paginated attendance records strictly scoped to authorized team members
   * with search, filtering, and GPS coordinate privacy protection.
   */
  async getManagerTeamRecords(user: AuthenticatedUser, query: AttendanceOperationsQueryDto) {
    const { managerEmployee, teamMemberIds } = await this.resolveManagerTeam(user);

    const defaultResolution = await this.policiesService.resolveEffectivePolicyAndShift(
      managerEmployee?.id || 'default',
      new Date(),
      user.organizationId,
    );
    const timezone = defaultResolution.policy?.timezone || 'Asia/Kolkata';
    const cutoffHour = defaultResolution.policy?.workingDayStartHour ?? 5;

    const workingDateStr =
      query.date || resolveWorkingDay(new Date(), cutoffHour, timezone).workingDateStr;
    const workingDateUtc = new Date(`${workingDateStr}T00:00:00.000Z`);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    if (!managerEmployee || teamMemberIds.length === 0) {
      return {
        success: true,
        message: 'No team members reporting to current user.',
        data: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }

    // Scoped strictly to team members
    const employeeWhere: any = {
      id: { in: teamMemberIds },
      organizationId: user.organizationId,
      deletedAt: null,
      isActive: true,
    };

    if (query.search?.trim()) {
      const term = query.search.trim();
      employeeWhere.OR = [
        { displayName: { contains: term, mode: 'insensitive' } },
        { employeeCode: { contains: term, mode: 'insensitive' } },
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.status && query.status !== 'ALL') {
      const matchingSummaries = await this.prisma.attendanceDailySummary.findMany({
        where: {
          organizationId: user.organizationId,
          date: workingDateUtc,
          employeeId: { in: teamMemberIds },
          status: query.status as any,
        },
        select: { employeeId: true },
      });
      employeeWhere.id = { in: matchingSummaries.map((s) => s.employeeId) };
    }

    const totalCount = await this.prisma.employee.count({ where: employeeWhere });

    const employees = await this.prisma.employee.findMany({
      where: employeeWhere,
      skip,
      take: limit,
      orderBy: { displayName: 'asc' },
      include: {
        employment: {
          include: {
            branch: true,
            department: true,
            designation: true,
          },
        },
      },
    });

    const pageEmployeeIds = employees.map((e) => e.id);

    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        employeeId: { in: pageEmployeeIds },
      },
    });

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        employeeId: { in: pageEmployeeIds },
      },
      orderBy: { sessionNumber: 'asc' },
      include: {
        events: {
          orderBy: { eventTimestamp: 'asc' },
          include: { officeLocation: true },
        },
      },
    });

    const exceptions = await this.prisma.attendanceException.findMany({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        employeeId: { in: pageEmployeeIds },
      },
    });

    // Precise GPS privacy enforcement
    const canViewPreciseGps =
      user.roles?.includes('ADMIN' as any) ||
      user.permissions?.includes('ATTENDANCE_VIEW_GPS') ||
      false;

    const records = employees.map((emp) => {
      const summary = summaries.find((s) => s.employeeId === emp.id) || null;
      const empSessions = sessions.filter((s) => s.employeeId === emp.id);
      const activeSession = empSessions.find((s) => s.status === 'OPEN') || null;
      const empExceptions = exceptions.filter((e) => e.employeeId === emp.id);

      const latestCheckInEvent = empSessions
        .flatMap((s) => s.events)
        .filter((e) => e.eventType === 'CHECK_IN')
        .pop();

      return {
        employee: {
          id: emp.id,
          employeeCode: emp.employeeCode,
          displayName: emp.displayName,
          designation: emp.employment?.designation?.title || 'Staff',
          department: emp.employment?.department?.name || 'General',
          branch: emp.employment?.branch?.name || 'Main Office',
        },
        summary: summary
          ? {
              status: summary.status,
              firstCheckIn: summary.firstCheckIn,
              lastCheckOut: summary.lastCheckOut,
              totalWorkMinutes: summary.totalWorkMinutes,
              totalBreakMinutes: summary.totalBreakMinutes,
              netHours: Math.round((summary.totalWorkMinutes / 60) * 100) / 100,
              lateMinutes: summary.lateMinutes,
              earlyExitMinutes: summary.earlyExitMinutes,
              overtimeMinutes: summary.overtimeMinutes,
              isCorrected: summary.isCorrected,
            }
          : {
              status: 'NOT_SCHEDULED',
              firstCheckIn: null,
              lastCheckOut: null,
              totalWorkMinutes: 0,
              totalBreakMinutes: 0,
              netHours: 0,
              lateMinutes: 0,
              earlyExitMinutes: 0,
              overtimeMinutes: 0,
              isCorrected: false,
            },
        activeSession: activeSession
          ? {
              id: activeSession.id,
              sessionNumber: activeSession.sessionNumber,
              checkInTime: activeSession.checkInTime,
              status: activeSession.status,
            }
          : null,
        sessionCount: empSessions.length,
        exceptionCount: empExceptions.length,
        locationVerification: latestCheckInEvent
          ? {
              officeName: latestCheckInEvent.officeLocation?.name || 'Office',
              geofenceStatus: latestCheckInEvent.geofenceStatus,
              distanceMeters: latestCheckInEvent.distanceFromOfficeMeters,
              latitude: canViewPreciseGps ? latestCheckInEvent.latitude : null,
              longitude: canViewPreciseGps ? latestCheckInEvent.longitude : null,
              isGpsRedacted: !canViewPreciseGps,
            }
          : null,
      };
    });

    return {
      success: true,
      message: 'Manager team attendance records retrieved successfully.',
      data: records,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  }

  /**
   * Retrieves pending attendance correction requests submitted by manager's team members.
   */
  async getManagerTeamCorrections(user: AuthenticatedUser) {
    const { managerEmployee, teamMemberIds } = await this.resolveManagerTeam(user);

    if (!managerEmployee || teamMemberIds.length === 0) {
      return {
        success: true,
        message: 'No pending correction requests for current manager.',
        data: [],
      };
    }

    const requests = await this.prisma.attendanceCorrectionRequest.findMany({
      where: {
        organizationId: user.organizationId,
        employeeId: { in: teamMemberIds },
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            displayName: true,
            employment: {
              include: {
                designation: true,
                department: true,
              },
            },
          },
        },
        decision: true,
      },
    });

    return {
      success: true,
      message: 'Manager team correction requests retrieved successfully.',
      data: requests.map(enrichCorrectionRequest),
    };
  }

  /**
   * Retrieves all organizational correction requests for HR/Admin review.
   */
  async getOperationsCorrections(organizationId: string, status?: string) {
    const where: any = { organizationId };
    if (status && status !== 'ALL') {
      where.status = status;
    }

    const requests = await this.prisma.attendanceCorrectionRequest.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
            employeeCode: true,
            displayName: true,
            employment: {
              include: {
                designation: true,
                department: true,
                branch: true,
              },
            },
          },
        },
        decision: true,
      },
    });

    return {
      success: true,
      message: 'Organizational correction requests retrieved successfully.',
      data: requests.map(enrichCorrectionRequest),
    };
  }

  /**
   * Approves or rejects an attendance correction request.
   * Strictly enforces:
   * 1. Self-approval prevention (anti-fraud)
   * 2. Cross-team hierarchy boundary (managers can only decide direct/indirect reports)
   * 3. Cross-org tenant boundary
   * 4. Idempotency / Duplicate decision prevention (request must be in PENDING state)
   * 5. Raw event immutability (punches are preserved, daily summary projection is safely corrected)
   */
  async decideCorrectionRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: DecideCorrectionRequestDto,
  ) {
    // 1. Cross-org check (Tenant boundary)
    const request = await this.prisma.attendanceCorrectionRequest.findFirst({
      where: {
        id: requestId,
        organizationId: user.organizationId,
      },
      include: {
        employee: true,
      },
    });

    if (!request) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Attendance correction request not found in this organization.',
        code: 'CORRECTION_REQUEST_NOT_FOUND',
      });
    }

    // 2. Prevent self-approval (crucial compliance & anti-fraud rule)
    if (request.employee?.userId === user.id) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'Self-approval is strictly prohibited. Your correction request must be approved by another manager or HR administrator.',
        code: 'FORBIDDEN_SELF_APPROVAL',
      });
    }

    // 3. Cross-team & hierarchy validation
    const isGlobalOrAdmin =
      user.roles?.includes('ADMIN' as any) || user.roles?.includes('HR' as any);

    if (!isGlobalOrAdmin) {
      const managerEmployee = await this.prisma.employee.findFirst({
        where: {
          userId: user.id,
          organizationId: user.organizationId,
          deletedAt: null,
        },
      });

      if (!managerEmployee) {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'No manager employee profile linked to current user account.',
          code: 'FORBIDDEN_NOT_MANAGER',
        });
      }

      if (managerEmployee.id === request.employeeId) {
        throw new ForbiddenException({
          statusCode: 403,
          message:
            'Self-approval is strictly prohibited. Your correction request must be approved by another manager or HR administrator.',
          code: 'FORBIDDEN_SELF_APPROVAL',
        });
      }

      const isSubordinate = await this.hierarchyService.isManagerOf(
        managerEmployee.id,
        request.employeeId,
        user.organizationId,
      );

      if (!isSubordinate) {
        throw new ForbiddenException({
          statusCode: 403,
          message:
            'Access denied: You are not authorized to decide correction requests for employees outside your reporting hierarchy.',
          code: 'FORBIDDEN_OUTSIDE_HIERARCHY',
        });
      }
    }

    // 4. Duplicate decisions & concurrency check
    if (request.status !== 'PENDING') {
      throw new ConflictException({
        statusCode: 409,
        message: `This correction request has already been ${request.status.toLowerCase()}. Duplicate decisions are not permitted.`,
        code: 'CORRECTION_ALREADY_DECIDED',
      });
    }

    const summary = await this.prisma.attendanceDailySummary.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId: user.organizationId,
          employeeId: request.employeeId,
          date: request.targetDate,
        },
      },
    });

    const originalWorkMinutes = summary?.totalWorkMinutes ?? 0;
    let correctedWorkMinutes = originalWorkMinutes;

    const resolution = await this.policiesService.resolveEffectivePolicyAndShift(
      request.employeeId,
      request.targetDate,
      user.organizationId,
    );
    const breakMinutes =
      resolution.shift?.breakDurationMinutes ?? resolution.policy?.maxDailyBreakMinutes ?? 60;
    const fullDayThreshold = resolution.policy?.fullDayThresholdMinutes ?? 420;
    const halfDayThreshold = resolution.policy?.halfDayThresholdMinutes ?? 240;

    let finalStatus: AttendanceDayStatus = summary?.status || 'PRESENT';

    if (dto.decision === 'APPROVED') {
      if (request.requestedCheckIn && request.requestedCheckOut) {
        const inMs = new Date(request.requestedCheckIn).getTime();
        const outMs = new Date(request.requestedCheckOut).getTime();
        const grossMinutes = Math.max(0, Math.round((outMs - inMs) / 60000));
        correctedWorkMinutes = Math.max(0, grossMinutes - breakMinutes);
      } else if (originalWorkMinutes === 0) {
        correctedWorkMinutes = resolution.policy?.standardWorkMinutes ?? 480;
      }

      finalStatus =
        correctedWorkMinutes >= fullDayThreshold
          ? 'PRESENT'
          : correctedWorkMinutes >= halfDayThreshold
            ? 'HALF_DAY'
            : 'PRESENT';

      const dateStr = request.targetDate.toISOString().split('T')[0];
      const reviewerName = user.firstName
        ? `${user.firstName} ${user.lastName || ''}`.trim()
        : 'Manager';

      // Safe summary upsert - PRESERVES RAW ATTENDANCE EVENTS INTACT
      await this.prisma.attendanceDailySummary.upsert({
        where: {
          organizationId_employeeId_date: {
            organizationId: user.organizationId,
            employeeId: request.employeeId,
            date: request.targetDate,
          },
        },
        create: {
          organizationId: user.organizationId,
          employeeId: request.employeeId,
          date: request.targetDate,
          status: finalStatus,
          firstCheckIn: request.requestedCheckIn || new Date(`${dateStr}T09:00:00.000Z`),
          lastCheckOut: request.requestedCheckOut || new Date(`${dateStr}T18:00:00.000Z`),
          totalWorkMinutes: correctedWorkMinutes,
          totalBreakMinutes: breakMinutes,
          isCorrected: true,
          correctionNotes: `[Approved by ${reviewerName}]: ${dto.reviewNotes || 'Approved by reviewer'}`,
        },
        update: {
          status: finalStatus,
          firstCheckIn: request.requestedCheckIn || undefined,
          lastCheckOut: request.requestedCheckOut || undefined,
          totalWorkMinutes: correctedWorkMinutes,
          totalBreakMinutes: breakMinutes,
          isCorrected: true,
          correctionNotes: `[Approved by ${reviewerName}]: ${dto.reviewNotes || 'Approved by reviewer'}`,
        },
      });
    }

    // Upsert decision record
    await this.prisma.attendanceCorrectionDecision.upsert({
      where: { requestId: request.id },
      create: {
        requestId: request.id,
        reviewerId: user.id,
        decision: dto.decision as any,
        originalWorkMinutes,
        correctedWorkMinutes: dto.decision === 'APPROVED' ? correctedWorkMinutes : 0,
        reviewNotes: dto.reviewNotes || `${dto.decision} by reviewer`,
      },
      update: {
        reviewerId: user.id,
        decision: dto.decision as any,
        originalWorkMinutes,
        correctedWorkMinutes: dto.decision === 'APPROVED' ? correctedWorkMinutes : 0,
        reviewNotes: dto.reviewNotes || `${dto.decision} by reviewer`,
        decidedAt: new Date(),
      },
    });

    const updatedRequest = await this.prisma.attendanceCorrectionRequest.update({
      where: { id: request.id },
      data: { status: dto.decision as any },
      include: {
        decision: true,
        employee: true,
      },
    });

    // Auto-resolve or dismiss matching pending correction and missing checkout exceptions
    await this.prisma.attendanceException
      .updateMany({
        where: {
          organizationId: user.organizationId,
          employeeId: request.employeeId,
          date: request.targetDate,
          exceptionType: { in: ['PENDING_CORRECTION', 'MISSING_CHECKOUT'] },
          status: 'OPEN',
        },
        data: {
          status: dto.decision === 'APPROVED' ? 'RESOLVED' : 'DISMISSED',
          resolved: true,
          resolvedAt: new Date(),
          resolvedById: user.id,
          resolutionNotes: `Auto-resolved via correction decision ${dto.decision}: ${dto.reviewNotes || 'Decided by reviewer'}`,
        },
      })
      .catch(() => null);

    await this.auditService.record({
      action: 'ATTENDANCE_CORRECTION_DECIDED',
      entity: 'AttendanceCorrectionRequest',
      entityId: request.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        employeeId: request.employeeId,
        decision: dto.decision,
        originalWorkMinutes,
        correctedWorkMinutes: dto.decision === 'APPROVED' ? correctedWorkMinutes : 0,
        reviewNotes: dto.reviewNotes,
        reviewerId: user.id,
      },
    });

    return {
      success: true,
      message: `Correction request ${dto.decision.toLowerCase()} successfully.`,
      data: enrichCorrectionRequest(updatedRequest),
    };
  }

  /**
   * Retrieves detailed timeline for a team employee, strictly validating manager hierarchy authorization.
   */
  async getManagerEmployeeDetail(user: AuthenticatedUser, employeeId: string, dateStr?: string) {
    // 1. Cross-org check
    const targetEmployee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!targetEmployee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Employee not found in this organization.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    // 2. Cross-team & hierarchy validation
    const isGlobalOrAdmin =
      user.roles?.includes('ADMIN' as any) || user.roles?.includes('HR' as any);

    if (!isGlobalOrAdmin) {
      const managerEmployee = await this.prisma.employee.findFirst({
        where: {
          userId: user.id,
          organizationId: user.organizationId,
          deletedAt: null,
        },
      });

      if (!managerEmployee) {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'No manager profile linked to current user account.',
          code: 'FORBIDDEN_NOT_MANAGER',
        });
      }

      const isSubordinate = await this.hierarchyService.isManagerOf(
        managerEmployee.id,
        employeeId,
        user.organizationId,
      );

      if (!isSubordinate) {
        throw new ForbiddenException({
          statusCode: 403,
          message:
            'Access denied: You are not authorized to view attendance details for an employee outside your reporting hierarchy.',
          code: 'FORBIDDEN_OUTSIDE_HIERARCHY',
        });
      }
    }

    // Return sanitized operations employee detail
    return this.getOperationsEmployeeDetail(user, employeeId, dateStr);
  }

  // ===========================================================================
  // 12. ATTENDANCE EXCEPTIONS MANAGEMENT & RESOLUTION WORKFLOW
  // ===========================================================================

  /**
   * Retrieves paginated attendance exceptions for HR with multi-dimensional filters & KPIs
   */
  async getExceptions(organizationId: string, query: AttendanceExceptionQueryDto) {
    const where: any = { organizationId };

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query.exceptionType) {
      where.exceptionType = query.exceptionType;
    }

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) {
        where.date.gte = new Date(`${query.startDate}T00:00:00.000Z`);
      }
      if (query.endDate) {
        where.date.lte = new Date(`${query.endDate}T23:59:59.999Z`);
      }
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [exceptions, total, openCount, resolvedCount, dismissedCount, highCount] =
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
                firstName: true,
                lastName: true,
                displayName: true,
                user: {
                  select: { email: true },
                },
                employment: {
                  select: {
                    department: { select: { id: true, name: true } },
                    designation: { select: { id: true, name: true } },
                  },
                },
              },
            },
            resolvedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        }),
        this.prisma.attendanceException.count({ where }),
        this.prisma.attendanceException.count({ where: { organizationId, status: 'OPEN' } }),
        this.prisma.attendanceException.count({ where: { organizationId, status: 'RESOLVED' } }),
        this.prisma.attendanceException.count({ where: { organizationId, status: 'DISMISSED' } }),
        this.prisma.attendanceException.count({
          where: { organizationId, severity: 'HIGH', status: 'OPEN' },
        }),
      ]);

    const formatted = exceptions.map((e: any) => {
      const rawDetails: Record<string, any> =
        e.details && typeof e.details === 'object' ? { ...(e.details as any) } : {};
      delete rawDetails.latitude;
      delete rawDetails.longitude;
      delete rawDetails.password;
      delete rawDetails.token;

      return {
        id: e.id,
        organizationId: e.organizationId,
        employeeId: e.employeeId,
        employee: e.employee
          ? {
              id: e.employee.id,
              employeeCode: e.employee.employeeCode,
              employeeNumber: e.employee.employeeCode,
              firstName: e.employee.firstName,
              lastName: e.employee.lastName,
              displayName: e.employee.displayName,
              email: e.employee.user?.email || null,
              department: e.employee.employment?.department || null,
              designation: e.employee.employment?.designation || null,
            }
          : null,
        date: e.date.toISOString().split('T')[0],
        exceptionType: e.exceptionType,
        severity: e.severity,
        status: e.status || (e.resolved ? 'RESOLVED' : 'OPEN'),
        details: rawDetails,
        resolved: e.resolved,
        resolvedAt: e.resolvedAt?.toISOString() || null,
        resolvedById: e.resolvedById,
        resolvedBy: e.resolvedBy,
        resolutionNotes: e.resolutionNotes,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      };
    });

    return {
      success: true,
      data: formatted,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      counts: {
        open: openCount,
        resolved: resolvedCount,
        dismissed: dismissedCount,
        highSeverity: highCount,
      },
    };
  }

  /**
   * Retrieves single exception by ID
   */
  async getExceptionById(organizationId: string, id: string) {
    const exception = await this.prisma.attendanceException.findFirst({
      where: { id, organizationId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            user: {
              select: { email: true },
            },
            employment: {
              select: {
                department: { select: { id: true, name: true } },
                designation: { select: { id: true, name: true } },
              },
            },
          },
        },
        resolvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!exception) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Attendance exception not found.',
        code: 'EXCEPTION_NOT_FOUND',
      });
    }

    const rawDetails: Record<string, any> =
      exception.details && typeof exception.details === 'object'
        ? { ...(exception.details as any) }
        : {};
    delete rawDetails.latitude;
    delete rawDetails.longitude;
    delete rawDetails.password;
    delete rawDetails.token;

    const emp = (exception as any).employee;
    return {
      success: true,
      data: {
        ...exception,
        details: rawDetails,
        employee: emp
          ? {
              id: emp.id,
              employeeCode: emp.employeeCode,
              employeeNumber: emp.employeeCode,
              firstName: emp.firstName,
              lastName: emp.lastName,
              displayName: emp.displayName,
              email: emp.user?.email || null,
              department: emp.employment?.department || null,
              designation: emp.employment?.designation || null,
            }
          : null,
        date: exception.date.toISOString().split('T')[0],
        status: exception.status || (exception.resolved ? 'RESOLVED' : 'OPEN'),
      },
    };
  }

  /**
   * Resolves or dismisses an attendance exception with actor audit notes and employee notification
   */
  async resolveException(user: AuthenticatedUser, id: string, dto: ResolveExceptionDto) {
    const exception = await this.prisma.attendanceException.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { employee: true },
    });

    if (!exception) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Attendance exception not found.',
        code: 'EXCEPTION_NOT_FOUND',
      });
    }

    if (exception.status === dto.status) {
      throw new ConflictException({
        statusCode: 409,
        message: `Exception has already been marked as ${dto.status}.`,
        code: 'EXCEPTION_ALREADY_DECIDED',
      });
    }

    const updated = await this.prisma.attendanceException.update({
      where: { id },
      data: {
        status: dto.status,
        resolved: true,
        resolvedAt: new Date(),
        resolvedById: user.id,
        resolutionNotes: dto.resolutionNotes.trim(),
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
        resolvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // In-app notification to employee
    if (this.notificationsService && exception.employee?.userId) {
      await this.notificationsService
        .createNotification({
          userId: exception.employee.userId,
          organizationId: user.organizationId,
          title: `Attendance Exception ${dto.status === 'RESOLVED' ? 'Resolved' : 'Dismissed'}`,
          message: `Your ${exception.exceptionType.replace(/_/g, ' ')} exception for ${exception.date.toISOString().split('T')[0]} has been ${dto.status.toLowerCase()}. Notes: ${dto.resolutionNotes.trim()}`,
          type: 'EXCEPTION_RESOLVED',
          metadata: { exceptionId: id, status: dto.status },
        })
        .catch((err) =>
          this.logger.warn(`Failed to dispatch employee notification: ${err.message}`),
        );
    }

    // Audit log
    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action:
        dto.status === 'RESOLVED'
          ? 'ATTENDANCE_EXCEPTION_RESOLVED'
          : 'ATTENDANCE_EXCEPTION_DISMISSED',
      entity: 'AttendanceException',
      entityId: id,
      metadata: {
        employeeId: exception.employeeId,
        exceptionType: exception.exceptionType,
        previousStatus: exception.status,
        newStatus: dto.status,
        resolutionNotes: dto.resolutionNotes.trim(),
      },
    });

    return {
      success: true,
      message: `Attendance exception successfully marked as ${dto.status.toLowerCase()}.`,
      data: updated,
    };
  }

  /**
   * Scans and flags attendance exceptions for a target working date across organization
   */
  async scanExceptions(organizationId: string, targetDateStr?: string) {
    const dateStr = targetDateStr || new Date().toISOString().split('T')[0];
    const dateUtc = new Date(`${dateStr}T00:00:00.000Z`);

    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where: { organizationId, date: dateUtc },
      include: { employee: true, shift: true },
    });

    let detectedCount = 0;

    for (const s of summaries) {
      // 1. Late arrival
      if (s.lateMinutes > 0) {
        await this.recordAttendanceException({
          organizationId,
          employeeId: s.employeeId,
          date: dateUtc,
          exceptionType: 'LATE_ARRIVAL',
          severity: s.lateMinutes > 60 ? 'MEDIUM' : 'LOW',
          details: {
            lateMinutes: s.lateMinutes,
            shiftStartTime: s.shift?.startTime || '09:00',
            firstCheckIn: s.firstCheckIn?.toISOString(),
          },
          idempotencyKey: `ex:late_arrival:${s.employeeId}:${dateStr}`,
        });
        detectedCount++;
      }

      // 2. Early departure
      if (s.earlyExitMinutes > 0) {
        await this.recordAttendanceException({
          organizationId,
          employeeId: s.employeeId,
          date: dateUtc,
          exceptionType: 'EARLY_DEPARTURE',
          severity: s.earlyExitMinutes > 60 ? 'MEDIUM' : 'LOW',
          details: {
            earlyExitMinutes: s.earlyExitMinutes,
            shiftEndTime: s.shift?.endTime || '18:00',
            lastCheckOut: s.lastCheckOut?.toISOString(),
          },
          idempotencyKey: `ex:early_departure:${s.employeeId}:${dateStr}`,
        });
        detectedCount++;
      }

      // 3. Missing checkout (INCOMPLETE status)
      if (s.status === 'INCOMPLETE') {
        await this.recordAttendanceException({
          organizationId,
          employeeId: s.employeeId,
          date: dateUtc,
          exceptionType: 'MISSING_CHECKOUT',
          severity: 'MEDIUM',
          details: {
            summaryId: s.id,
            firstCheckIn: s.firstCheckIn?.toISOString(),
            message: 'Incomplete session: missing checkout punch',
          },
          idempotencyKey: `ex:missing_checkout:summary:${s.id}`,
        });
        detectedCount++;
      }
    }

    return {
      success: true,
      message: `Exception scan completed for date ${dateStr}. Detected ${detectedCount} potential exception instances.`,
      scannedSummariesCount: summaries.length,
      detectedCount,
    };
  }

  /**
   * Retrieves aggregated data-backed overview of official visits, field activity, WFH requests,
   * pending approvals, exceptions, completed visits, and attendance modes.
   * Strictly enforces caller scope (managers see only their reporting tree, HR/Admin can query org or filter).
   * Distinguishes approved requests from actual checked-in sessions.
   */
  async getRemoteAndFieldOverview(user: AuthenticatedUser, query: RemoteFieldOverviewQueryDto) {
    const isManagerOnly =
      user.roles.includes('MANAGER' as any) &&
      !user.roles.includes('ADMIN' as any) &&
      !user.roles.includes('HR' as any);

    let scopedEmployeeIds: string[] | null = null;
    let managerEmployee: any = null;

    if (isManagerOnly) {
      const teamRes = await this.resolveManagerTeam(user);
      managerEmployee = teamRes.managerEmployee;
      scopedEmployeeIds = teamRes.teamMemberIds;
    } else if (query.managerId) {
      const team = await this.hierarchyService.getTeam(query.managerId, user.organizationId);
      scopedEmployeeIds = team.allMemberIds;
    }

    const defaultResolution = await this.policiesService.resolveEffectivePolicyAndShift(
      managerEmployee?.id || 'default',
      new Date(),
      user.organizationId,
    );
    const timezone = defaultResolution.policy?.timezone || 'Asia/Kolkata';
    const cutoffHour = defaultResolution.policy?.workingDayStartHour ?? 5;

    const workingDateStr =
      query.date || resolveWorkingDay(new Date(), cutoffHour, timezone).workingDateStr;
    const workingDateUtc = new Date(`${workingDateStr}T00:00:00.000Z`);
    const endOfDayUtc = new Date(`${workingDateStr}T23:59:59.999Z`);

    // Handle optional date range
    let rangeFilter: any = null;
    if (query.startDate && query.endDate) {
      rangeFilter = {
        gte: new Date(`${query.startDate}T00:00:00.000Z`),
        lte: new Date(`${query.endDate}T23:59:59.999Z`),
      };
    }

    // Build base employee filter
    const baseEmployeeWhere: any = {
      organizationId: user.organizationId,
      deletedAt: null,
      isActive: true,
    };
    if (scopedEmployeeIds !== null) {
      baseEmployeeWhere.id = { in: scopedEmployeeIds };
    }
    if (query.branchId) {
      baseEmployeeWhere.employment = { ...baseEmployeeWhere.employment, branchId: query.branchId };
    }
    if (query.departmentId) {
      baseEmployeeWhere.employment = {
        ...baseEmployeeWhere.employment,
        departmentId: query.departmentId,
      };
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      baseEmployeeWhere.OR = [
        { displayName: { contains: term, mode: 'insensitive' } },
        { employeeCode: { contains: term, mode: 'insensitive' } },
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ];
    }

    // If manager has 0 subordinates, return structured empty payload
    if (isManagerOnly && (!scopedEmployeeIds || scopedEmployeeIds.length === 0)) {
      return {
        success: true,
        message: 'Remote and field overview retrieved (no subordinates assigned).',
        data: this.buildEmptyOverviewData(workingDateStr, timezone),
      };
    }

    // 1. OFFICIAL VISITS BY STATUS
    const visitWhere: any = {
      organizationId: user.organizationId,
      employee: baseEmployeeWhere,
    };
    if (query.status && query.status !== 'ALL') {
      visitWhere.status = query.status as any;
    }
    if (rangeFilter) {
      visitWhere.startDate = { lte: rangeFilter.lte };
      visitWhere.endDate = { gte: rangeFilter.gte };
    }

    const visitStatusCountsRaw = await this.prisma.officialVisit.groupBy({
      by: ['status'],
      where: visitWhere,
      _count: { id: true },
    });

    const visitsByStatus: Record<string, number> = {
      DRAFT: 0,
      SUBMITTED: 0,
      APPROVED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      REJECTED: 0,
      EXPIRED: 0,
      total: 0,
    };
    for (const item of visitStatusCountsRaw) {
      if (visitsByStatus[item.status] !== undefined) {
        visitsByStatus[item.status] = item._count.id;
      }
      visitsByStatus.total += item._count.id;
    }

    // 2. TODAY'S FIELD ACTIVITY
    // A: Approved/In-Progress visits scheduled for workingDateUtc
    const approvedVisitsTodayList = await this.prisma.officialVisit.findMany({
      where: {
        organizationId: user.organizationId,
        employee: baseEmployeeWhere,
        status: { in: [VisitStatus.APPROVED, VisitStatus.IN_PROGRESS] },
        startDate: { lte: endOfDayUtc },
        endDate: { gte: workingDateUtc },
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
        destinations: true,
      },
    });

    // B: Actual sessions punched with mode OFFICIAL_VISIT today
    const fieldSessionsToday = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        attendanceMode: AttendanceMode.OFFICIAL_VISIT,
        employee: baseEmployeeWhere,
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
        officialVisit: {
          include: { destinations: true },
        },
        events: {
          where: { eventType: 'CHECK_IN' },
          take: 1,
        },
      },
    });

    const fieldCheckedInEmployeeIds = new Set(fieldSessionsToday.map((s) => s.employeeId));
    const approvedVisitsTodayCount = approvedVisitsTodayList.length;
    const fieldCheckedInTodayCount = fieldCheckedInEmployeeIds.size;
    const activeFieldSessionsNow = fieldSessionsToday.filter((s) => s.status === 'OPEN').length;
    const fieldNotCheckedInTodayCount = Math.max(
      0,
      approvedVisitsTodayCount - fieldCheckedInTodayCount,
    );

    // Detail items for field activity table
    const todayFieldDuties = approvedVisitsTodayList.map((visit) => {
      const activeSession = fieldSessionsToday.find((s) => s.employeeId === visit.employeeId);
      const isCheckedIn = !!activeSession;
      return {
        id: visit.id,
        employee: visit.employee,
        title: visit.title,
        purpose: visit.purpose,
        status: visit.status,
        startDate: visit.startDate,
        endDate: visit.endDate,
        expectedDurationDays: visit.expectedDurationDays,
        destinations: visit.destinations,
        attendanceStatus: isCheckedIn ? 'CHECKED_IN' : 'AUTHORIZED_NOT_CHECKED_IN',
        session: activeSession
          ? {
              id: activeSession.id,
              status: activeSession.status,
              checkInTime: activeSession.checkInTime,
              checkOutTime: activeSession.checkOutTime,
              totalWorkMinutes: activeSession.totalWorkMinutes,
              firstEvent: activeSession.events[0] || null,
            }
          : null,
      };
    });

    // 3. WFH REQUESTS (STATUS & DURATION BREAKDOWN)
    const wfhWhere: any = {
      organizationId: user.organizationId,
      employee: baseEmployeeWhere,
    };
    if (query.status && query.status !== 'ALL') {
      wfhWhere.status = query.status as any;
    }
    if (rangeFilter) {
      wfhWhere.startDate = { lte: rangeFilter.lte };
      wfhWhere.endDate = { gte: rangeFilter.gte };
    }

    const wfhStatusCountsRaw = await this.prisma.wfhRequest.groupBy({
      by: ['status'],
      where: wfhWhere,
      _count: { id: true },
    });

    const wfhDurationCountsRaw = await this.prisma.wfhRequest.groupBy({
      by: ['durationType'],
      where: wfhWhere,
      _count: { id: true },
    });

    const wfhByStatus: Record<string, number> = {
      SUBMITTED: 0,
      APPROVED: 0,
      REJECTED: 0,
      CANCELLED: 0,
      COMPLETED: 0,
      total: 0,
    };
    for (const item of wfhStatusCountsRaw) {
      if (wfhByStatus[item.status] !== undefined) {
        wfhByStatus[item.status] = item._count.id;
      }
      wfhByStatus.total += item._count.id;
    }

    const wfhByDuration: Record<string, number> = {
      FULL_DAY: 0,
      FIRST_HALF: 0,
      SECOND_HALF: 0,
      CUSTOM_RANGE: 0,
    };
    for (const item of wfhDurationCountsRaw) {
      if (wfhByDuration[item.durationType] !== undefined) {
        wfhByDuration[item.durationType] = item._count.id;
      }
    }

    // Approved WFH requests active today
    const approvedWfhTodayList = await this.prisma.wfhRequest.findMany({
      where: {
        organizationId: user.organizationId,
        employee: baseEmployeeWhere,
        status: WfhStatus.APPROVED,
        startDate: { lte: endOfDayUtc },
        endDate: { gte: workingDateUtc },
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
      },
    });

    // Actual sessions punched with mode WFH today
    const wfhSessionsToday = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        date: workingDateUtc,
        attendanceMode: AttendanceMode.WFH,
        employee: baseEmployeeWhere,
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
      },
    });

    const wfhCheckedInEmployeeIds = new Set(wfhSessionsToday.map((s) => s.employeeId));
    const approvedWfhTodayCount = approvedWfhTodayList.length;
    const wfhCheckedInTodayCount = wfhCheckedInEmployeeIds.size;
    const activeWfhSessionsNow = wfhSessionsToday.filter((s) => s.status === 'OPEN').length;
    const wfhNotCheckedInTodayCount = Math.max(0, approvedWfhTodayCount - wfhCheckedInTodayCount);

    const todayWfhDuties = approvedWfhTodayList.map((req) => {
      const activeSession = wfhSessionsToday.find((s) => s.employeeId === req.employeeId);
      const isCheckedIn = !!activeSession;
      return {
        id: req.id,
        employee: req.employee,
        startDate: req.startDate,
        endDate: req.endDate,
        durationType: req.durationType,
        reason: req.reason,
        status: req.status,
        attendanceStatus: isCheckedIn ? 'CHECKED_IN' : 'AUTHORIZED_NOT_CHECKED_IN',
        session: activeSession
          ? {
              id: activeSession.id,
              status: activeSession.status,
              checkInTime: activeSession.checkInTime,
              checkOutTime: activeSession.checkOutTime,
              totalWorkMinutes: activeSession.totalWorkMinutes,
            }
          : null,
      };
    });

    // 4. PENDING APPROVALS QUEUE
    const pendingVisitsList = await this.prisma.officialVisit.findMany({
      where: {
        organizationId: user.organizationId,
        employee: baseEmployeeWhere,
        status: VisitStatus.SUBMITTED,
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
        destinations: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const pendingVisitsCount = await this.prisma.officialVisit.count({
      where: {
        organizationId: user.organizationId,
        employee: baseEmployeeWhere,
        status: VisitStatus.SUBMITTED,
      },
    });

    const pendingWfhList = await this.prisma.wfhRequest.findMany({
      where: {
        organizationId: user.organizationId,
        employee: baseEmployeeWhere,
        status: WfhStatus.SUBMITTED,
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
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const pendingWfhCount = await this.prisma.wfhRequest.count({
      where: {
        organizationId: user.organizationId,
        employee: baseEmployeeWhere,
        status: WfhStatus.SUBMITTED,
      },
    });

    const pendingCorrectionsCount = await this.prisma.attendanceCorrectionRequest.count({
      where: {
        organizationId: user.organizationId,
        employee: baseEmployeeWhere,
        status: 'PENDING',
      },
    });

    // 5. ATTENDANCE EXCEPTIONS
    const exceptionsWhere: any = {
      organizationId: user.organizationId,
      employee: baseEmployeeWhere,
      date: rangeFilter ? rangeFilter : workingDateUtc,
    };

    const exceptionsList = await this.prisma.attendanceException.findMany({
      where: exceptionsWhere,
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
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const totalExceptionsCount = await this.prisma.attendanceException.count({
      where: exceptionsWhere,
    });
    const unresolvedExceptionsCount = await this.prisma.attendanceException.count({
      where: { ...exceptionsWhere, resolved: false },
    });

    const exceptionsByTypeRaw = await this.prisma.attendanceException.groupBy({
      by: ['exceptionType'],
      where: exceptionsWhere,
      _count: { id: true },
    });
    const exceptionsByType: Record<string, number> = {};
    for (const ex of exceptionsByTypeRaw) {
      exceptionsByType[ex.exceptionType] = ex._count.id;
    }

    // 6. COMPLETED VISITS
    const completedVisitsWhere: any = {
      organizationId: user.organizationId,
      employee: baseEmployeeWhere,
      status: VisitStatus.COMPLETED,
    };
    if (rangeFilter) {
      completedVisitsWhere.startDate = { lte: rangeFilter.lte };
      completedVisitsWhere.endDate = { gte: rangeFilter.gte };
    }

    const completedVisitsCount = await this.prisma.officialVisit.count({
      where: completedVisitsWhere,
    });

    const completedVisitsList = await this.prisma.officialVisit.findMany({
      where: completedVisitsWhere,
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
        destinations: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    // 7. ACTUAL ATTENDANCE MODES BREAKDOWN
    const attendanceEventsToday = await this.prisma.attendanceEvent.findMany({
      where: {
        organizationId: user.organizationId,
        session: { date: workingDateUtc },
        eventType: 'CHECK_IN',
        employee: baseEmployeeWhere,
      },
      select: { attendanceMode: true, employeeId: true },
    });

    const attendanceModes = {
      office: attendanceEventsToday.filter((e) => e.attendanceMode === AttendanceMode.OFFICE)
        .length,
      officialVisit: attendanceEventsToday.filter(
        (e) => e.attendanceMode === AttendanceMode.OFFICIAL_VISIT,
      ).length,
      workFromHome: attendanceEventsToday.filter((e) => e.attendanceMode === AttendanceMode.WFH)
        .length,
      total: attendanceEventsToday.length,
    };

    // 8. REQUESTS VS ATTENDANCE RECONCILIATION
    const requestsVsAttendance = {
      fieldDuty: {
        authorizedRequests: approvedVisitsTodayCount,
        actualCheckedInAttendance: fieldCheckedInTodayCount,
        activeNow: activeFieldSessionsNow,
        notCheckedInYet: fieldNotCheckedInTodayCount,
      },
      workFromHome: {
        authorizedRequests: approvedWfhTodayCount,
        actualCheckedInAttendance: wfhCheckedInTodayCount,
        activeNow: activeWfhSessionsNow,
        notCheckedInYet: wfhNotCheckedInTodayCount,
      },
      reconciliationMessage:
        'Approved requests represent administrative duty authorizations. Actual attendance is accredited strictly upon recorded punch events.',
    };

    return {
      success: true,
      message: 'Remote and field overview retrieved successfully.',
      data: {
        date: workingDateStr,
        reportingTimestamp: new Date().toISOString(),
        timezone,
        cutoffHour,
        visitsByStatus,
        todayFieldActivity: {
          approvedVisitsToday: approvedVisitsTodayCount,
          fieldCheckedInToday: fieldCheckedInTodayCount,
          activeFieldSessionsNow,
          fieldNotCheckedInToday: fieldNotCheckedInTodayCount,
          duties: todayFieldDuties,
        },
        wfhRequests: {
          byStatus: wfhByStatus,
          byDuration: wfhByDuration,
          approvedWfhToday: approvedWfhTodayCount,
          wfhCheckedInToday: wfhCheckedInTodayCount,
          activeWfhSessionsNow,
          wfhNotCheckedInToday: wfhNotCheckedInTodayCount,
          duties: todayWfhDuties,
        },
        pendingApprovals: {
          visits: pendingVisitsList,
          visitsCount: pendingVisitsCount,
          wfh: pendingWfhList,
          wfhCount: pendingWfhCount,
          correctionsCount: pendingCorrectionsCount,
          totalPending: pendingVisitsCount + pendingWfhCount + pendingCorrectionsCount,
        },
        exceptions: {
          total: totalExceptionsCount,
          unresolved: unresolvedExceptionsCount,
          byType: exceptionsByType,
          recent: exceptionsList,
        },
        completedVisits: {
          total: completedVisitsCount,
          recent: completedVisitsList,
        },
        attendanceModes,
        requestsVsAttendance,
      },
    };
  }

  private buildEmptyOverviewData(workingDateStr: string, timezone: string) {
    return {
      date: workingDateStr,
      reportingTimestamp: new Date().toISOString(),
      timezone,
      cutoffHour: 5,
      visitsByStatus: {
        DRAFT: 0,
        SUBMITTED: 0,
        APPROVED: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        CANCELLED: 0,
        REJECTED: 0,
        EXPIRED: 0,
        total: 0,
      },
      todayFieldActivity: {
        approvedVisitsToday: 0,
        fieldCheckedInToday: 0,
        activeFieldSessionsNow: 0,
        fieldNotCheckedInToday: 0,
        duties: [],
      },
      wfhRequests: {
        byStatus: { SUBMITTED: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, COMPLETED: 0, total: 0 },
        byDuration: { FULL_DAY: 0, FIRST_HALF: 0, SECOND_HALF: 0, CUSTOM_RANGE: 0 },
        approvedWfhToday: 0,
        wfhCheckedInToday: 0,
        activeWfhSessionsNow: 0,
        wfhNotCheckedInToday: 0,
        duties: [],
      },
      pendingApprovals: {
        visits: [],
        visitsCount: 0,
        wfh: [],
        wfhCount: 0,
        correctionsCount: 0,
        totalPending: 0,
      },
      exceptions: {
        total: 0,
        unresolved: 0,
        byType: {},
        recent: [],
      },
      completedVisits: {
        total: 0,
        recent: [],
      },
      attendanceModes: {
        office: 0,
        officialVisit: 0,
        workFromHome: 0,
        total: 0,
      },
      requestsVsAttendance: {
        fieldDuty: {
          authorizedRequests: 0,
          actualCheckedInAttendance: 0,
          activeNow: 0,
          notCheckedInYet: 0,
        },
        workFromHome: {
          authorizedRequests: 0,
          actualCheckedInAttendance: 0,
          activeNow: 0,
          notCheckedInYet: 0,
        },
        reconciliationMessage:
          'Approved requests represent administrative duty authorizations. Actual attendance is accredited strictly upon recorded punch events.',
      },
    };
  }
}
