import { Test, TestingModule } from '@nestjs/testing';
import { LeaveValidationService } from './leave-validation.service';
import { LeaveCalculatorService } from './leave-calculator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  LeaveDurationType,
  LeaveRequestStatus,
  Prisma,
  VisitStatus,
  WfhStatus,
} from '@prisma/client';

describe('LeaveValidationService', () => {
  let service: LeaveValidationService;
  let calculatorService: LeaveCalculatorService;
  let prisma: any;

  const mockOrgId = 'org-123';
  const mockEmpId = 'emp-456';
  const mockLeaveTypeId = 'lt-cl';

  const defaultLeaveType = {
    id: mockLeaveTypeId,
    organizationId: mockOrgId,
    code: 'CL',
    name: 'Casual Leave',
    isPaid: true,
    allowHalfDay: true,
    requiresDoc: false,
    docThresholdDays: 3,
    isActive: true,
  };

  const defaultPolicy = {
    id: 'pol-cl',
    name: 'Standard Casual Leave Policy',
    code: 'POL_CL_STD',
    leaveTypeId: mockLeaveTypeId,
    organizationId: mockOrgId,
    annualEntitlement: new Prisma.Decimal(12.0),
    carryForwardLimit: new Prisma.Decimal(0),
    minNoticeDays: 0,
    maxConsecutiveDays: 7,
    allowNegativeBalance: false,
    maxNegativeBalance: new Prisma.Decimal(0),
    countWeekendsAsLeave: false,
    countHolidaysAsLeave: false,
    isActive: true,
  };

  const defaultAssignment = {
    id: 'asgn-1',
    organizationId: mockOrgId,
    employeeId: mockEmpId,
    leavePolicyId: 'pol-cl',
    leavePolicy: defaultPolicy,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
  };

  const defaultAccount = {
    id: 'acc-1',
    organizationId: mockOrgId,
    employeeId: mockEmpId,
    leaveTypeId: mockLeaveTypeId,
    leaveYear: 2026,
    allocatedBalance: new Prisma.Decimal(12.0),
    usedBalance: new Prisma.Decimal(2.0),
    pendingBalance: new Prisma.Decimal(0),
    closingBalance: new Prisma.Decimal(10.0),
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: mockEmpId,
          employment: { branchId: 'branch-1' },
        }),
      },
      leaveType: {
        findFirst: jest.fn().mockResolvedValue(defaultLeaveType),
        findUnique: jest.fn().mockResolvedValue(defaultLeaveType),
      },
      employeeLeavePolicyAssignment: {
        findFirst: jest.fn().mockResolvedValue(defaultAssignment),
      },
      leaveBalanceAccount: {
        findUnique: jest.fn().mockResolvedValue(defaultAccount),
      },
      leaveRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      officialVisit: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      wfhRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      shiftAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          shift: { workDays: [1, 2, 3, 4, 5] }, // Mon-Fri
        }),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveValidationService,
        LeaveCalculatorService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<LeaveValidationService>(LeaveValidationService);
    calculatorService = module.get<LeaveCalculatorService>(LeaveCalculatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================================================
  // 1. NORMAL CASES
  // ===========================================================================
  describe('Normal validation scenarios', () => {
    it('successfully validates standard 2-day leave application', async () => {
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15', // Thursday
        endDate: '2026-10-16', // Friday
        durationType: LeaveDurationType.FULL_DAY,
        reason: 'Personal errands',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.calculation?.chargeableDays).toBe(2);
      expect(result.availableBalance).toBe(10);
      expect(result.leaveYear).toBe(2026);
    });

    it('returns structured metadata with policy rules and calculations', async () => {
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-12', // Monday
        endDate: '2026-10-14', // Wednesday
      });

      expect(result.isValid).toBe(true);
      expect(result.policy?.maxConsecutiveDays).toBe(7);
      expect(result.calculation?.totalCalendarDays).toBe(3);
      expect(result.calculation?.chargeableDays).toBe(3);
      expect(result.calculation?.weekendDays).toBe(0);
    });
  });

  // ===========================================================================
  // 2. WEEKENDS AND HOLIDAYS
  // ===========================================================================
  describe('Weekends and Holidays calculation and validation', () => {
    it('skips weekends by default when policy does not count weekends', async () => {
      // 2026-10-16 (Fri) to 2026-10-19 (Mon) covers Fri, Sat, Sun, Mon = 2 working days
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-16',
        endDate: '2026-10-19',
      });

      expect(result.isValid).toBe(true);
      expect(result.calculation?.totalCalendarDays).toBe(4);
      expect(result.calculation?.weekendDays).toBe(2);
      expect(result.calculation?.chargeableDays).toBe(2);
    });

    it('skips gazetted holidays by default', async () => {
      prisma.holiday.findMany.mockResolvedValue([
        {
          id: 'hol-diwali',
          name: 'Diwali',
          date: new Date('2026-11-09T00:00:00.000Z'), // Monday
          isMandatory: true,
        },
      ]);

      // 2026-11-09 (Mon - Diwali) to 2026-11-10 (Tue) = 1 chargeable day
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-11-09',
        endDate: '2026-11-10',
      });

      expect(result.isValid).toBe(true);
      expect(result.calculation?.holidayDays).toBe(1);
      expect(result.calculation?.chargeableDays).toBe(1);
    });

    it('counts intervening weekends and holidays when sandwich rule is active on policy', async () => {
      prisma.employeeLeavePolicyAssignment.findFirst.mockResolvedValue({
        ...defaultAssignment,
        leavePolicy: {
          ...defaultPolicy,
          countWeekendsAsLeave: true,
          countHolidaysAsLeave: true,
        },
      });

      prisma.holiday.findMany.mockResolvedValue([
        {
          id: 'hol-1',
          name: 'Festival',
          date: new Date('2026-10-17T00:00:00.000Z'), // Saturday
          isMandatory: true,
        },
      ]);

      // Fri to Mon: Total 4 days. Because policy counts weekends and holidays, all 4 are chargeable
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-16',
        endDate: '2026-10-19',
      });

      expect(result.isValid).toBe(true);
      expect(result.calculation?.chargeableDays).toBe(4);
      expect(result.calculation?.isSandwichApplied).toBe(true);
      expect(result.warnings.some((w) => w.code === 'SANDWICH_RULE_APPLIED')).toBe(true);
    });

    it('rejects date range that contains zero chargeable days (falls entirely on weekend)', async () => {
      // 2026-10-17 (Sat) to 2026-10-18 (Sun)
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-17',
        endDate: '2026-10-18',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'ZERO_CHARGEABLE_DAYS')).toBe(true);
    });
  });

  // ===========================================================================
  // 3. HALF-DAYS
  // ===========================================================================
  describe('Half-day validation', () => {
    it('validates single-day FIRST_HALF application with 0.5 chargeable days', async () => {
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-15',
        durationType: LeaveDurationType.FIRST_HALF,
      });

      expect(result.isValid).toBe(true);
      expect(result.calculation?.chargeableDays).toBe(0.5);
    });

    it('validates single-day SECOND_HALF application with 0.5 chargeable days', async () => {
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-15',
        durationType: LeaveDurationType.SECOND_HALF,
      });

      expect(result.isValid).toBe(true);
      expect(result.calculation?.chargeableDays).toBe(0.5);
    });

    it('rejects multi-day half-day application', async () => {
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        durationType: LeaveDurationType.FIRST_HALF,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'HALF_DAY_MULTI_DAY_PROHIBITED')).toBe(true);
    });

    it('rejects half-day if leave type forbids half-day', async () => {
      prisma.leaveType.findFirst.mockResolvedValue({
        ...defaultLeaveType,
        allowHalfDay: false,
      });

      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-15',
        durationType: LeaveDurationType.FIRST_HALF,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'HALF_DAY_NOT_ALLOWED')).toBe(true);
    });
  });

  // ===========================================================================
  // 4. INVALID RANGES & BOUNDARY CONDITIONS
  // ===========================================================================
  describe('Invalid date ranges and boundary conditions', () => {
    it('rejects end date earlier than start date', async () => {
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-20',
        endDate: '2026-10-15',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'END_DATE_BEFORE_START_DATE')).toBe(true);
    });

    it('rejects unparseable or malformed date strings', async () => {
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: 'invalid-date',
        endDate: '2026-10-15',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_DATE_FORMAT')).toBe(true);
    });

    it('rejects application crossing leave-year boundary (e.g. Dec 2026 to Jan 2027)', async () => {
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-12-28',
        endDate: '2027-01-04',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CROSS_LEAVE_YEAR_BOUNDARY')).toBe(true);
    });
  });

  // ===========================================================================
  // 5. NOTICE PERIOD & DURATION LIMITS
  // ===========================================================================
  describe('Notice period and duration limits', () => {
    it('rejects application with insufficient notice period based on deterministic server clock', async () => {
      prisma.employeeLeavePolicyAssignment.findFirst.mockResolvedValue({
        ...defaultAssignment,
        leavePolicy: {
          ...defaultPolicy,
          minNoticeDays: 3, // Requires 3 days advance notice
        },
      });

      // Reference date: 2026-10-10. Start date: 2026-10-11 (only 1 day notice)
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-11',
        endDate: '2026-10-12',
        referenceDate: new Date('2026-10-10T00:00:00.000Z'),
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INSUFFICIENT_NOTICE_PERIOD')).toBe(true);
    });

    it('accepts application satisfying notice period based on reference date', async () => {
      prisma.employeeLeavePolicyAssignment.findFirst.mockResolvedValue({
        ...defaultAssignment,
        leavePolicy: {
          ...defaultPolicy,
          minNoticeDays: 3,
        },
      });

      // Reference date: 2026-10-10. Start date: 2026-10-15 (5 days notice >= 3)
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        referenceDate: new Date('2026-10-10T00:00:00.000Z'),
      });

      expect(result.isValid).toBe(true);
    });

    it('rejects application exceeding maximum allowable consecutive days', async () => {
      prisma.employeeLeavePolicyAssignment.findFirst.mockResolvedValue({
        ...defaultAssignment,
        leavePolicy: {
          ...defaultPolicy,
          maxConsecutiveDays: 3,
        },
      });

      // 4 working days: Mon to Thu (2026-10-12 to 2026-10-15) > 3
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-12',
        endDate: '2026-10-15',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MAX_CONSECUTIVE_DAYS_EXCEEDED')).toBe(true);
    });
  });

  // ===========================================================================
  // 6. SUPPORTING DOCUMENT REQUIREMENT
  // ===========================================================================
  describe('Document requirements', () => {
    it('requires attachment when leave type mandates docs above threshold days', async () => {
      prisma.leaveType.findFirst.mockResolvedValue({
        ...defaultLeaveType,
        requiresDoc: true,
        docThresholdDays: 2,
      });

      // 2 working days without attachment
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        attachmentUrl: undefined,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'SUPPORTING_DOCUMENT_REQUIRED')).toBe(true);
    });

    it('passes document check when attachment is provided', async () => {
      prisma.leaveType.findFirst.mockResolvedValue({
        ...defaultLeaveType,
        requiresDoc: true,
        docThresholdDays: 2,
      });

      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        attachmentUrl: 'https://docs.hrms.internal/med_cert_123.pdf',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors.some((e) => e.code === 'SUPPORTING_DOCUMENT_REQUIRED')).toBe(false);
    });
  });

  // ===========================================================================
  // 7. INSUFFICIENT BALANCE & OVERDRAFT
  // ===========================================================================
  describe('Balance sufficiency and overdraft checks', () => {
    it('rejects application when available balance is less than chargeable days and negative balance disallowed', async () => {
      prisma.leaveBalanceAccount.findUnique.mockResolvedValue({
        ...defaultAccount,
        closingBalance: new Prisma.Decimal(1.0), // Only 1 day left
      });

      // 2 chargeable days requested
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INSUFFICIENT_LEAVE_BALANCE')).toBe(true);
    });

    it('allows negative balance if policy allows negative balance within limit', async () => {
      prisma.employeeLeavePolicyAssignment.findFirst.mockResolvedValue({
        ...defaultAssignment,
        leavePolicy: {
          ...defaultPolicy,
          allowNegativeBalance: true,
          maxNegativeBalance: new Prisma.Decimal(3.0),
        },
      });

      prisma.leaveBalanceAccount.findUnique.mockResolvedValue({
        ...defaultAccount,
        closingBalance: new Prisma.Decimal(1.0),
      });

      // 2 chargeable days requested: 1 - 2 = -1 (within -3 max negative)
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects application exceeding maximum allowable negative overdraft limit', async () => {
      prisma.employeeLeavePolicyAssignment.findFirst.mockResolvedValue({
        ...defaultAssignment,
        leavePolicy: {
          ...defaultPolicy,
          allowNegativeBalance: true,
          maxNegativeBalance: new Prisma.Decimal(1.0),
        },
      });

      prisma.leaveBalanceAccount.findUnique.mockResolvedValue({
        ...defaultAccount,
        closingBalance: new Prisma.Decimal(0),
      });

      // 3 chargeable days requested: 0 - 3 = -3 (exceeds -1 max negative)
      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-12',
        endDate: '2026-10-14',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'NEGATIVE_BALANCE_LIMIT_EXCEEDED')).toBe(true);
    });
  });

  // ===========================================================================
  // 8. COLLISION DETECTION (LEAVES, VISITS, WFH)
  // ===========================================================================
  describe('Collision and overlap detection', () => {
    it('detects collision with existing pending leave request', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({
        id: 'existing-req-1',
        status: LeaveRequestStatus.SUBMITTED,
        startDate: new Date('2026-10-14T00:00:00.000Z'),
        endDate: new Date('2026-10-16T00:00:00.000Z'),
        leaveType: { name: 'Casual Leave' },
      });

      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'OVERLAPPING_LEAVE_REQUEST')).toBe(true);
    });

    it('detects collision with existing approved official visit', async () => {
      prisma.officialVisit.findFirst.mockResolvedValue({
        id: 'visit-1',
        status: VisitStatus.APPROVED,
        startDate: new Date('2026-10-15T00:00:00.000Z'),
        endDate: new Date('2026-10-15T00:00:00.000Z'),
      });

      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'OVERLAPPING_OFFICIAL_VISIT')).toBe(true);
    });

    it('detects collision with active work-from-home schedule', async () => {
      prisma.wfhRequest.findFirst.mockResolvedValue({
        id: 'wfh-1',
        status: WfhStatus.APPROVED,
        startDate: new Date('2026-10-16T00:00:00.000Z'),
        endDate: new Date('2026-10-16T00:00:00.000Z'),
      });

      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'OVERLAPPING_WFH_REQUEST')).toBe(true);
    });

    it('ignores excluded requestId when checking for overlaps (e.g. updating same request)', async () => {
      prisma.leaveRequest.findFirst.mockImplementation((args: any) => {
        if (args?.where?.id?.not === 'current-req-1') {
          return Promise.resolve(null);
        }
        return Promise.resolve({ id: 'current-req-1', leaveType: { name: 'Casual Leave' } });
      });

      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        excludeRequestId: 'current-req-1',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 9. EXCEPTION THROWING MODE & CONCURRENT RACE SCENARIOS
  // ===========================================================================
  describe('Throwing mode and transactional concurrency safety', () => {
    it('throws ConflictException on collision when throwOnError is true', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({
        id: 'existing-req-1',
        status: LeaveRequestStatus.APPROVED,
        startDate: new Date('2026-10-15T00:00:00.000Z'),
        endDate: new Date('2026-10-16T00:00:00.000Z'),
        leaveType: { name: 'Casual Leave' },
      });

      await expect(
        service.validateLeaveApplication(
          {
            organizationId: mockOrgId,
            employeeId: mockEmpId,
            leaveTypeId: mockLeaveTypeId,
            startDate: '2026-10-15',
            endDate: '2026-10-16',
          },
          true,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException on insufficient balance when throwOnError is true', async () => {
      prisma.leaveBalanceAccount.findUnique.mockResolvedValue({
        ...defaultAccount,
        closingBalance: new Prisma.Decimal(0),
      });

      await expect(
        service.validateLeaveApplication(
          {
            organizationId: mockOrgId,
            employeeId: mockEmpId,
            leaveTypeId: mockLeaveTypeId,
            startDate: '2026-10-15',
            endDate: '2026-10-16',
          },
          true,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('supports executing queries against transactional client (tx)', async () => {
      const mockTx: any = {
        leaveType: { findFirst: jest.fn().mockResolvedValue(defaultLeaveType) },
        employeeLeavePolicyAssignment: {
          findFirst: jest.fn().mockResolvedValue(defaultAssignment),
        },
        leaveRequest: { findFirst: jest.fn().mockResolvedValue(null) },
        officialVisit: { findFirst: jest.fn().mockResolvedValue(null) },
        wfhRequest: { findFirst: jest.fn().mockResolvedValue(null) },
        leaveBalanceAccount: { findUnique: jest.fn().mockResolvedValue(defaultAccount) },
      };

      const result = await service.validateLeaveApplication({
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        leaveTypeId: mockLeaveTypeId,
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        tx: mockTx,
      });

      expect(mockTx.leaveType.findFirst).toHaveBeenCalled();
      expect(mockTx.employeeLeavePolicyAssignment.findFirst).toHaveBeenCalled();
      expect(mockTx.leaveRequest.findFirst).toHaveBeenCalled();
      expect(result.isValid).toBe(true);
    });
  });
});
