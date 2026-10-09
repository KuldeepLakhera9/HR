import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AttendanceService } from './attendance.service';
import { AttendancePoliciesService } from './attendance-policies.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { DecideCorrectionRequestDto } from './dto/decide-correction.dto';

describe('Phase 4 — Step 14: Dedicated Attendance Security Review', () => {
  let attendanceService: AttendanceService;
  let policiesService: any;
  let hierarchyService: any;
  let prisma: any;
  let audit: any;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  const mockTenantAlpha = 'org-tenant-alpha';
  const mockTenantBeta = 'org-tenant-beta';

  // Users
  const userEmployeeAlpha: AuthenticatedUser = {
    id: 'user-emp-alpha',
    email: 'alice@alpha.com',
    organizationId: mockTenantAlpha,
    branchId: 'branch-alpha-main',
    departmentId: 'dept-eng',
    firstName: 'Alice',
    lastName: 'Engineer',
    employeeCode: 'EMP001',
    status: 'ACTIVE' as any,
    roles: ['EMPLOYEE' as any],
    permissions: ['ATTENDANCE_MARK', 'ATTENDANCE_VIEW'],
    sessionId: 'sess-emp-1',
  };

  const userEmployeeBeta: AuthenticatedUser = {
    id: 'user-emp-beta',
    email: 'bob@alpha.com',
    organizationId: mockTenantAlpha,
    branchId: 'branch-alpha-main',
    departmentId: 'dept-sales',
    firstName: 'Bob',
    lastName: 'Sales',
    employeeCode: 'EMP002',
    status: 'ACTIVE' as any,
    roles: ['EMPLOYEE' as any],
    permissions: ['ATTENDANCE_MARK', 'ATTENDANCE_VIEW'],
    sessionId: 'sess-emp-2',
  };

  const userManagerAlpha: AuthenticatedUser = {
    id: 'user-mgr-alpha',
    email: 'manager@alpha.com',
    organizationId: mockTenantAlpha,
    branchId: 'branch-alpha-main',
    departmentId: 'dept-eng',
    firstName: 'Charlie',
    lastName: 'Manager',
    employeeCode: 'MGR001',
    status: 'ACTIVE' as any,
    roles: ['MANAGER' as any],
    permissions: ['ATTENDANCE_MARK', 'ATTENDANCE_VIEW', 'ATTENDANCE_UPDATE'],
    sessionId: 'sess-mgr-1',
  };

  const userAdminAlpha: AuthenticatedUser = {
    id: 'user-admin-alpha',
    email: 'admin@alpha.com',
    organizationId: mockTenantAlpha,
    branchId: 'branch-alpha-main',
    departmentId: 'dept-hr',
    firstName: 'David',
    lastName: 'Admin',
    employeeCode: 'ADM001',
    status: 'ACTIVE' as any,
    roles: ['ADMIN' as any],
    permissions: ['ATTENDANCE_MARK', 'ATTENDANCE_VIEW', 'ATTENDANCE_UPDATE', 'ATTENDANCE_VIEW_GPS'],
    sessionId: 'sess-adm-1',
  };

  // Employees in DB
  const mockEmpAlpha = {
    id: 'emp-alpha-101',
    userId: userEmployeeAlpha.id,
    organizationId: mockTenantAlpha,
    employeeCode: 'EMP001',
    displayName: 'Alice Engineer',
    status: 'ACTIVE',
    isActive: true,
    deletedAt: null,
    employment: {
      branchId: 'branch-alpha-main',
      branch: { id: 'branch-alpha-main', name: 'Alpha HQ' },
      department: { id: 'dept-eng', name: 'Engineering' },
      designation: { id: 'desig-dev', title: 'Senior Developer' },
    },
  };

  const mockEmpBeta = {
    id: 'emp-alpha-102',
    userId: userEmployeeBeta.id,
    organizationId: mockTenantAlpha,
    employeeCode: 'EMP002',
    displayName: 'Bob Sales',
    status: 'ACTIVE',
    isActive: true,
    deletedAt: null,
    employment: {
      branchId: 'branch-alpha-main',
      branch: { id: 'branch-alpha-main', name: 'Alpha HQ' },
      department: { id: 'dept-sales', name: 'Sales' },
      designation: { id: 'desig-sales', title: 'Account Executive' },
    },
  };

  const mockMgrEmp = {
    id: 'emp-mgr-100',
    userId: userManagerAlpha.id,
    organizationId: mockTenantAlpha,
    employeeCode: 'MGR001',
    displayName: 'Charlie Manager',
    status: 'ACTIVE',
    isActive: true,
    deletedAt: null,
    employment: {
      branchId: 'branch-alpha-main',
      branch: { id: 'branch-alpha-main', name: 'Alpha HQ' },
      department: { id: 'dept-eng', name: 'Engineering' },
      designation: { id: 'desig-mgr', title: 'Engineering Manager' },
    },
  };

  // Office location (Bangalore HQ: lat 12.9716, lng 77.5946, radius 200m)
  const mockOfficeAlpha = {
    id: 'office-alpha-blr',
    organizationId: mockTenantAlpha,
    branchId: 'branch-alpha-main',
    name: 'Bangalore Office',
    latitude: 12.9716,
    longitude: 77.5946,
    geofenceRadiusMeters: 200,
    isActive: true,
  };

  const mockPolicy = {
    id: 'policy-std',
    name: 'Standard Policy',
    organizationId: mockTenantAlpha,
    workingDayStartHour: 5,
    timezone: 'Asia/Kolkata',
    geofenceEnforcement: true,
    allowMultipleSessions: false,
    maxGpsAccuracyMeters: 100,
    gracePeriodMinutes: 15,
    standardWorkMinutes: 480,
    fullDayThresholdMinutes: 420,
    halfDayThresholdMinutes: 240,
    maxDailyBreakMinutes: 60,
  };

  const mockShift = {
    id: 'shift-gen',
    name: 'General Shift',
    code: 'GEN',
    startTime: '09:00',
    endTime: '18:00',
    breakDurationMinutes: 60,
  };

  beforeEach(async () => {
    prisma = {
      attendanceEvent: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      attendanceSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      attendanceDailySummary: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      attendanceException: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      attendanceCorrectionRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      attendanceCorrectionDecision: {
        upsert: jest.fn().mockResolvedValue({ id: 'decision-1' }),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      officeLocation: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    audit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
    };

    policiesService = {
      resolveEffectivePolicyAndShift: jest.fn().mockResolvedValue({
        policy: mockPolicy,
        shift: mockShift,
        source: 'ORGANIZATION_DEFAULT',
      }),
    };

    hierarchyService = {
      isManagerOf: jest.fn(),
      getTeam: jest.fn(),
    };

    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: AttendancePoliciesService, useValue: policiesService },
        { provide: HierarchyService, useValue: hierarchyService },
      ],
    }).compile();

    attendanceService = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. UNAUTHENTICATED REQUESTS & SESSION INTEGRATION
  // ===========================================================================
  describe('Control 1: Unauthenticated Requests & RolesGuard Enforcement', () => {
    it('should reject unauthenticated request without user context in RolesGuard', () => {
      const mockContext: any = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: undefined }),
        }),
      };

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'HR']);

      expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should reject user whose roles do not include the required role', () => {
      const mockContext: any = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: userEmployeeAlpha }), // role is EMPLOYEE
        }),
      };

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'HR']);

      expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should allow user possessing the required role', () => {
      const mockContext: any = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: userAdminAlpha }), // role is ADMIN
        }),
      };

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'HR']);

      expect(rolesGuard.canActivate(mockContext)).toBe(true);
    });
  });

  // ===========================================================================
  // 2. CROSS-ORGANIZATION TENANT ISOLATION
  // ===========================================================================
  describe('Control 2: Cross-Organization IDs & Multi-Tenant Boundary', () => {
    it('should reject check-in if officeLocationId belongs to another organization', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue(null);
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);

      // Office location queried with organizationId: mockTenantAlpha, returns null because it belongs to Beta
      prisma.officeLocation.findFirst.mockResolvedValue(null);

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'key-cross-org-office',
        officeLocationId: 'office-beta-foreign',
      };

      await expect(attendanceService.checkIn(userEmployeeAlpha, dto)).rejects.toThrow(
        BadRequestException,
      );

      // Verify Prisma query strictly enforced tenant organizationId
      expect(prisma.officeLocation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'office-beta-foreign',
          organizationId: mockTenantAlpha,
          isActive: true,
        },
      });
    });

    it('should reject check-in when idempotency key belongs to another organization', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue({
        id: 'event-foreign',
        organizationId: mockTenantBeta, // Belongs to Beta!
      });

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'key-from-beta',
      };

      await expect(attendanceService.checkIn(userEmployeeAlpha, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should block deciding correction requests belonging to another organization', async () => {
      // Correction request lookup restricted by user.organizationId
      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValue(null);

      const dto: DecideCorrectionRequestDto = {
        decision: 'APPROVED',
        reviewNotes: 'Cross-tenant attempt',
      };

      await expect(
        attendanceService.decideCorrectionRequest(userAdminAlpha, 'foreign-req-id', dto),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.attendanceCorrectionRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'foreign-req-id',
            organizationId: mockTenantAlpha,
          },
        }),
      );
    });
  });

  // ===========================================================================
  // 3. EMPLOYEE ACCESS TO ANOTHER EMPLOYEE (ANTI-HORIZONTAL PRIVILEGE ESCALATION)
  // ===========================================================================
  describe('Control 3: Employee Access to Another Employee Records', () => {
    it('should strictly prohibit an employee from viewing attendance details of another employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmpBeta); // Target is Bob

      // Alice (EMPLOYEE role) tries to view Bob's detailed records
      await expect(
        attendanceService.getOperationsEmployeeDetail(userEmployeeAlpha, mockEmpBeta.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should permit an employee to view their own attendance details', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);
      prisma.attendanceDailySummary.findUnique.mockResolvedValue(null);
      prisma.attendanceSession.findMany.mockResolvedValue([]);
      prisma.attendanceException.findMany.mockResolvedValue([]);

      const result = await attendanceService.getOperationsEmployeeDetail(
        userEmployeeAlpha,
        mockEmpAlpha.id,
      );

      expect(result.success).toBe(true);
      expect(result.data.employee.id).toBe(mockEmpAlpha.id);
    });
  });

  // ===========================================================================
  // 4. MANAGER ACCESS TO ANOTHER TEAM
  // ===========================================================================
  describe('Control 4: Manager Access Across Team Boundaries', () => {
    it('should block manager from viewing records of an employee outside their hierarchy', async () => {
      prisma.employee.findFirst
        .mockResolvedValueOnce(mockEmpBeta) // Target is Bob (in Sales)
        .mockResolvedValueOnce(mockMgrEmp); // Manager is Charlie (Engineering)

      // Hierarchy service reports Charlie is NOT manager of Bob
      hierarchyService.isManagerOf.mockResolvedValue(false);

      await expect(
        attendanceService.getManagerEmployeeDetail(userManagerAlpha, mockEmpBeta.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block manager from deciding correction requests for employee outside team', async () => {
      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValue({
        id: 'corr-sales-1',
        organizationId: mockTenantAlpha,
        employeeId: mockEmpBeta.id,
        employee: mockEmpBeta,
        status: 'PENDING',
      });

      prisma.employee.findFirst.mockResolvedValue(mockMgrEmp);
      hierarchyService.isManagerOf.mockResolvedValue(false);

      const dto: DecideCorrectionRequestDto = {
        decision: 'APPROVED',
        reviewNotes: 'Unauthorized approval',
      };

      await expect(
        attendanceService.decideCorrectionRequest(userManagerAlpha, 'corr-sales-1', dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow manager to approve legitimate subordinate correction request', async () => {
      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValue({
        id: 'corr-eng-1',
        organizationId: mockTenantAlpha,
        employeeId: mockEmpAlpha.id, // Alice is in Charlie's engineering team
        employee: mockEmpAlpha,
        status: 'PENDING',
        targetDate: new Date('2026-10-01T00:00:00.000Z'),
        requestedCheckIn: new Date('2026-10-01T09:00:00.000Z'),
        requestedCheckOut: new Date('2026-10-01T18:00:00.000Z'),
      });

      prisma.employee.findFirst.mockResolvedValue(mockMgrEmp);
      hierarchyService.isManagerOf.mockResolvedValue(true); // Alice is subordinate!

      prisma.attendanceCorrectionRequest.update.mockResolvedValue({
        id: 'corr-eng-1',
        status: 'APPROVED',
      });
      prisma.attendanceDailySummary.upsert.mockResolvedValue({});

      const dto: DecideCorrectionRequestDto = {
        decision: 'APPROVED',
        reviewNotes: 'Approved legitimate subordinate request',
      };

      const result = await attendanceService.decideCorrectionRequest(
        userManagerAlpha,
        'corr-eng-1',
        dto,
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('APPROVED');
    });
  });

  // ===========================================================================
  // 5. CORRECTION SELF-APPROVAL ANTI-FRAUD
  // ===========================================================================
  describe('Control 5: Correction Self-Approval Anti-Fraud', () => {
    it('should strictly prohibit an employee from approving their own correction request', async () => {
      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValue({
        id: 'corr-self-1',
        organizationId: mockTenantAlpha,
        employeeId: mockEmpAlpha.id,
        employee: mockEmpAlpha, // Linked to Alice's userId
        status: 'PENDING',
      });

      const dto: DecideCorrectionRequestDto = {
        decision: 'APPROVED',
        reviewNotes: 'Self approval attempt',
      };

      await expect(
        attendanceService.decideCorrectionRequest(userEmployeeAlpha, 'corr-self-1', dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prohibit even a Manager from approving their own personal correction request', async () => {
      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValue({
        id: 'corr-mgr-self',
        organizationId: mockTenantAlpha,
        employeeId: mockMgrEmp.id,
        employee: mockMgrEmp, // Linked to Charlie's userId
        status: 'PENDING',
      });

      const dto: DecideCorrectionRequestDto = {
        decision: 'APPROVED',
        reviewNotes: 'Manager self-approving',
      };

      await expect(
        attendanceService.decideCorrectionRequest(userManagerAlpha, 'corr-mgr-self', dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // 6. GEOFENCE, STALE GPS, POOR ACCURACY & FORGED TIMESTAMPS
  // ===========================================================================
  describe('Control 6: Geofence, Stale GPS, and Location Integrity', () => {
    it('should reject stale GPS timestamp exceeding allowable clock skew threshold (>120s)', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue(null);
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);

      // 5 minutes in the past
      const staleTimestamp = new Date(Date.now() - 300 * 1000).toISOString();

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        timestamp: staleTimestamp,
        idempotencyKey: 'key-stale-gps',
      };

      await expect(attendanceService.checkIn(userEmployeeAlpha, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject poor GPS accuracy exceeding maximum allowable policy threshold', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue(null);
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);
      prisma.officeLocation.findFirst.mockResolvedValue(mockOfficeAlpha);

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracyMeters: 250, // Policy allows max 100m!
        idempotencyKey: 'key-poor-accuracy',
      };

      await expect(attendanceService.checkIn(userEmployeeAlpha, dto)).rejects.toThrow(
        BadRequestException,
      );

      // Verify LOW_GPS_ACCURACY exception was logged
      expect(prisma.attendanceException.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            exceptionType: 'LOW_GPS_ACCURACY',
            severity: 'HIGH',
          }),
        }),
      );
    });

    it('should reject GPS punch outside designated office geofence radius', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue(null);
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);
      prisma.officeLocation.findFirst.mockResolvedValue(mockOfficeAlpha);

      // Coordinates ~15km away from Bangalore office
      const dto: CheckInDto = {
        latitude: 12.8452,
        longitude: 77.6602,
        accuracyMeters: 10,
        idempotencyKey: 'key-out-of-radius',
      };

      await expect(attendanceService.checkIn(userEmployeeAlpha, dto)).rejects.toThrow(
        BadRequestException,
      );

      // Verify OUTSIDE_GEOFENCE exception was logged
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

  // ===========================================================================
  // 7. CONCURRENCY, PARALLEL PUNCHES & REPLAY PROTECTION
  // ===========================================================================
  describe('Control 7: Concurrency, Parallel Sessions, and Idempotent Replays', () => {
    it('should prevent parallel check-in when an active session is already OPEN', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue(null);
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);
      prisma.officeLocation.findFirst.mockResolvedValue(mockOfficeAlpha);

      // Transaction finds an open session
      prisma.attendanceSession.findFirst.mockResolvedValue({
        id: 'session-open-active',
        status: 'OPEN',
        checkInTime: new Date(),
      });

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'key-parallel-checkin',
      };

      await expect(attendanceService.checkIn(userEmployeeAlpha, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject checkout when no active OPEN session exists', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue(null);
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);
      prisma.attendanceSession.findFirst.mockResolvedValue(null); // No active session!

      const dto: CheckOutDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'key-checkout-no-session',
      };

      await expect(attendanceService.checkOut(userEmployeeAlpha, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should safely return cached replay without state mutation on duplicate idempotencyKey', async () => {
      const cachedEvent = {
        id: 'event-existing-1',
        organizationId: mockTenantAlpha,
        employeeId: mockEmpAlpha.id,
        session: { id: 'sess-1' },
      };

      prisma.attendanceEvent.findUnique.mockResolvedValue(cachedEvent);
      prisma.attendanceDailySummary.findFirst.mockResolvedValue({ id: 'sum-1' });

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'key-replay-checkin',
      };

      const result = await attendanceService.checkIn(userEmployeeAlpha, dto);

      expect(result.success).toBe(true);
      expect(result.data.isIdempotentReplay).toBe(true);
      expect(prisma.attendanceEvent.create).not.toHaveBeenCalled();
    });

    it('should flag suspicious rapid punch attempts submitted within 45 seconds', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue(null);
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);
      prisma.officeLocation.findFirst.mockResolvedValue(mockOfficeAlpha);

      // Recent punch 10 seconds ago
      prisma.attendanceEvent.findFirst.mockResolvedValue({
        id: 'ev-10s-ago',
        eventType: 'CHECK_IN',
        eventTimestamp: new Date(Date.now() - 10 * 1000),
      });

      prisma.attendanceSession.findFirst.mockResolvedValue(null); // No open session
      prisma.attendanceSession.create.mockResolvedValue({ id: 'sess-new', events: [] });
      prisma.attendanceEvent.create.mockResolvedValue({ id: 'ev-new' });
      prisma.attendanceDailySummary.upsert.mockResolvedValue({ status: 'PRESENT' });

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'key-rapid-attempt',
      };

      await attendanceService.checkIn(userEmployeeAlpha, dto);

      // Verify SUSPICIOUS_REPEATED_ATTEMPTS exception recorded
      expect(prisma.attendanceException.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            exceptionType: 'SUSPICIOUS_REPEATED_ATTEMPTS',
            severity: 'HIGH',
          }),
        }),
      );
    });
  });

  // ===========================================================================
  // 8. DATA MINIMIZATION, GPS PRIVACY & AUDIT INTEGRITY
  // ===========================================================================
  describe('Control 8: Location Data Minimization & Privacy Protection', () => {
    it('should redact precise latitude and longitude from recorded attendance exceptions', async () => {
      await attendanceService.recordAttendanceException({
        organizationId: mockTenantAlpha,
        employeeId: mockEmpAlpha.id,
        date: new Date(),
        exceptionType: 'OUTSIDE_GEOFENCE',
        severity: 'HIGH',
        details: {
          latitude: 12.9716, // Must be deleted!
          longitude: 77.5946, // Must be deleted!
          password: 'SecretPassword', // Must be deleted!
          distanceMeters: 500,
        },
      });

      const createCall = prisma.attendanceException.create.mock.calls[0][0];
      expect(createCall.data.details.latitude).toBeUndefined();
      expect(createCall.data.details.longitude).toBeUndefined();
      expect(createCall.data.details.password).toBeUndefined();
      expect(createCall.data.details.distanceMeters).toBe(500);
    });

    it('should redact precise GPS coordinates for standard non-admin users in employee details', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);
      prisma.attendanceDailySummary.findUnique.mockResolvedValue(null);
      prisma.attendanceSession.findMany.mockResolvedValue([
        {
          id: 'sess-1',
          events: [
            {
              id: 'ev-1',
              eventType: 'CHECK_IN',
              latitude: 12.9716,
              longitude: 77.5946,
              geofenceStatus: 'VERIFIED',
              distanceFromOfficeMeters: 45,
            },
          ],
        },
      ]);
      prisma.attendanceException.findMany.mockResolvedValue([]);

      // Alice (EMPLOYEE role, no ATTENDANCE_VIEW_GPS)
      const result = await attendanceService.getOperationsEmployeeDetail(
        userEmployeeAlpha,
        mockEmpAlpha.id,
      );

      const event = result.data.sessions[0].events[0];
      expect(event.latitude).toBeNull();
      expect(event.longitude).toBeNull();
      expect(event.isGpsRedacted).toBe(true);
      expect(event.distanceFromOfficeMeters).toBe(45); // Coarse distance is preserved
    });

    it('should never log raw GPS latitude/longitude coordinates into audit metadata', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue(null);
      prisma.employee.findFirst.mockResolvedValue(mockEmpAlpha);
      prisma.officeLocation.findFirst.mockResolvedValue(mockOfficeAlpha);
      prisma.attendanceSession.findFirst.mockResolvedValue(null);
      prisma.attendanceSession.create.mockResolvedValue({ id: 'sess-audited', events: [] });
      prisma.attendanceEvent.create.mockResolvedValue({ id: 'ev-audited' });
      prisma.attendanceDailySummary.upsert.mockResolvedValue({ status: 'PRESENT' });

      const dto: CheckInDto = {
        latitude: 12.9716,
        longitude: 77.5946,
        idempotencyKey: 'key-audit-verify',
      };

      await attendanceService.checkIn(userEmployeeAlpha, dto);

      const auditCall = audit.record.mock.calls[0][0];
      expect(auditCall.metadata.latitude).toBeUndefined();
      expect(auditCall.metadata.longitude).toBeUndefined();
      expect(auditCall.metadata.distanceMeters).toBeDefined();
      expect(auditCall.metadata.officeName).toBe('Bangalore Office');
    });
  });
});
