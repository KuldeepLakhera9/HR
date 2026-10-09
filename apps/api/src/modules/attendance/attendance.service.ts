import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
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
import { resolveWorkingDay, calculateShiftWindow } from './utils/policy-evaluator.util';
import { calculateDailyAttendance } from './utils/daily-attendance-calculator.util';
import { RecalculateAttendanceDto } from './dto/recalculate-attendance.dto';
import { SubmitCorrectionRequestDto } from './dto/correction-request.dto';
import { AttendanceOperationsQueryDto } from './dto/attendance-operations-query.dto';
import { AttendanceDayStatus } from '@hrms/types';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly policiesService: AttendancePoliciesService,
  ) {}

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

    // 2. Reject unapproved attendance modes in Phase 4
    const mode = (dto.attendanceMode || 'OFFICE').toUpperCase();
    if (mode !== 'OFFICE') {
      throw new BadRequestException({
        statusCode: 400,
        message: `Attendance mode '${mode}' is not permitted in this phase. Only verified OFFICE punches are supported.`,
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

    // 4. Validate GPS coordinates
    const coordCheck = validateCoordinates(dto.latitude, dto.longitude);
    if (!coordCheck.valid) {
      throw new BadRequestException({
        statusCode: 400,
        message: coordCheck.error || 'Invalid GPS coordinates provided.',
        code: 'INVALID_COORDINATES',
      });
    }

    // Validate timestamp freshness (clock skew maximum 120 seconds)
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

    // 5. Resolve policy & shift
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

    // 6. Validate GPS accuracy against policy threshold
    const maxAccuracyMeters = policy.maxGpsAccuracyMeters || 100;
    if (dto.accuracyMeters !== undefined && dto.accuracyMeters !== null) {
      const accuracyCheck = validateGpsAccuracy(dto.accuracyMeters, maxAccuracyMeters);
      if (!accuracyCheck.valid) {
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

    // 7. Resolve allowed office location
    let office = null;
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

    // 8. Calculate distance server-side & verify geofence
    const distanceMeters = haversineDistance(
      dto.latitude,
      dto.longitude,
      office.latitude,
      office.longitude,
    );
    const isWithinGeofence = distanceMeters <= office.geofenceRadiusMeters;

    if (policy.geofenceEnforcement && !isWithinGeofence) {
      await this.prisma.attendanceException
        .create({
          data: {
            organizationId: employee.organizationId,
            employeeId: employee.id,
            date: workingDateUtc,
            exceptionType: 'OUTSIDE_GEOFENCE',
            severity: 'HIGH',
            details: {
              distanceMeters: Math.round(distanceMeters),
              allowedRadiusMeters: office.geofenceRadiusMeters,
              officeName: office.name,
              latitude: dto.latitude,
              longitude: dto.longitude,
            },
          },
        })
        .catch(() => null);

      throw new BadRequestException({
        statusCode: 400,
        message: `Outside office geofence. You are ${Math.round(distanceMeters)}m from ${office.name} (allowed perimeter: ${office.geofenceRadiusMeters}m).`,
        code: 'OUTSIDE_GEOFENCE',
        distanceMeters: Math.round(distanceMeters),
        allowedRadiusMeters: office.geofenceRadiusMeters,
        officeName: office.name,
      });
    }

    // 9. Atomic Transaction: Concurrency protection & creation
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
            attendanceMode: 'OFFICE',
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracyMeters: dto.accuracyMeters ?? null,
            branchId: office.branchId || branchId,
            officeLocationId: office.id,
            distanceFromOfficeMeters: distanceMeters,
            geofenceStatus: 'VERIFIED',
            idempotencyKey: dto.idempotencyKey,
            deviceInfo: dto.deviceInfo ?? null,
            ipAddress: clientIp ?? null,
            actorUserId: user.id,
            metadata: {
              policyId: policy.id,
              shiftId: shift?.id ?? null,
              officeName: office.name,
              workingDate: workingDateStr,
            },
          },
        });

        // F. Evaluate status (check if late)
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
          }
        }

        const persistedPolicyId =
          policy?.id && !policy.id.startsWith('synthetic') ? policy.id : null;
        const persistedShiftId = shift?.id && !shift.id.startsWith('synthetic') ? shift.id : null;

        // G. Upsert Daily Summary
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
          },
          update: {
            status: dayStatus,
            shiftId: persistedShiftId,
            policyId: persistedPolicyId,
            ...(sessionCount === 0 ? { firstCheckIn: now, lateMinutes } : {}),
          },
        });

        return { session: newSession, event: newEvent, summary: dailySummary };
      });

      // 10. Audit Record
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
          officeId: office.id,
          officeName: office.name,
          distanceMeters: Math.round(distanceMeters),
          status: summary.status,
          lateMinutes: summary.lateMinutes,
        },
      });

      // 11. Safe structured response
      return {
        success: true,
        message: 'Office check-in verified and recorded successfully.',
        data: {
          session,
          event,
          summary,
          policy,
          shift,
          office: {
            id: office.id,
            name: office.name,
            distanceMeters: Math.round(distanceMeters),
            allowedRadiusMeters: office.geofenceRadiusMeters,
          },
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
          attendanceMode: 'OFFICE',
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
            attendanceMode: 'OFFICE',
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

    // 2. Perform atomic checkout in transaction
    const { session, event, summary, grossMinutes, netWorkMinutes, sessionBreakMinutes } =
      await this.prisma.$transaction(async (tx) => {
        // Find active open session
        const activeSession = await tx.attendanceSession.findFirst({
          where: { employeeId: employee.id, status: 'OPEN' },
          include: { events: { orderBy: { eventTimestamp: 'asc' } } },
        });

        if (!activeSession) {
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
            const freshness = validateTimestampFreshness(dto.timestamp, 120, serverNow);
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

          const maxAccuracy = policy.maxGpsAccuracyMeters || 100;
          if (dto.accuracyMeters !== undefined && dto.accuracyMeters !== null) {
            const accuracyCheck = validateGpsAccuracy(dto.accuracyMeters, maxAccuracy);
            if (!accuracyCheck.valid) {
              throw new BadRequestException({
                statusCode: 400,
                message:
                  accuracyCheck.error ||
                  `GPS accuracy (${dto.accuracyMeters}m) exceeds acceptable threshold (${maxAccuracy}m).`,
                code: 'LOW_GPS_ACCURACY',
              });
            }
          }

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
              attendanceMode: 'OFFICE',
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
            attendanceMode: 'OFFICE',
            latitude: dto.latitude ?? null,
            longitude: dto.longitude ?? null,
            accuracyMeters: dto.accuracyMeters ?? null,
            branchId: employee.employment?.branchId ?? null,
            officeLocationId: officeLocationId,
            distanceFromOfficeMeters: checkoutDistanceMeters,
            geofenceStatus: 'VERIFIED',
            idempotencyKey: dto.idempotencyKey,
            deviceInfo: dto.deviceInfo ?? null,
            ipAddress: clientIp ?? null,
            actorUserId: user.id,
            metadata: {
              workingDate: activeSession.date.toISOString().split('T')[0],
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
        netWorkMinutes,
        grossMinutes,
        sessionBreakMinutes,
        status: summary.status,
      },
    });

    return {
      success: true,
      message: 'Office check-out verified and recorded successfully.',
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

    const targetDateUtc = new Date(`${dto.targetDate}T00:00:00.000Z`);

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

    const request = await this.prisma.attendanceCorrectionRequest.create({
      data: {
        organizationId: user.organizationId,
        employeeId: employee.id,
        targetDate: targetDateUtc,
        requestedCheckIn: dto.requestedCheckIn ? new Date(dto.requestedCheckIn) : null,
        requestedCheckOut: dto.requestedCheckOut ? new Date(dto.requestedCheckOut) : null,
        reason: dto.reason.trim(),
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
        reason: dto.reason,
      },
    });

    return {
      success: true,
      message: 'Attendance correction request submitted successfully.',
      data: request,
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
      data: requests,
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
}
