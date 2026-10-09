import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendancePoliciesService } from './attendance-policies.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: any;
  let audit: any;
  let policiesService: any;
  let hierarchyService: any;

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
        findFirst: jest.fn().mockResolvedValue(null),
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
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'exc-1', ...data })),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'exc-1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      attendanceCorrectionRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'req-corr-1', ...data })),
        update: jest
          .fn()
          .mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceCorrectionDecision: {
        upsert: jest
          .fn()
          .mockImplementation(({ create }) => Promise.resolve({ id: 'dec-1', ...create })),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue(mockEmployee),
        findMany: jest.fn().mockResolvedValue([mockEmployee]),
        count: jest.fn().mockResolvedValue(1),
      },
      officeLocation: {
        findFirst: jest.fn().mockResolvedValue(mockOffice),
      },
      officialVisit: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'visit-1', status: 'IN_PROGRESS' }),
      },
      visitDestination: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      visitLocationVerification: {
        create: jest.fn().mockResolvedValue({ id: 'loc-verif-1' }),
      },
      wfhRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'wfh-1', status: 'APPROVED' }),
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

    hierarchyService = {
      getTeam: jest.fn().mockResolvedValue({
        manager: mockEmployee,
        directReports: [mockEmployee],
        indirectReports: [],
        allMemberIds: [mockEmployeeId],
        totalTeamSize: 1,
      }),
      isManagerOf: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: AttendancePoliciesService, useValue: policiesService },
        { provide: HierarchyService, useValue: hierarchyService },
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

    it('rejects unapproved WFH modes and visits when not found', async () => {
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

  describe('Manager Team Attendance & Access-Scope Security (Phase 4 Step 10)', () => {
    const mockManagerUser: AuthenticatedUser = {
      id: 'user-manager-1',
      email: 'sarah.manager@company.com',
      organizationId: mockOrgId,
      branchId: mockBranchId,
      departmentId: 'dept-eng',
      firstName: 'Sarah',
      lastName: 'Connor',
      employeeCode: 'MGR001',
      status: 'ACTIVE' as any,
      roles: ['MANAGER' as any],
      permissions: ['ATTENDANCE_VIEW'],
      sessionId: 'session-mgr-1',
    };

    const mockSubordinateEmpId = 'emp-subordinate-1';
    const mockOutsiderEmpId = 'emp-outsider-999';

    const mockManagerEmployeeProfile = {
      id: 'emp-mgr-1',
      userId: mockManagerUser.id,
      organizationId: mockOrgId,
      employeeCode: 'MGR001',
      displayName: 'Sarah Connor',
      status: 'ACTIVE',
      isActive: true,
      deletedAt: null,
    };

    const mockSubordinateProfile = {
      id: mockSubordinateEmpId,
      userId: 'user-sub-1',
      organizationId: mockOrgId,
      employeeCode: 'EMP201',
      displayName: 'Kyle Reese',
      status: 'ACTIVE',
      isActive: true,
      deletedAt: null,
      employment: {
        designation: { title: 'Software Engineer' },
        department: { name: 'Engineering' },
        branch: { name: 'Bangalore Tech Center' },
      },
    };

    beforeEach(() => {
      prisma.employee.findFirst.mockImplementation(({ where }: any) => {
        if (where.userId === mockManagerUser.id) {
          return Promise.resolve(mockManagerEmployeeProfile);
        }
        if (where.id === mockSubordinateEmpId && where.organizationId === mockOrgId) {
          return Promise.resolve(mockSubordinateProfile);
        }
        if (where.id === mockOutsiderEmpId && where.organizationId === mockOrgId) {
          return Promise.resolve({
            id: mockOutsiderEmpId,
            organizationId: mockOrgId,
            displayName: 'Other Team Member',
          });
        }
        return Promise.resolve(null);
      });

      hierarchyService.getTeam.mockResolvedValue({
        manager: mockManagerEmployeeProfile,
        directReports: [mockSubordinateProfile],
        indirectReports: [],
        allMemberIds: [mockSubordinateEmpId],
        totalTeamSize: 1,
      });
    });

    it('1. retrieves manager team attendance dashboard scoped strictly to team reports', async () => {
      prisma.attendanceDailySummary.findMany.mockResolvedValueOnce([
        {
          id: 'sum-1',
          employeeId: mockSubordinateEmpId,
          status: 'PRESENT',
          lateMinutes: 10,
          totalWorkMinutes: 480,
          shift: mockShift,
        },
      ]);
      prisma.attendanceSession.count.mockResolvedValueOnce(1); // checkedInNow
      prisma.attendanceException.count.mockResolvedValueOnce(1); // unresolvedExceptions
      prisma.attendanceCorrectionRequest.count.mockResolvedValueOnce(1); // pendingCorrectionsCount

      const result = await service.getManagerTeamDashboard(mockManagerUser, '2026-10-09');

      expect(result.success).toBe(true);
      expect(result.data.teamSize).toBe(1);
      expect(result.data.headcount.totalTeamMembers).toBe(1);
      expect(result.data.headcount.present).toBe(1);
      expect(result.data.headcount.lateArrivals).toBe(1);
      expect(result.data.headcount.checkedInNow).toBe(1);
      expect(result.data.pendingCorrectionsCount).toBe(1);

      // Verify Prisma query was strictly filtered by team member IDs
      expect(prisma.attendanceDailySummary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: { in: [mockSubordinateEmpId] },
          }),
        }),
      );
    });

    it('2. handles manager with empty team safely', async () => {
      hierarchyService.getTeam.mockResolvedValueOnce({
        manager: mockManagerEmployeeProfile,
        directReports: [],
        indirectReports: [],
        allMemberIds: [],
        totalTeamSize: 0,
      });

      const result = await service.getManagerTeamDashboard(mockManagerUser, '2026-10-09');

      expect(result.success).toBe(true);
      expect(result.data.teamSize).toBe(0);
      expect(result.data.headcount.checkedInNow).toBe(0);
      expect(result.data.pendingCorrectionsCount).toBe(0);
    });

    it('3. retrieves paginated team records with strict GPS privacy redaction', async () => {
      prisma.employee.count.mockResolvedValueOnce(1);
      prisma.employee.findMany.mockResolvedValueOnce([mockSubordinateProfile]);
      prisma.attendanceDailySummary.findMany.mockResolvedValueOnce([
        {
          employeeId: mockSubordinateEmpId,
          status: 'PRESENT',
          firstCheckIn: new Date('2026-10-09T03:30:00.000Z'),
          lastCheckOut: new Date('2026-10-09T12:30:00.000Z'),
          totalWorkMinutes: 480,
          totalBreakMinutes: 60,
          lateMinutes: 0,
          earlyExitMinutes: 0,
          overtimeMinutes: 0,
          isCorrected: false,
        },
      ]);
      prisma.attendanceSession.findMany.mockResolvedValueOnce([
        {
          id: 'sess-team-1',
          employeeId: mockSubordinateEmpId,
          sessionNumber: 1,
          status: 'CLOSED',
          events: [
            {
              id: 'evt-team-1',
              eventType: 'CHECK_IN',
              geofenceStatus: 'VERIFIED',
              distanceFromOfficeMeters: 45,
              latitude: 12.9716,
              longitude: 77.5946,
              officeLocation: { name: 'Bangalore HQ' },
            },
          ],
        },
      ]);
      prisma.attendanceException.findMany.mockResolvedValueOnce([]);

      const result = await service.getManagerTeamRecords(mockManagerUser, {
        date: '2026-10-09',
        page: 1,
        limit: 20,
      });

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      const record = result.data[0];
      expect(record.employee.id).toBe(mockSubordinateEmpId);
      expect(record.locationVerification).toBeDefined();
      expect(record.locationVerification?.officeName).toBe('Bangalore HQ');
      expect(record.locationVerification?.distanceMeters).toBe(45);

      // Verify GPS coordinates are redacted for manager
      expect(record.locationVerification?.isGpsRedacted).toBe(true);
      expect(record.locationVerification?.latitude).toBeNull();
      expect(record.locationVerification?.longitude).toBeNull();
    });

    it('4. retrieves pending correction requests for team members', async () => {
      const mockCorrection = {
        id: 'corr-req-1',
        organizationId: mockOrgId,
        employeeId: mockSubordinateEmpId,
        status: 'PENDING',
        targetDate: new Date('2026-10-08T00:00:00.000Z'),
        reason: 'Network outage during check-out',
        employee: mockSubordinateProfile,
      };

      prisma.attendanceCorrectionRequest.findMany.mockResolvedValueOnce([mockCorrection]);

      const result = await service.getManagerTeamCorrections(mockManagerUser);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].id).toBe('corr-req-1');
    });

    it('5. manager approves legitimate subordinate correction request', async () => {
      const mockCorrection = {
        id: 'corr-req-1',
        organizationId: mockOrgId,
        employeeId: mockSubordinateEmpId,
        status: 'PENDING',
        targetDate: new Date('2026-10-08T00:00:00.000Z'),
        requestedCheckIn: new Date('2026-10-08T03:30:00.000Z'),
        requestedCheckOut: new Date('2026-10-08T12:30:00.000Z'),
        employee: mockSubordinateProfile,
      };

      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(mockCorrection);
      hierarchyService.isManagerOf.mockResolvedValueOnce(true);
      prisma.attendanceDailySummary.findUnique.mockResolvedValueOnce(null);

      const result = await service.decideCorrectionRequest(mockManagerUser, 'corr-req-1', {
        decision: 'APPROVED',
        reviewNotes: 'Verified and approved with team lead',
      });

      expect(result.success).toBe(true);
      expect(prisma.attendanceDailySummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isCorrected: true,
            status: 'PRESENT',
          }),
        }),
      );
      expect(prisma.attendanceCorrectionDecision.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            decision: 'APPROVED',
            reviewerId: mockManagerUser.id,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_CORRECTION_DECIDED',
        }),
      );
    });

    it('6. SECURITY: blocks manager from deciding correction request for employee outside their team', async () => {
      const mockCorrection = {
        id: 'corr-req-outsider',
        organizationId: mockOrgId,
        employeeId: mockOutsiderEmpId,
        status: 'PENDING',
        targetDate: new Date('2026-10-08T00:00:00.000Z'),
        employee: { id: mockOutsiderEmpId },
      };

      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(mockCorrection);
      // isManagerOf returns false -> outside hierarchy!
      hierarchyService.isManagerOf.mockResolvedValueOnce(false);

      await expect(
        service.decideCorrectionRequest(mockManagerUser, 'corr-req-outsider', {
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('7. SECURITY: blocks deciding correction request belonging to another organization', async () => {
      // Cross-organization query returns null due to orgId filter
      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.decideCorrectionRequest(mockManagerUser, 'corr-other-org', {
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('8. SECURITY: blocks manager from viewing attendance detail of employee outside their team', async () => {
      // isManagerOf returns false -> employee belongs to another team
      hierarchyService.isManagerOf.mockResolvedValueOnce(false);

      await expect(
        service.getManagerEmployeeDetail(mockManagerUser, mockOutsiderEmpId, '2026-10-09'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('9. SECURITY: blocks manager from viewing employee from another organization', async () => {
      // Target employee not found in manager's organization
      prisma.employee.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getManagerEmployeeDetail(mockManagerUser, 'emp-foreign-org', '2026-10-09'),
      ).rejects.toThrow(NotFoundException);
    });

    it('10. allows manager to view detailed attendance of legitimate subordinate', async () => {
      hierarchyService.isManagerOf.mockResolvedValueOnce(true);

      // Mock operations detail responses
      prisma.attendanceDailySummary.findUnique.mockResolvedValueOnce({
        employeeId: mockSubordinateEmpId,
        status: 'PRESENT',
        totalWorkMinutes: 480,
      });
      prisma.attendanceSession.findMany.mockResolvedValueOnce([]);
      prisma.attendanceException.findMany.mockResolvedValueOnce([]);

      const result = await service.getManagerEmployeeDetail(
        mockManagerUser,
        mockSubordinateEmpId,
        '2026-10-09',
      );

      expect(result.success).toBe(true);
      expect(result.data.employee.id).toBe(mockSubordinateEmpId);
    });
  });

  describe('Attendance Correction Workflow (Phase 4 Step 11)', () => {
    const mockApplicantUserId = 'user-applicant-1';
    const mockApplicantEmpId = 'emp-applicant-1';

    const mockApplicantUser: AuthenticatedUser = {
      id: mockApplicantUserId,
      email: 'applicant@company.com',
      organizationId: mockOrgId,
      branchId: mockBranchId,
      departmentId: 'dept-eng',
      firstName: 'Alan',
      lastName: 'Turing',
      employeeCode: 'EMP301',
      status: 'ACTIVE' as any,
      roles: ['EMPLOYEE' as any],
      permissions: ['ATTENDANCE_MARK', 'ATTENDANCE_VIEW'],
      sessionId: 'sess-applicant-1',
    };

    const mockApplicantProfile = {
      id: mockApplicantEmpId,
      userId: mockApplicantUserId,
      organizationId: mockOrgId,
      employeeCode: 'EMP301',
      displayName: 'Alan Turing',
      status: 'ACTIVE',
      isActive: true,
      deletedAt: null,
    };

    const mockApproverManagerUser: AuthenticatedUser = {
      id: 'user-approver-mgr',
      email: 'manager.jones@company.com',
      organizationId: mockOrgId,
      branchId: mockBranchId,
      departmentId: 'dept-eng',
      firstName: 'Indiana',
      lastName: 'Jones',
      employeeCode: 'MGR901',
      status: 'ACTIVE' as any,
      roles: ['MANAGER' as any],
      permissions: ['ATTENDANCE_VIEW', 'ATTENDANCE_UPDATE'],
      sessionId: 'sess-mgr-901',
    };

    const mockApproverManagerProfile = {
      id: 'emp-approver-mgr',
      userId: mockApproverManagerUser.id,
      organizationId: mockOrgId,
      employeeCode: 'MGR901',
      displayName: 'Indiana Jones',
      status: 'ACTIVE',
      isActive: true,
      deletedAt: null,
    };

    beforeEach(() => {
      prisma.employee.findFirst.mockImplementation(({ where }: any) => {
        if (where.userId === mockApplicantUserId) return Promise.resolve(mockApplicantProfile);
        if (where.userId === mockApproverManagerUser.id)
          return Promise.resolve(mockApproverManagerProfile);
        if (where.id === mockApplicantEmpId) return Promise.resolve(mockApplicantProfile);
        if (where.id === 'emp-foreign-org') return Promise.resolve(null);
        return Promise.resolve(null);
      });
    });

    it('1. employee submits correction request with reason category and evidence metadata', async () => {
      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(null); // No duplicate pending
      prisma.attendanceCorrectionRequest.create.mockImplementationOnce(({ data }: any) =>
        Promise.resolve({ id: 'corr-new-1', ...data }),
      );

      const result = await service.submitCorrectionRequest(mockApplicantUser, {
        targetDate: '2026-10-08',
        reasonCategory: 'MISSING_CHECKOUT' as any,
        reason: 'Network disconnect during checkout at client premises.',
        requestedCheckIn: '2026-10-08T03:30:00.000Z',
        requestedCheckOut: '2026-10-08T12:30:00.000Z',
        evidenceMetadata: { ticketId: 'INC-9021', note: 'Confirmed with supervisor' },
      });

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('corr-new-1');
      expect(result.data.reasonCategory).toBe('MISSING_CHECKOUT');
      expect(result.data.evidenceMetadata).toEqual({
        ticketId: 'INC-9021',
        note: 'Confirmed with supervisor',
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_CORRECTION_REQUESTED',
          metadata: expect.objectContaining({
            targetDate: '2026-10-08',
            reasonCategory: 'MISSING_CHECKOUT',
            hasEvidence: true,
          }),
        }),
      );
    });

    it('2. rejects submission for future dates', async () => {
      await expect(
        service.submitCorrectionRequest(mockApplicantUser, {
          targetDate: '2026-12-31',
          reason: 'Future punch correction attempt',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. rejects invalid time sequence where requested check-out is before check-in', async () => {
      await expect(
        service.submitCorrectionRequest(mockApplicantUser, {
          targetDate: '2026-10-08',
          requestedCheckIn: '2026-10-08T18:00:00.000Z',
          requestedCheckOut: '2026-10-08T09:00:00.000Z',
          reason: 'Typo in times',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. rejects duplicate pending request for same employee and target date', async () => {
      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce({
        id: 'corr-pending-existing',
        status: 'PENDING',
      });

      await expect(
        service.submitCorrectionRequest(mockApplicantUser, {
          targetDate: '2026-10-08',
          reason: 'Duplicate request',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('5. APPROVAL: manager approves subordinate request, calculating net hours and preserving raw events', async () => {
      const mockCorrection = {
        id: 'corr-valid-1',
        organizationId: mockOrgId,
        employeeId: mockApplicantEmpId,
        status: 'PENDING',
        targetDate: new Date('2026-10-08T00:00:00.000Z'),
        requestedCheckIn: new Date('2026-10-08T03:30:00.000Z'), // 09:00 IST
        requestedCheckOut: new Date('2026-10-08T12:30:00.000Z'), // 18:00 IST (9 gross hrs, 540 min)
        reason: JSON.stringify({
          category: 'MISSING_CHECKOUT',
          explanation: 'Forgot checkout due to fire drill',
        }),
        employee: mockApplicantProfile,
      };

      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(mockCorrection);
      hierarchyService.isManagerOf.mockResolvedValueOnce(true);
      prisma.attendanceDailySummary.findUnique.mockResolvedValueOnce({
        totalWorkMinutes: 0,
        status: 'ABSENT',
      });

      const res = await service.decideCorrectionRequest(mockApproverManagerUser, 'corr-valid-1', {
        decision: 'APPROVED',
        reviewNotes: 'Verified drill log and approved full day punch',
      });

      expect(res.success).toBe(true);
      expect(res.data.status).toBe('APPROVED');

      // Verify safe upsert of daily summary with isCorrected: true
      // Gross 540 min - 60 min break = 480 min net work minutes
      expect(prisma.attendanceDailySummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isCorrected: true,
            status: 'PRESENT',
            totalWorkMinutes: 480,
          }),
        }),
      );

      // Verify decision record created
      expect(prisma.attendanceCorrectionDecision.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            decision: 'APPROVED',
            reviewerId: mockApproverManagerUser.id,
            correctedWorkMinutes: 480,
          }),
        }),
      );

      // Verify raw attendance events were NOT deleted or touched
      expect(prisma.attendanceEvent.create).not.toHaveBeenCalled();

      // Verify audit record
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_CORRECTION_DECIDED',
          metadata: expect.objectContaining({
            decision: 'APPROVED',
            correctedWorkMinutes: 480,
          }),
        }),
      );
    });

    it('6. REJECTION: manager rejects subordinate request without modifying daily summary', async () => {
      const mockCorrection = {
        id: 'corr-valid-2',
        organizationId: mockOrgId,
        employeeId: mockApplicantEmpId,
        status: 'PENDING',
        targetDate: new Date('2026-10-08T00:00:00.000Z'),
        reason: 'Unverified punch request',
        employee: mockApplicantProfile,
      };

      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(mockCorrection);
      hierarchyService.isManagerOf.mockResolvedValueOnce(true);
      prisma.attendanceDailySummary.findUnique.mockResolvedValueOnce({
        totalWorkMinutes: 120,
        status: 'HALF_DAY',
      });

      const res = await service.decideCorrectionRequest(mockApproverManagerUser, 'corr-valid-2', {
        decision: 'REJECTED',
        reviewNotes: 'Cannot verify remote presence without log',
      });

      expect(res.success).toBe(true);
      expect(res.data.status).toBe('REJECTED');

      // Daily summary is NOT marked corrected or updated
      expect(prisma.attendanceDailySummary.upsert).not.toHaveBeenCalled();

      // Decision is saved with 0 corrected minutes
      expect(prisma.attendanceCorrectionDecision.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            decision: 'REJECTED',
            correctedWorkMinutes: 0,
          }),
        }),
      );
    });

    it('7. ANTI-FRAUD: strictly prevents self-approval when applicant attempts to approve own request', async () => {
      const mockSelfCorrection = {
        id: 'corr-self-1',
        organizationId: mockOrgId,
        employeeId: mockApproverManagerProfile.id,
        status: 'PENDING',
        targetDate: new Date('2026-10-08T00:00:00.000Z'),
        employee: {
          id: mockApproverManagerProfile.id,
          userId: mockApproverManagerUser.id, // SAME USER AS CALLER!
        },
      };

      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(mockSelfCorrection);

      await expect(
        service.decideCorrectionRequest(mockApproverManagerUser, 'corr-self-1', {
          decision: 'APPROVED',
          reviewNotes: 'Self approving my own missed punch',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('8. CONCURRENCY: prevents duplicate decisions on requests that are no longer pending', async () => {
      const mockAlreadyApprovedCorrection = {
        id: 'corr-already-done',
        organizationId: mockOrgId,
        employeeId: mockApplicantEmpId,
        status: 'APPROVED', // Already approved!
        targetDate: new Date('2026-10-08T00:00:00.000Z'),
        employee: mockApplicantProfile,
      };

      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(
        mockAlreadyApprovedCorrection,
      );

      await expect(
        service.decideCorrectionRequest(mockApproverManagerUser, 'corr-already-done', {
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('9. IDOR SECURITY: blocks decision on request belonging to another organization', async () => {
      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(null); // Cross-org query returns null

      await expect(
        service.decideCorrectionRequest(mockApproverManagerUser, 'corr-other-tenant', {
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('10. IDOR SECURITY: blocks manager from deciding request for employee outside their hierarchy', async () => {
      const mockOutsiderCorrection = {
        id: 'corr-outsider-report',
        organizationId: mockOrgId,
        employeeId: 'emp-other-department',
        status: 'PENDING',
        targetDate: new Date('2026-10-08T00:00:00.000Z'),
        employee: { id: 'emp-other-department', userId: 'user-other' },
      };

      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValueOnce(mockOutsiderCorrection);
      hierarchyService.isManagerOf.mockResolvedValueOnce(false); // OUTSIDE HIERARCHY!

      await expect(
        service.decideCorrectionRequest(mockApproverManagerUser, 'corr-outsider-report', {
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('11. retrieves organizational correction requests for HR operations review', async () => {
      const mockCorrItem = {
        id: 'corr-org-1',
        organizationId: mockOrgId,
        employeeId: mockApplicantEmpId,
        status: 'PENDING',
        targetDate: new Date('2026-10-08T00:00:00.000Z'),
        reason: JSON.stringify({
          category: 'TECHNICAL_GLITCH',
          explanation: 'Biometric device failed',
        }),
        employee: mockApplicantProfile,
        decision: null,
      };

      prisma.attendanceCorrectionRequest.findMany.mockResolvedValueOnce([mockCorrItem]);

      const res = await service.getOperationsCorrections(mockOrgId, 'PENDING');

      expect(res.success).toBe(true);
      expect(res.data.length).toBe(1);
      expect(res.data[0].reasonCategory).toBe('TECHNICAL_GLITCH');
      expect(res.data[0].explanation).toBe('Biometric device failed');
    });
  });

  describe('Attendance Exceptions Workflow (Phase 4 Step 12)', () => {
    const mockExceptionItem = {
      id: 'exc-step12-1',
      organizationId: mockOrgId,
      employeeId: mockEmployeeId,
      date: new Date('2026-10-09T00:00:00.000Z'),
      exceptionType: 'LATE_ARRIVAL',
      severity: 'LOW',
      details: { lateMinutes: 25, shiftStartTime: '09:00' },
      status: 'OPEN',
      resolved: false,
      resolvedAt: null,
      resolvedById: null,
      resolutionNotes: null,
      idempotencyKey: `ex:late_arrival:${mockEmployeeId}:2026-10-09`,
      createdAt: new Date('2026-10-09T09:25:00.000Z'),
      updatedAt: new Date('2026-10-09T09:25:00.000Z'),
      employee: {
        id: mockEmployeeId,
        employeeCode: 'EMP-001',
        firstName: 'Jane',
        lastName: 'Doe',
        displayName: 'Jane Doe',
        user: { email: 'jane.doe@company.com' },
        employment: {
          department: { id: 'dept-1', name: 'Engineering' },
          designation: { id: 'desig-1', name: 'Developer' },
        },
      },
      resolvedBy: null,
    };

    it('1. recordAttendanceException records exception and strips sensitive lat/long coordinates', async () => {
      prisma.attendanceException.findUnique.mockResolvedValueOnce(null);

      await service.recordAttendanceException({
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        date: new Date('2026-10-09'),
        exceptionType: 'OUTSIDE_GEOFENCE',
        severity: 'HIGH',
        details: {
          distanceMeters: 450,
          latitude: 12.9716, // MUST BE STRIPPED
          longitude: 77.5946, // MUST BE STRIPPED
          password: 'secret', // MUST BE STRIPPED
          officeName: 'Headquarters',
        },
        idempotencyKey: 'ex:outside_geofence:test-1',
      });

      expect(prisma.attendanceException.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            exceptionType: 'OUTSIDE_GEOFENCE',
            severity: 'HIGH',
            details: expect.not.objectContaining({
              latitude: 12.9716,
              longitude: 77.5946,
              password: 'secret',
            }),
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_EXCEPTION_FLAGGED',
        }),
      );
    });

    it('2. IDEMPOTENCY: returns existing exception without duplicate database insertions', async () => {
      prisma.attendanceException.findUnique.mockResolvedValueOnce(mockExceptionItem);

      const res = await service.recordAttendanceException({
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        date: new Date('2026-10-09'),
        exceptionType: 'LATE_ARRIVAL',
        details: { lateMinutes: 25 },
        idempotencyKey: mockExceptionItem.idempotencyKey,
      });

      expect(res?.id).toBe(mockExceptionItem.id);
      expect(prisma.attendanceException.create).not.toHaveBeenCalled();
    });

    it('3. retrieves filtered exception queue with status, severity, pagination, and KPI counts', async () => {
      prisma.attendanceException.findMany.mockResolvedValueOnce([mockExceptionItem]);
      prisma.attendanceException.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // open
        .mockResolvedValueOnce(0) // resolved
        .mockResolvedValueOnce(0) // dismissed
        .mockResolvedValueOnce(0); // high severity

      const res = await service.getExceptions(mockOrgId, {
        status: 'OPEN',
        severity: 'LOW',
        page: 1,
        limit: 10,
      });

      expect(res.success).toBe(true);
      expect(res.data.length).toBe(1);
      expect(res.data[0].exceptionType).toBe('LATE_ARRIVAL');
      expect(res.counts.open).toBe(1);
      expect(res.meta.total).toBe(1);
    });

    it('4. getExceptionById retrieves single exception and throws NotFoundException for cross-org', async () => {
      prisma.attendanceException.findFirst.mockResolvedValueOnce(mockExceptionItem);

      const found = await service.getExceptionById(mockOrgId, 'exc-step12-1');
      expect(found.success).toBe(true);
      expect(found.data.id).toBe('exc-step12-1');

      prisma.attendanceException.findFirst.mockResolvedValueOnce(null);
      await expect(service.getExceptionById('other-org', 'exc-step12-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('5. RESOLUTION: resolves exception with reviewer notes and audit event', async () => {
      prisma.attendanceException.findFirst.mockResolvedValueOnce(mockExceptionItem);
      prisma.attendanceException.update.mockResolvedValueOnce({
        ...mockExceptionItem,
        status: 'RESOLVED',
        resolved: true,
        resolvedAt: new Date(),
        resolvedById: mockUser.id,
        resolutionNotes: 'Verified bus breakdown; approved late arrival.',
      });

      const res = await service.resolveException(mockUser, 'exc-step12-1', {
        status: 'RESOLVED',
        resolutionNotes: 'Verified bus breakdown; approved late arrival.',
      });

      expect(res.success).toBe(true);
      expect(res.data.status).toBe('RESOLVED');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_EXCEPTION_RESOLVED',
        }),
      );
    });

    it('6. DISMISSAL: dismisses exception with reviewer notes', async () => {
      prisma.attendanceException.findFirst.mockResolvedValueOnce(mockExceptionItem);
      prisma.attendanceException.update.mockResolvedValueOnce({
        ...mockExceptionItem,
        status: 'DISMISSED',
        resolved: true,
        resolvedAt: new Date(),
        resolvedById: mockUser.id,
        resolutionNotes: 'False alarm, employee was present on client call.',
      });

      const res = await service.resolveException(mockUser, 'exc-step12-1', {
        status: 'DISMISSED',
        resolutionNotes: 'False alarm, employee was present on client call.',
      });

      expect(res.success).toBe(true);
      expect(res.data.status).toBe('DISMISSED');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_EXCEPTION_DISMISSED',
        }),
      );
    });

    it('7. CONCURRENCY: prevents duplicate decision if exception is already resolved', async () => {
      prisma.attendanceException.findFirst.mockResolvedValueOnce({
        ...mockExceptionItem,
        status: 'RESOLVED',
        resolved: true,
      });

      await expect(
        service.resolveException(mockUser, 'exc-step12-1', {
          status: 'RESOLVED',
          resolutionNotes: 'Attempting duplicate resolution',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('8. BATCH SCAN: scans summaries and detects late arrivals and missing checkouts idempotently', async () => {
      prisma.attendanceDailySummary.findMany.mockResolvedValueOnce([
        {
          id: 'sum-late',
          organizationId: mockOrgId,
          employeeId: mockEmployeeId,
          date: new Date('2026-10-09T00:00:00.000Z'),
          lateMinutes: 30,
          earlyExitMinutes: 0,
          status: 'PRESENT',
          firstCheckIn: new Date('2026-10-09T09:30:00.000Z'),
          shift: { startTime: '09:00', endTime: '18:00' },
        },
        {
          id: 'sum-incomplete',
          organizationId: mockOrgId,
          employeeId: 'emp-2',
          date: new Date('2026-10-09T00:00:00.000Z'),
          lateMinutes: 0,
          earlyExitMinutes: 0,
          status: 'INCOMPLETE',
          firstCheckIn: new Date('2026-10-09T09:00:00.000Z'),
          shift: { startTime: '09:00', endTime: '18:00' },
        },
      ]);
      prisma.attendanceException.findUnique.mockResolvedValue(null);

      const scanResult = await service.scanExceptions(mockOrgId, '2026-10-09');
      expect(scanResult.success).toBe(true);
      expect(scanResult.detectedCount).toBe(2);
      expect(scanResult.scannedSummariesCount).toBe(2);
    });
  });

  describe('Official Visit Check-In Flow (Phase 5 Step 6)', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayMidnight = new Date(`${todayStr}T00:00:00.000Z`);

    const mockVisit = {
      id: 'visit-approved-1',
      organizationId: mockOrgId,
      employeeId: mockEmployeeId,
      title: 'Client Site Inspection',
      purpose: 'Technical Audit',
      startDate: todayMidnight,
      endDate: todayMidnight,
      status: 'APPROVED',
      destinations: [
        {
          id: 'dest-client-hq',
          visitId: 'visit-approved-1',
          destinationName: 'Client Tech Park',
          latitude: 12.9352,
          longitude: 77.6245,
          radiusMeters: 200,
          isGeofenceRequired: true,
        },
      ],
    };

    it('successfully processes approved official visit check-in within destination geofence', async () => {
      prisma.officialVisit.findFirst.mockResolvedValueOnce(mockVisit);

      const dto: CheckInDto = {
        latitude: 12.9352,
        longitude: 77.6245,
        accuracyMeters: 20,
        idempotencyKey: 'idem-visit-checkin-1',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
      };

      const result = await service.checkIn(mockUser, dto);

      expect(result.success).toBe(true);
      expect((result.data as any)?.session?.attendanceMode).toBe('OFFICIAL_VISIT');
      expect((result.data as any)?.session?.officialVisitId).toBe(mockVisit.id);
      expect((result.data as any)?.event?.attendanceMode).toBe('OFFICIAL_VISIT');
      expect((result.data as any)?.event?.officialVisitId).toBe(mockVisit.id);
      expect((result.data as any)?.officialVisit?.status).toBe('IN_PROGRESS');

      // Verify VisitLocationVerification was created
      expect(prisma.visitLocationVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            visitId: mockVisit.id,
            outcome: 'VERIFIED',
            isVerified: true,
          }),
        }),
      );

      // Verify visit transitioned to IN_PROGRESS
      expect(prisma.officialVisit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockVisit.id },
          data: { status: 'IN_PROGRESS' },
        }),
      );

      // Verify summary has primaryAttendanceMode OFFICIAL_VISIT
      expect(prisma.attendanceDailySummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            primaryAttendanceMode: 'OFFICIAL_VISIT',
            officialVisitId: mockVisit.id,
          }),
        }),
      );
    });

    it('returns idempotent result on duplicate official visit check-in with same key', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValueOnce({
        id: 'evt-cached-visit',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        idempotencyKey: 'idem-visit-duplicate',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
        session: {
          id: 'sess-cached-visit',
          attendanceMode: 'OFFICIAL_VISIT',
          status: 'OPEN',
          officialVisitId: mockVisit.id,
          date: todayMidnight,
        },
      });

      const dto: CheckInDto = {
        idempotencyKey: 'idem-visit-duplicate',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
      };

      const result = await service.checkIn(mockUser, dto);
      expect(result.success).toBe(true);
      expect((result.data as any)?.isIdempotentReplay).toBe(true);
      expect((result.data as any)?.session?.attendanceMode).toBe('OFFICIAL_VISIT');
    });

    it('rejects check-in if official visit belongs to another employee (VISIT_NOT_OWNED)', async () => {
      prisma.officialVisit.findFirst.mockResolvedValueOnce({
        ...mockVisit,
        employeeId: 'other-emp-999',
      });

      const dto: CheckInDto = {
        latitude: 12.9352,
        longitude: 77.6245,
        idempotencyKey: 'idem-visit-unowned',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects check-in if official visit is cancelled (VISIT_ALREADY_CANCELLED)', async () => {
      prisma.officialVisit.findFirst.mockResolvedValueOnce({
        ...mockVisit,
        status: 'CANCELLED',
      });

      const dto: CheckInDto = {
        latitude: 12.9352,
        longitude: 77.6245,
        idempotencyKey: 'idem-visit-cancelled',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects check-in if official visit is already completed (VISIT_ALREADY_COMPLETED)', async () => {
      prisma.officialVisit.findFirst.mockResolvedValueOnce({
        ...mockVisit,
        status: 'COMPLETED',
      });

      const dto: CheckInDto = {
        latitude: 12.9352,
        longitude: 77.6245,
        idempotencyKey: 'idem-visit-completed',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects check-in if date is outside approved visit window (VISIT_OUTSIDE_DATE_WINDOW)', async () => {
      prisma.officialVisit.findFirst.mockResolvedValueOnce({
        ...mockVisit,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-02T00:00:00.000Z'),
      });

      const dto: CheckInDto = {
        latitude: 12.9352,
        longitude: 77.6245,
        idempotencyKey: 'idem-visit-out-date',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects check-in if device is outside approved destination radius (OUTSIDE_APPROVED_AREA)', async () => {
      prisma.officialVisit.findFirst.mockResolvedValueOnce(mockVisit);

      const dto: CheckInDto = {
        latitude: 13.0827, // Chennai (~300km away from Bangalore destination)
        longitude: 80.2707,
        idempotencyKey: 'idem-visit-outside',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('accepts check-in with documented GPS exception for indoor/remote sites', async () => {
      prisma.officialVisit.findFirst.mockResolvedValueOnce(mockVisit);

      const dto: CheckInDto = {
        idempotencyKey: 'idem-visit-exception',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
        gpsExceptionReason: 'Client site underground data vault with zero satellite reception',
      };

      const result = await service.checkIn(mockUser, dto);
      expect(result.success).toBe(true);
      expect((result.data as any)?.event?.geofenceStatus).toBe('EXEMPT');
      expect((result.data as any)?.officialVisit?.isException).toBe(true);

      expect(prisma.visitLocationVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'GPS_EXCEPTION_DOCUMENTED',
            isException: true,
          }),
        }),
      );
    });

    it('rejects check-in without coordinates when GPS exception reason is missing or < 10 chars', async () => {
      prisma.officialVisit.findFirst.mockResolvedValueOnce(mockVisit);

      const dto: CheckInDto = {
        idempotencyKey: 'idem-visit-short-reason',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
        gpsExceptionReason: 'short',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('concurrency: rejects concurrent check-in collision (P2002)', async () => {
      prisma.officialVisit.findFirst.mockResolvedValueOnce(mockVisit);
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });

      const dto: CheckInDto = {
        latitude: 12.9352,
        longitude: 77.6245,
        idempotencyKey: 'idem-visit-collision',
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: mockVisit.id,
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('Official Visit Check-Out Flow & Summary Reconciliation (Phase 5 Step 6)', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayMidnight = new Date(`${todayStr}T00:00:00.000Z`);

    const openVisitSession = {
      id: 'sess-visit-open',
      organizationId: mockOrgId,
      employeeId: mockEmployeeId,
      attendanceMode: 'OFFICIAL_VISIT',
      officialVisitId: 'visit-approved-1',
      date: todayMidnight,
      checkInTime: new Date(Date.now() - 4 * 3600 * 1000), // 4 hours ago
      status: 'OPEN',
      events: [
        {
          id: 'evt-visit-in',
          eventType: 'CHECK_IN',
          eventTimestamp: new Date(Date.now() - 4 * 3600 * 1000),
          attendanceMode: 'OFFICIAL_VISIT',
        },
      ],
    };

    it('checks out of official visit session, bypasses office geofence and marks visit COMPLETED', async () => {
      prisma.attendanceSession.findFirst.mockResolvedValueOnce(openVisitSession);
      prisma.attendanceEvent.findMany.mockResolvedValueOnce(openVisitSession.events);
      prisma.officialVisit.findUnique.mockResolvedValueOnce({
        id: 'visit-approved-1',
        status: 'IN_PROGRESS',
        startDate: todayMidnight,
        endDate: todayMidnight, // 1-day visit ending today
      });
      prisma.attendanceSession.findMany.mockResolvedValueOnce([openVisitSession]);

      const dto: CheckOutDto = {
        latitude: 12.9352,
        longitude: 77.6245,
        idempotencyKey: 'idem-visit-checkout-1',
      };

      const result = await service.checkOut(mockUser, dto);

      expect(result.success).toBe(true);
      expect((result.data as any)?.session?.status).toBe('COMPLETED');
      expect((result.data as any)?.event?.attendanceMode).toBe('OFFICIAL_VISIT');
      expect((result.data as any)?.event?.officialVisitId).toBe('visit-approved-1');

      // Verify visit transitioned to COMPLETED
      expect(prisma.officialVisit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'visit-approved-1' },
          data: { status: 'COMPLETED' },
        }),
      );

      // Verify daily summary was recalculated with OFFICIAL_VISIT
      expect(prisma.attendanceDailySummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            primaryAttendanceMode: 'OFFICIAL_VISIT',
            officialVisitId: 'visit-approved-1',
          }),
        }),
      );
    });

    it('recalculates daily summary and preserves event history and OFFICIAL_VISIT mode', async () => {
      prisma.attendanceSession.findMany.mockResolvedValueOnce([
        {
          ...openVisitSession,
          status: 'COMPLETED',
          checkOutTime: new Date(),
          totalWorkMinutes: 240,
          totalBreakMinutes: 0,
        },
      ]);

      await service.recalculateDailySummary(
        prisma,
        mockEmployeeId,
        mockOrgId,
        todayMidnight,
        mockPolicy,
        mockShift,
      );

      expect(prisma.attendanceDailySummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            primaryAttendanceMode: 'OFFICIAL_VISIT',
            officialVisitId: 'visit-approved-1',
          }),
          update: expect.objectContaining({
            primaryAttendanceMode: 'OFFICIAL_VISIT',
            officialVisitId: 'visit-approved-1',
          }),
        }),
      );
    });
  });

  describe('WFH Attendance Flow (Phase 5 Step 11)', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

    const mockWfhRequest = {
      id: 'wfh-req-1',
      organizationId: mockOrgId,
      employeeId: mockEmployeeId,
      status: 'APPROVED',
      startDate: todayDate,
      endDate: todayDate,
      durationType: 'FULL_DAY',
      reason: 'Working from home due to home network upgrade',
    };

    it('successfully processes approved WFH check-in without requiring GPS', async () => {
      prisma.wfhRequest.findFirst.mockResolvedValue(mockWfhRequest);

      const dto: CheckInDto = {
        idempotencyKey: 'idem-wfh-1',
        attendanceMode: 'WFH',
      };

      const result = await service.checkIn(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.message).toContain('WFH check-in verified');
      expect(prisma.attendanceSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attendanceMode: 'WFH',
            wfhRequestId: 'wfh-req-1',
          }),
        }),
      );
      expect(prisma.attendanceEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attendanceMode: 'WFH',
            wfhRequestId: 'wfh-req-1',
            geofenceStatus: 'EXEMPT',
          }),
        }),
      );
    });

    it('rejects WFH check-in if WFH request belongs to another employee', async () => {
      prisma.wfhRequest.findFirst.mockResolvedValue({
        ...mockWfhRequest,
        employeeId: 'other-emp-id',
      });

      const dto: CheckInDto = {
        idempotencyKey: 'idem-wfh-other',
        wfhRequestId: 'wfh-req-1',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects WFH check-in if request is not approved', async () => {
      prisma.wfhRequest.findFirst.mockResolvedValue({
        ...mockWfhRequest,
        status: 'SUBMITTED',
      });

      const dto: CheckInDto = {
        idempotencyKey: 'idem-wfh-pending',
        wfhRequestId: 'wfh-req-1',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects WFH check-in if request is cancelled', async () => {
      prisma.wfhRequest.findFirst.mockResolvedValue({
        ...mockWfhRequest,
        status: 'CANCELLED',
      });

      const dto: CheckInDto = {
        idempotencyKey: 'idem-wfh-cancelled',
        wfhRequestId: 'wfh-req-1',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects WFH check-in if current date is outside approved date window', async () => {
      const pastDate = new Date(Date.now() - 5 * 86400000);
      prisma.wfhRequest.findFirst.mockResolvedValue({
        ...mockWfhRequest,
        startDate: pastDate,
        endDate: pastDate,
      });

      const dto: CheckInDto = {
        idempotencyKey: 'idem-wfh-expired',
        wfhRequestId: 'wfh-req-1',
      };

      await expect(service.checkIn(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('checks out of WFH session, bypasses office geofence and marks summary with WFH mode', async () => {
      const openWfhSession = {
        id: 'sess-wfh-1',
        employeeId: mockEmployeeId,
        date: todayDate,
        status: 'OPEN',
        attendanceMode: 'WFH',
        wfhRequestId: 'wfh-req-1',
        checkInTime: new Date(Date.now() - 4 * 3600000),
        events: [
          {
            id: 'evt-in',
            eventType: 'CHECK_IN',
            eventTimestamp: new Date(Date.now() - 4 * 3600000),
          },
        ],
      };

      prisma.attendanceSession.findFirst.mockResolvedValue(openWfhSession);
      prisma.attendanceEvent.findMany.mockResolvedValue(openWfhSession.events);
      prisma.attendanceSession.update.mockResolvedValue({
        ...openWfhSession,
        status: 'COMPLETED',
      });

      const dto: CheckOutDto = {
        idempotencyKey: 'idem-wfh-out-1',
      };

      const result = await service.checkOut(mockUser, dto);

      expect(result.success).toBe(true);
      expect(result.message).toContain('WFH check-out verified');
      expect(prisma.attendanceEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attendanceMode: 'WFH',
            wfhRequestId: 'wfh-req-1',
            geofenceStatus: 'EXEMPT',
          }),
        }),
      );
    });
  });
});
