import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { AttendancePoliciesService } from './attendance-policies.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AttendancePoliciesService', () => {
  let service: AttendancePoliciesService;
  let prisma: any;
  let audit: any;

  const mockOrgId = 'org-123';
  const mockUserId = 'user-admin';

  const mockDefaultPolicy = {
    id: 'pol-default',
    organizationId: mockOrgId,
    branchId: null,
    name: 'Default Org Policy',
    code: 'POL-DEFAULT',
    isDefault: true,
    standardWorkMinutes: 480,
    halfDayThresholdMinutes: 240,
    fullDayThresholdMinutes: 420,
    gracePeriodMinutes: 15,
    maxDailyBreakMinutes: 60,
    workingDayStartHour: 5,
    timezone: 'Asia/Kolkata',
    isActive: true,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
  };

  const mockBranchPolicy = {
    id: 'pol-branch',
    organizationId: mockOrgId,
    branchId: 'branch-blr',
    name: 'BLR Branch Flexible Policy',
    code: 'POL-BLR-FLEX',
    isDefault: false,
    standardWorkMinutes: 450,
    halfDayThresholdMinutes: 210,
    fullDayThresholdMinutes: 390,
    gracePeriodMinutes: 30, // 30 min grace override
    maxDailyBreakMinutes: 60,
    workingDayStartHour: 6,
    timezone: 'Asia/Kolkata',
    isActive: true,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
  };

  const mockShift = {
    id: 'shift-night',
    organizationId: mockOrgId,
    policyId: null,
    name: 'Night Owl Shift',
    code: 'NIGHT-01',
    startTime: '22:00',
    endTime: '06:00',
    isOvernight: true,
    workDays: [1, 2, 3, 4, 5],
    breakDurationMinutes: 60,
    color: '#8b5cf6',
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      attendancePolicy: {
        findMany: jest.fn().mockResolvedValue([mockDefaultPolicy]),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(mockDefaultPolicy),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn().mockResolvedValue(mockDefaultPolicy),
      },
      shift: {
        findMany: jest.fn().mockResolvedValue([mockShift]),
        findFirst: jest.fn().mockResolvedValue(mockShift),
        create: jest.fn().mockResolvedValue(mockShift),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue(mockShift),
      },
      shiftAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ ...mockShift, id: 'assign-1' }),
        delete: jest
          .fn()
          .mockResolvedValue({
            id: 'assign-1',
            employee: { displayName: 'John' },
            shift: { name: 'Day' },
          }),
        count: jest.fn().mockResolvedValue(0),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch-blr', organizationId: mockOrgId }),
      },
      employee: {
        findFirst: jest.fn(),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendancePoliciesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<AttendancePoliciesService>(AttendancePoliciesService);
  });

  describe('Policy CRUD', () => {
    it('should create an attendance policy and record audit', async () => {
      prisma.attendancePolicy.findFirst.mockResolvedValue(null);
      const created = await service.createPolicy(
        {
          name: 'Factory Shift Policy',
          code: 'POL-FAC',
          standardWorkMinutes: 480,
        },
        mockOrgId,
        mockUserId,
      );

      expect(created).toBeDefined();
      expect(prisma.attendancePolicy.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_POLICY_CREATED' }),
      );
    });

    it('should prevent deleting the default organization policy', async () => {
      prisma.attendancePolicy.findFirst.mockResolvedValue(mockDefaultPolicy);
      await expect(service.deletePolicy('pol-default', mockOrgId, mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should prevent duplicate policy codes', async () => {
      prisma.attendancePolicy.findFirst.mockResolvedValue(mockDefaultPolicy);
      await expect(
        service.createPolicy({ name: 'Dup', code: 'POL-DEFAULT' }, mockOrgId, mockUserId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Shift Management', () => {
    it('should detect overnight shift automatically when end time is before start time', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      await service.createShift(
        {
          name: 'Graveyard Shift',
          code: 'GRAVE-01',
          startTime: '23:00',
          endTime: '07:00',
        },
        mockOrgId,
        mockUserId,
      );

      expect(prisma.shift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isOvernight: true,
            startTime: '23:00',
            endTime: '07:00',
          }),
        }),
      );
    });

    it('should prevent deleting shift with active employee assignments', async () => {
      prisma.shift.findFirst.mockResolvedValue(mockShift);
      prisma.shiftAssignment.count.mockResolvedValue(5); // 5 employees assigned

      await expect(service.deleteShift('shift-night', mockOrgId, mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Precedence Resolution Hierarchy', () => {
    const targetDate = new Date('2026-10-09T00:00:00.000Z');

    it('Level 1: should prioritize active employee ShiftAssignment policy if present', async () => {
      // Mock employee has an assignment with shift linked to branch policy
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assign-1',
        shift: {
          id: 'shift-1',
          name: 'Assigned Shift',
          policy: mockBranchPolicy,
        },
      });

      const res = await service.resolveEffectivePolicyAndShift('emp-1', targetDate, mockOrgId);
      expect(res.source).toBe('EMPLOYEE_ASSIGNMENT');
      expect(res.policy.id).toBe('pol-branch');
    });

    it('Level 2: should fall back to Branch policy override if employee has no shift policy', async () => {
      // No employee assignment policy
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      // Employee belongs to BLR branch
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-2',
        employment: { branchId: 'branch-blr' },
      });
      // Branch has specific policy
      prisma.attendancePolicy.findFirst.mockResolvedValue(mockBranchPolicy);

      const res = await service.resolveEffectivePolicyAndShift('emp-2', targetDate, mockOrgId);
      expect(res.source).toBe('BRANCH_OVERRIDE');
      expect(res.policy.id).toBe('pol-branch');
    });

    it('Level 3: should fall back to Organization default policy if no branch override', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-3',
        employment: { branchId: 'branch-unassigned' },
      });
      // Branch policy not found, default policy resolved
      prisma.attendancePolicy.findFirst
        .mockResolvedValueOnce(null) // no branch policy
        .mockResolvedValueOnce(mockDefaultPolicy); // default org policy

      const res = await service.resolveEffectivePolicyAndShift('emp-3', targetDate, mockOrgId);
      expect(res.source).toBe('ORGANIZATION_DEFAULT');
      expect(res.policy.id).toBe('pol-default');
    });
  });

  describe('Policy Simulator', () => {
    it('should simulate check-in and check-out against specified policy', async () => {
      prisma.attendancePolicy.findFirst.mockResolvedValue(mockDefaultPolicy);

      const res = await service.simulateEvaluation(
        {
          policyId: 'pol-default',
          workingDate: '2026-10-09',
          checkInTime: '2026-10-09T03:30:00.000Z', // 09:00 AM IST
          checkOutTime: '2026-10-09T12:30:00.000Z', // 18:00 PM IST
          totalBreakMinutes: 60,
        },
        mockOrgId,
      );

      expect(res.workingDate).toBe('2026-10-09');
      expect(res.netWorkMinutes).toBe(480);
      expect(res.status).toBe('PRESENT');
      expect(res.isMissingCheckout).toBe(false);
    });
  });
});
