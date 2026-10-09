import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendancePoliciesService } from './attendance-policies.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { CheckInDto } from './dto/check-in.dto';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: any;
  let audit: any;
  let policiesService: any;

  const mockOrgId = 'org-corp-1';
  const mockUserId = 'user-emp-1';
  const mockEmployeeId = 'emp-101';
  const mockBranchId = 'branch-blr-1';
  const mockOfficeId = 'office-blr-hq';

  const mockUser: AuthenticatedUser = {
    id: mockUserId,
    email: 'john.doe@company.com',
    organizationId: mockOrgId,
    branchId: mockBranchId,
    departmentId: 'dept-eng',
    firstName: 'John',
    lastName: 'Doe',
    employeeCode: 'EMP101',
    status: 'ACTIVE' as any,
    roles: ['EMPLOYEE' as any],
    permissions: ['ATTENDANCE_MARK', 'ATTENDANCE_VIEW'],
    sessionId: 'session-xyz',
  };

  const mockEmployee = {
    id: mockEmployeeId,
    userId: mockUserId,
    organizationId: mockOrgId,
    employeeCode: 'EMP101',
    displayName: 'John Doe',
    status: 'ACTIVE',
    isActive: true,
    deletedAt: null,
    employment: {
      branchId: mockBranchId,
      branch: { id: mockBranchId, name: 'Bangalore Tech Center' },
    },
  };

  const mockOffice = {
    id: mockOfficeId,
    organizationId: mockOrgId,
    branchId: mockBranchId,
    name: 'Bangalore HQ',
    latitude: 12.9716,
    longitude: 77.5946,
    geofenceRadiusMeters: 150,
    timezone: 'Asia/Kolkata',
    isActive: true,
  };

  const mockPolicy = {
    id: 'pol-standard',
    organizationId: mockOrgId,
    name: 'Standard Policy',
    standardWorkMinutes: 480,
    gracePeriodMinutes: 15,
    maxGpsAccuracyMeters: 100,
    workingDayStartHour: 5,
    timezone: 'Asia/Kolkata',
    geofenceEnforcement: true,
    allowMultipleSessions: false,
    isActive: true,
  };

  const mockShift = {
    id: 'shift-morning',
    organizationId: mockOrgId,
    name: 'Morning General',
    startTime: '09:00',
    endTime: '18:00',
    isOvernight: false,
    breakDurationMinutes: 60,
  };

  beforeEach(async () => {
    prisma = {
      attendanceEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'evt-created-1', ...data })),
      },
      attendanceSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'sess-created-1', ...data })),
        update: jest
          .fn()
          .mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      },
      attendanceDailySummary: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest
          .fn()
          .mockImplementation(({ create }) => Promise.resolve({ id: 'summary-1', ...create })),
      },
      attendanceException: {
        create: jest.fn().mockResolvedValue({ id: 'exc-1' }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue(mockEmployee),
        findMany: jest.fn().mockResolvedValue([mockEmployee]),
        count: jest.fn().mockResolvedValue(1),
      },
      officeLocation: {
        findFirst: jest.fn().mockResolvedValue(mockOffice),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prisma);
      }),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    policiesService = {
      resolveEffectivePolicyAndShift: jest.fn().mockResolvedValue({
        policy: mockPolicy,
        shift: mockShift,
        source: 'EMPLOYEE_ASSIGNMENT',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: AttendancePoliciesService, useValue: policiesService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  describe('Office Check-In Flow (Normal & Happy Path)', () => {
    it('successfully processes office check-in when coordinates are within office geofence', async () => {
      const dto: CheckInDto = {
        latitude: 12.9716, // Exact office coordinate
        longitude: 77.5946,
        accuracyMeters: 12,
        idempotencyKey: 'idem-key-happy-1',
        attendanceMode: 'OFFICE',
        timestamp: new Date().toISOString(),
      };

      const result = await service.checkIn(mockUser, dto, '192.168.1.100', 'Mozilla/5.0');

      expect(result.success).toBe(true);
      expect(result.data.session).toBeDefined();
      expect(result.data.session?.status).toBe('OPEN');
      expect(result.data.event).toBeDefined();
      expect(result.data.event.eventType).toBe('CHECK_IN');
      expect(result.data.event.geofenceStatus).toBe('VERIFIED');
      expect(result.data.office?.name).toBe('Bangalore HQ');

      // Verify audit trail
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_CHECK_IN',
          entity: 'AttendanceSession',
          organizationId: mockOrgId,
          userId: mockUserId,
        }),
      );
    });

    it('returns idempotent result on duplicate check-in with same idempotencyKey', async () => {
      const existingEvent = {
        id: 'evt-prior',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        idempotencyKey: 'idem-key-repeat',
        session: { id: 'sess-prior', status: 'OPEN', date: new Date() },
        branch: { name: 'Bangalore' },
        officeLocation: { name: 'HQ' },
      };

      prisma.attendanceEvent.findUnique.mockResolvedValueOnce(existingEvent);

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'idem-key-repeat',
      };

      const result = await service.checkIn(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.data.isIdempotentReplay).toBe(true);
      expect(result.data.event.id).toBe('evt-prior');
      // Should not initiate another transaction
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Security & Employment Boundaries', () => {
    it('rejects check-in if user has no employee record', async () => {
      prisma.employee.findFirst.mockResolvedValueOnce(null);

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'idem-key-no-emp',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects check-in if employee status is terminated or inactive', async () => {
      prisma.employee.findFirst.mockResolvedValueOnce({
        ...mockEmployee,
        isActive: false,
        status: 'TERMINATED',
      });

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'idem-key-inactive',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects unapproved WFH and OFFICIAL_VISIT modes in Phase 4', async () => {
      const dtoWfh: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'idem-key-wfh',
        attendanceMode: 'WFH',
      };

      await expect(service.checkIn(mockUser, dtoWfh)).rejects.toThrow(BadRequestException);

      const dtoVisit: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'idem-key-visit',
        attendanceMode: 'OFFICIAL_VISIT',
      };

      await expect(service.checkIn(mockUser, dtoVisit)).rejects.toThrow(BadRequestException);
    });

    it('rejects check-in if user attempts to punch at a branch they are not assigned to', async () => {
      prisma.officeLocation.findFirst.mockResolvedValueOnce({
        ...mockOffice,
        id: 'office-mumbai',
        branchId: 'branch-mum-diff',
      });

      const dto: CheckInDto = {
        latitude: 19.076,
        longitude: 72.8777,
        idempotencyKey: 'idem-key-branch-mismatch',
        officeLocationId: 'office-mumbai',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Geofence & Location Validation', () => {
    it('rejects invalid GPS coordinates outside earth boundaries', async () => {
      const dto: CheckInDto = {
        latitude: 95.0, // Invalid latitude (> 90)
        longitude: 77.5946,
        idempotencyKey: 'idem-key-inv-coord',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects stale GPS timestamp exceeding allowable clock skew', async () => {
      const pastStaleTime = new Date(Date.now() - 300 * 1000).toISOString(); // 5 minutes old

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        timestamp: pastStaleTime,
        idempotencyKey: 'idem-key-stale',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects poor GPS horizontal accuracy exceeding policy threshold', async () => {
      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracyMeters: 250, // Policy allows up to 100m
        idempotencyKey: 'idem-key-low-acc',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects punch outside geofence radius and records an attendance exception', async () => {
      // Office is at 12.9716, 77.5946 (radius 150m)
      // Submitted coords: ~1km away (12.9800, 77.5946)
      const dto: CheckInDto = {
        latitude: 12.98,
        longitude: 77.5946,
        accuracyMeters: 10,
        idempotencyKey: 'idem-key-outside',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);

      // Verify that AttendanceException was logged
      expect(prisma.attendanceException.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            exceptionType: 'OUTSIDE_GEOFENCE',
            severity: 'HIGH',
          }),
        }),
      );
    });
  });

  describe('Concurrency & Session Integrity', () => {
    it('prevents check-in when an active session is already OPEN', async () => {
      prisma.attendanceSession.findFirst.mockResolvedValueOnce({
        id: 'sess-active-existing',
        status: 'OPEN',
        checkInTime: new Date(),
      });

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'idem-key-already-open',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(ConflictException);
    });

    it('prevents multiple sessions on same day when policy disallows multiple sessions', async () => {
      // No open session, but a previous closed session exists today
      prisma.attendanceSession.findFirst
        .mockResolvedValueOnce(null) // for status: 'OPEN'
        .mockResolvedValueOnce({ id: 'sess-closed-earlier', status: 'COMPLETED' }); // for multiple session check

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'idem-key-multiple-session',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(ConflictException);
    });

    it('converts Prisma unique constraint collision (P2002) to 409 conflict exception', async () => {
      prisma.$transaction.mockRejectedValueOnce({
        code: 'P2002',
        message:
          'Unique constraint failed on attendance_sessions_employeeId_date_sessionNumber_key',
      });

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'idem-key-concurrent-race',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('Today Status (GET /api/v1/attendance/today)', () => {
    it('retrieves live status when employee is not checked in', async () => {
      const result = await service.getToday(mockUser);

      expect(result.success).toBe(true);
      expect(result.data.currentStatus.isCheckedIn).toBe(false);
      expect(result.data.currentStatus.canCheckIn).toBe(true);
      expect(result.data.currentStatus.canCheckOut).toBe(false);
      expect(result.data.employee.employeeCode).toBe('EMP101');
      expect(result.data.office).toBeDefined();
    });

    it('retrieves live status when employee has an active open session', async () => {
      prisma.attendanceSession.findMany.mockResolvedValueOnce([
        {
          id: 'sess-open-1',
          sessionNumber: 1,
          status: 'OPEN',
          checkInTime: new Date(),
          events: [
            {
              id: 'evt-1',
              eventType: 'CHECK_IN',
              eventTimestamp: new Date(),
            },
          ],
        },
      ]);

      const result = await service.getToday(mockUser);

      expect(result.success).toBe(true);
      expect(result.data.currentStatus.isCheckedIn).toBe(true);
      expect(result.data.currentStatus.canCheckIn).toBe(false);
      expect(result.data.currentStatus.canCheckOut).toBe(true);
      expect(result.data.activeSession).toBeDefined();
      expect(result.data.activeSession?.id).toBe('sess-open-1');
    });
  });

  describe('Break Management (startBreak & endBreak)', () => {
    it('starts a break successfully when session is open and not on break', async () => {
      prisma.attendanceSession.findFirst.mockResolvedValueOnce({
        id: 'sess-open-break',
        employeeId: mockEmployeeId,
        status: 'OPEN',
        events: [{ id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: new Date() }],
      });

      const dto = { idempotencyKey: 'idem-break-start-1', reason: 'Lunch' };
      const result = await service.startBreak(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.data.isOnBreak).toBe(true);
      expect(result.data.event.eventType).toBe('BREAK_START');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_BREAK_START' }),
      );
    });

    it('returns idempotent result on duplicate break start with same key', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValueOnce({
        id: 'evt-prior-bs',
        eventType: 'BREAK_START',
        idempotencyKey: 'idem-break-replay',
        session: { id: 'sess-1', status: 'OPEN' },
      });

      const dto = { idempotencyKey: 'idem-break-replay' };
      const result = await service.startBreak(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.data.isIdempotentReplay).toBe(true);
    });

    it('rejects startBreak if no open session exists', async () => {
      prisma.attendanceSession.findFirst.mockResolvedValueOnce(null);

      const dto = { idempotencyKey: 'idem-bs-no-sess' };
      await expect(service.startBreak(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects startBreak if already on break', async () => {
      prisma.attendanceSession.findFirst.mockResolvedValueOnce({
        id: 'sess-on-break',
        employeeId: mockEmployeeId,
        status: 'OPEN',
        events: [
          { id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: new Date() },
          { id: 'evt-bs', eventType: 'BREAK_START', eventTimestamp: new Date() },
        ],
      });

      const dto = { idempotencyKey: 'idem-bs-already' };
      await expect(service.startBreak(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('ends break successfully and recalculates session break duration', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      prisma.attendanceSession.findFirst.mockResolvedValueOnce({
        id: 'sess-on-break-2',
        employeeId: mockEmployeeId,
        status: 'OPEN',
        events: [
          { id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: new Date(Date.now() - 60000) },
          { id: 'evt-bs', eventType: 'BREAK_START', eventTimestamp: tenMinutesAgo },
        ],
      });

      const dto = { idempotencyKey: 'idem-break-end-1' };
      const result = await service.endBreak(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.data.isOnBreak).toBe(false);
      expect(result.data.totalBreakMinutes).toBeGreaterThanOrEqual(9);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_BREAK_END' }),
      );
    });

    it('rejects endBreak if not currently on break', async () => {
      prisma.attendanceSession.findFirst.mockResolvedValueOnce({
        id: 'sess-not-on-break',
        employeeId: mockEmployeeId,
        status: 'OPEN',
        events: [
          { id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: new Date() },
          { id: 'evt-bs', eventType: 'BREAK_START', eventTimestamp: new Date() },
          { id: 'evt-be', eventType: 'BREAK_END', eventTimestamp: new Date() },
        ],
      });

      const dto = { idempotencyKey: 'idem-be-not-on' };
      await expect(service.endBreak(mockUser, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Office Check-Out Flow (checkOut)', () => {
    it('checks out open session successfully, computes gross/net work time from server clock', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      prisma.attendanceSession.findFirst.mockResolvedValueOnce({
        id: 'sess-to-close',
        employeeId: mockEmployeeId,
        date: new Date('2026-10-09T00:00:00.000Z'),
        checkInTime: oneHourAgo,
        status: 'OPEN',
        events: [{ id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: oneHourAgo }],
      });

      prisma.attendanceEvent.findMany.mockResolvedValueOnce([
        { id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: oneHourAgo },
      ]);

      const dto = {
        idempotencyKey: 'idem-checkout-normal-1',
        latitude: 12.9716,
        longitude: 77.5946,
      };

      const result = await service.checkOut(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.data.session?.status).toBe('COMPLETED');
      expect(result.data.grossMinutes).toBeGreaterThanOrEqual(59);
      expect(result.data.netWorkMinutes).toBeGreaterThanOrEqual(59);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_CHECK_OUT' }),
      );
    });

    it('auto-concludes active open break upon checkout without leaving orphan breaks', async () => {
      const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
      const halfHourAgo = new Date(Date.now() - 30 * 60 * 1000);

      prisma.attendanceSession.findFirst.mockResolvedValueOnce({
        id: 'sess-on-break-checkout',
        employeeId: mockEmployeeId,
        date: new Date('2026-10-09T00:00:00.000Z'),
        checkInTime: twoHoursAgo,
        status: 'OPEN',
        events: [
          { id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: twoHoursAgo },
          { id: 'evt-bs', eventType: 'BREAK_START', eventTimestamp: halfHourAgo },
        ],
      });

      prisma.attendanceEvent.findMany.mockResolvedValueOnce([
        { id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: twoHoursAgo },
        { id: 'evt-bs', eventType: 'BREAK_START', eventTimestamp: halfHourAgo },
        { id: 'evt-be-auto', eventType: 'BREAK_END', eventTimestamp: new Date() },
      ]);

      const dto = { idempotencyKey: 'idem-checkout-auto-break' };
      const result = await service.checkOut(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.data.sessionBreakMinutes).toBeGreaterThanOrEqual(29);
      expect(result.data.netWorkMinutes).toBeLessThan(result.data.grossMinutes!);
    });

    it('returns idempotent result on repeated checkout with identical key', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValueOnce({
        id: 'evt-prior-co',
        eventType: 'CHECK_OUT',
        idempotencyKey: 'idem-co-replay',
        session: { id: 'sess-already-closed', status: 'COMPLETED' },
      });

      const dto = { idempotencyKey: 'idem-co-replay' };
      const result = await service.checkOut(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.data.isIdempotentReplay).toBe(true);
    });

    it('rejects checkout if no active open session is found', async () => {
      prisma.attendanceSession.findFirst.mockResolvedValueOnce(null);

      const dto = { idempotencyKey: 'idem-co-no-sess' };
      await expect(service.checkOut(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('verifies location for office checkout and rejects if outside geofence', async () => {
      prisma.attendanceSession.findFirst.mockResolvedValueOnce({
        id: 'sess-geofence-co',
        employeeId: mockEmployeeId,
        date: new Date('2026-10-09T00:00:00.000Z'),
        checkInTime: new Date(Date.now() - 3600000),
        status: 'OPEN',
        events: [{ id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: new Date() }],
      });

      const dto = {
        idempotencyKey: 'idem-co-outside',
        latitude: 19.076, // Mumbai (~1000km from Bangalore)
        longitude: 72.8777,
      };

      await expect(service.checkOut(mockUser, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Overnight Shift & Working-Day Aggregation', () => {
    it('accurately calculates overnight session spanning two calendar days under shift start working date', async () => {
      // Overnight shift: 22:00 -> 06:00
      const nightStart = new Date('2026-10-08T22:00:00.000Z');
      const workingDate = new Date('2026-10-08T00:00:00.000Z');

      prisma.attendanceSession.findFirst.mockResolvedValueOnce({
        id: 'sess-night-overnight',
        employeeId: mockEmployeeId,
        date: workingDate,
        checkInTime: nightStart,
        status: 'OPEN',
        events: [{ id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: nightStart }],
      });

      prisma.attendanceEvent.findMany.mockResolvedValueOnce([
        { id: 'evt-ci', eventType: 'CHECK_IN', eventTimestamp: nightStart },
      ]);

      const dto = { idempotencyKey: 'idem-night-co' };
      const result = await service.checkOut(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.data.session?.status).toBe('COMPLETED');
    });
  });

  describe('Missing Checkout Reconciliation', () => {
    it('flags unclosed stale sessions as AUTO_CLOSED without fabricating real CHECK_OUT events', async () => {
      const staleSession = {
        id: 'sess-stale-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        date: new Date('2026-10-01T00:00:00.000Z'),
        checkInTime: new Date('2026-10-01T09:00:00.000Z'),
        status: 'OPEN',
      };

      prisma.attendanceSession.findMany.mockResolvedValueOnce([staleSession]);

      const result = await service.reconcileMissingCheckouts(
        mockOrgId,
        new Date('2026-10-05T00:00:00.000Z'),
      );

      expect(result.success).toBe(true);
      expect(result.reconciledCount).toBe(1);

      // Verify that session was updated to AUTO_CLOSED
      expect(prisma.attendanceSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sess-stale-1' },
          data: { status: 'AUTO_CLOSED' },
        }),
      );

      // Verify that AttendanceException of type MISSING_CHECKOUT was created
      expect(prisma.attendanceException.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            exceptionType: 'MISSING_CHECKOUT',
          }),
        }),
      );

      // Crucially verify that NO CHECK_OUT event was inserted into attendanceEvent
      const eventCalls = prisma.attendanceEvent.create.mock.calls;
      const checkoutEvents = eventCalls.filter(
        (call: any) => call[0]?.data?.eventType === 'CHECK_OUT',
      );
      expect(checkoutEvents.length).toBe(0);
    });
  });

  describe('Safe Daily Attendance Recalculation (recalculateAttendance)', () => {
    it('safely recalculates attendance summaries for an employee over a date range', async () => {
      prisma.employee.findFirst.mockResolvedValueOnce({
        id: mockEmployeeId,
        organizationId: mockOrgId,
      });

      prisma.attendanceDailySummary.findUnique.mockResolvedValue(null);
      prisma.attendanceSession.findMany.mockResolvedValue([
        {
          id: 'sess-recalc-1',
          sessionNumber: 1,
          checkInTime: new Date('2026-10-09T03:30:00.000Z'),
          checkOutTime: new Date('2026-10-09T12:00:00.000Z'),
          totalWorkMinutes: 510,
          totalBreakMinutes: 30,
          status: 'COMPLETED',
          events: [],
        },
      ]);

      prisma.attendanceDailySummary.upsert.mockResolvedValue({
        id: 'sum-recalc-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        date: new Date('2026-10-09T00:00:00.000Z'),
        status: 'PRESENT',
        totalWorkMinutes: 480,
      });

      const res = await service.recalculateAttendance(
        mockOrgId,
        {
          startDate: '2026-10-09',
          endDate: '2026-10-09',
          employeeId: mockEmployeeId,
        },
        'user-admin-1',
      );

      expect(res.success).toBe(true);
      expect(res.recalculatedCount).toBe(1);
      expect(res.skippedCount).toBe(0);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_SUMMARY_RECALCULATED',
        }),
      );
    });

    it('preserves manually corrected daily summaries unless force is true', async () => {
      prisma.employee.findFirst.mockResolvedValueOnce({
        id: mockEmployeeId,
        organizationId: mockOrgId,
      });

      // Existing summary marked as manually corrected
      prisma.attendanceDailySummary.findUnique.mockResolvedValueOnce({
        id: 'sum-corrected-1',
        isCorrected: true,
        status: 'PRESENT',
      });

      const res = await service.recalculateAttendance(
        mockOrgId,
        {
          startDate: '2026-10-09',
          endDate: '2026-10-09',
          employeeId: mockEmployeeId,
          force: false,
        },
        'user-admin-1',
      );

      expect(res.success).toBe(true);
      expect(res.recalculatedCount).toBe(0);
      expect(res.skippedCount).toBe(1);
      expect(res.data[0].skipped).toBe(true);
      expect(res.data[0].reason).toContain('Manually corrected summary preserved');
    });
  });

  describe('HR Operations Dashboard & GPS Privacy Redaction (Phase 4 Step 9)', () => {
    it('retrieves operations dashboard with mutually consistent headcount and 7-day trend', async () => {
      prisma.employee.count.mockResolvedValueOnce(25); // totalActiveEmployees
      prisma.attendanceDailySummary.findMany.mockResolvedValueOnce([
        { status: 'PRESENT', lateMinutes: 0 },
        { status: 'PRESENT', lateMinutes: 20 },
        { status: 'HALF_DAY', lateMinutes: 0 },
        { status: 'ABSENT', lateMinutes: 0 },
        { status: 'INCOMPLETE', lateMinutes: 0 },
        { status: 'PENDING_REVIEW', lateMinutes: 0 },
      ]);
      prisma.attendanceSession.count.mockResolvedValueOnce(8); // checkedInNow
      prisma.attendanceException.count.mockResolvedValueOnce(3); // unresolvedExceptions
      prisma.attendanceEvent.findMany.mockResolvedValueOnce([
        { attendanceMode: 'OFFICE' },
        { attendanceMode: 'OFFICE' },
        { attendanceMode: 'WFH' },
      ]);

      const res = await service.getOperationsDashboard(mockOrgId, { date: '2026-10-09' });

      expect(res.success).toBe(true);
      expect(res.data.date).toBe('2026-10-09');
      expect(res.data.timezone).toBe('Asia/Kolkata');
      expect(res.data.reportingTimestamp).toBeDefined();
      expect(res.data.headcount.totalActiveEmployees).toBe(25);
      expect(res.data.headcount.checkedInNow).toBe(8);
      expect(res.data.headcount.present).toBe(2);
      expect(res.data.headcount.lateArrivals).toBe(1);
      expect(res.data.headcount.halfDay).toBe(1);
      expect(res.data.headcount.absent).toBe(1);
      expect(res.data.headcount.incomplete).toBe(1);
      expect(res.data.headcount.pendingReview).toBe(1);
      expect(res.data.headcount.unresolvedExceptions).toBe(3);
      expect(res.data.modes.office).toBe(2);
      expect(res.data.trend.length).toBe(7);
    });

    it('strictly redacts precise GPS coordinates for standard non-admin users without ATTENDANCE_VIEW_GPS', async () => {
      const nonAdminUser: AuthenticatedUser = {
        ...mockUser,
        roles: ['EMPLOYEE' as any],
        permissions: ['ATTENDANCE_VIEW'],
      };

      prisma.employee.count.mockResolvedValueOnce(1);
      prisma.employee.findMany.mockResolvedValueOnce([mockEmployee]);
      prisma.attendanceDailySummary.findMany.mockResolvedValueOnce([
        {
          employeeId: mockEmployeeId,
          status: 'PRESENT',
          firstCheckIn: new Date('2026-10-09T09:05:00.000Z'),
          lastCheckOut: new Date('2026-10-09T18:00:00.000Z'),
          totalWorkMinutes: 480,
          totalBreakMinutes: 55,
          lateMinutes: 5,
          earlyExitMinutes: 0,
          overtimeMinutes: 0,
          isCorrected: false,
        },
      ]);
      prisma.attendanceSession.findMany.mockResolvedValueOnce([
        {
          id: 'sess-open-gps',
          employeeId: mockEmployeeId,
          sessionNumber: 1,
          checkInTime: new Date(),
          status: 'OPEN',
          events: [
            {
              id: 'evt-gps-1',
              eventType: 'CHECK_IN',
              latitude: 12.9716,
              longitude: 77.5946,
              distanceFromOfficeMeters: 45,
              geofenceStatus: 'VERIFIED',
              officeLocation: { name: 'Bangalore HQ' },
            },
          ],
        },
      ]);
      prisma.attendanceException.findMany.mockResolvedValueOnce([]);

      const res = await service.getOperationsRecords(nonAdminUser, { date: '2026-10-09' });

      expect(res.success).toBe(true);
      expect(res.data.length).toBe(1);
      const record = res.data[0];
      expect(record.employee.displayName).toBe('John Doe');
      expect(record.summary.status).toBe('PRESENT');

      // GPS privacy checks:
      expect(record.locationVerification).toBeDefined();
      expect(record.locationVerification!.isGpsRedacted).toBe(true);
      expect(record.locationVerification!.latitude).toBeNull();
      expect(record.locationVerification!.longitude).toBeNull();
      expect(record.locationVerification!.officeName).toBe('Bangalore HQ');
      expect(record.locationVerification!.distanceMeters).toBe(45);
      expect(record.locationVerification!.geofenceStatus).toBe('VERIFIED');
    });

    it('displays precise GPS coordinates when user has ADMIN role or ATTENDANCE_VIEW_GPS permission', async () => {
      const adminUser: AuthenticatedUser = {
        ...mockUser,
        roles: ['ADMIN' as any],
        permissions: ['ATTENDANCE_VIEW', 'ATTENDANCE_VIEW_GPS'],
      };

      prisma.employee.count.mockResolvedValueOnce(1);
      prisma.employee.findMany.mockResolvedValueOnce([mockEmployee]);
      prisma.attendanceDailySummary.findMany.mockResolvedValueOnce([]);
      prisma.attendanceSession.findMany.mockResolvedValueOnce([
        {
          id: 'sess-open-admin',
          employeeId: mockEmployeeId,
          sessionNumber: 1,
          status: 'OPEN',
          events: [
            {
              id: 'evt-gps-admin',
              eventType: 'CHECK_IN',
              latitude: 12.9716,
              longitude: 77.5946,
              distanceFromOfficeMeters: 20,
              geofenceStatus: 'VERIFIED',
              officeLocation: { name: 'Bangalore HQ' },
            },
          ],
        },
      ]);
      prisma.attendanceException.findMany.mockResolvedValueOnce([]);

      const res = await service.getOperationsRecords(adminUser, { date: '2026-10-09' });

      expect(res.success).toBe(true);
      const record = res.data[0];
      expect(record.locationVerification!.isGpsRedacted).toBe(false);
      expect(record.locationVerification!.latitude).toBe(12.9716);
      expect(record.locationVerification!.longitude).toBe(77.5946);
    });

    it('retrieves detailed employee timeline for detail drawer with sanitized events', async () => {
      const nonAdminUser: AuthenticatedUser = {
        ...mockUser,
        roles: ['EMPLOYEE' as any],
      };

      prisma.employee.findFirst.mockResolvedValueOnce({
        ...mockEmployee,
        employment: {
          designation: { name: 'Senior Software Engineer' },
          department: { name: 'Engineering' },
          branch: { name: 'Bangalore HQ' },
        },
      });
      prisma.attendanceDailySummary.findUnique.mockResolvedValueOnce({
        status: 'PRESENT',
        totalWorkMinutes: 480,
      });
      prisma.attendanceSession.findMany.mockResolvedValueOnce([
        {
          id: 'sess-drawer-1',
          sessionNumber: 1,
          status: 'COMPLETED',
          events: [
            {
              id: 'evt-drawer-ci',
              eventType: 'CHECK_IN',
              eventTimestamp: new Date('2026-10-09T09:00:00.000Z'),
              attendanceMode: 'OFFICE',
              geofenceStatus: 'VERIFIED',
              distanceFromOfficeMeters: 30,
              officeLocation: { name: 'Bangalore HQ' },
              latitude: 12.9716,
              longitude: 77.5946,
            },
          ],
        },
      ]);
      prisma.attendanceException.findMany.mockResolvedValueOnce([
        {
          id: 'exc-drawer-1',
          exceptionType: 'LATE_ARRIVAL',
          severity: 'LOW',
          resolved: false,
        },
      ]);

      const res = await service.getOperationsEmployeeDetail(
        nonAdminUser,
        mockEmployeeId,
        '2026-10-09',
      );

      expect(res.success).toBe(true);
      expect(res.data.employee.displayName).toBe('John Doe');
      expect(res.data.employee.designation).toBe('Senior Software Engineer');
      expect(res.data.sessions.length).toBe(1);
      const event = res.data.sessions[0].events[0];
      expect(event.eventType).toBe('CHECK_IN');
      expect(event.isGpsRedacted).toBe(true);
      expect(event.latitude).toBeNull();
      expect(event.longitude).toBeNull();
      expect(event.distanceFromOfficeMeters).toBe(30);
      expect(res.data.exceptions.length).toBe(1);
    });
  });
});
