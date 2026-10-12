import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeCompensationService } from '../services/employee-compensation.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { CompensationChangeReason } from '../dto/employee-compensation.dto';
import { Prisma } from '@prisma/client';

describe('Phase 11.3: Employee Compensation Assignment & Salary History Tests', () => {
  let service: EmployeeCompensationService;
  let mockPrisma: any;
  let mockAudit: any;

  const hrAdminUser: AuthenticatedUser = {
    id: 'user-hr-admin',
    email: 'hr.director@example.com',
    firstName: 'HR',
    lastName: 'Director',
    employeeCode: 'EMP-HR-01',
    status: 'ACTIVE' as any,
    sessionId: 'sess-1',
    roles: ['HR', 'ADMIN'],
    organizationId: 'org-test-1',
    permissions: [
      'PAYROLL_VIEW',
      'PAYROLL_COMPENSATION',
      'PAYROLL_MANAGE',
      'PAYROLL_APPROVE',
      'PAYROLL_EXPORT',
    ],
  };

  const managerOnlyUser: AuthenticatedUser = {
    id: 'user-manager',
    email: 'team.manager@example.com',
    firstName: 'Team',
    lastName: 'Manager',
    employeeCode: 'EMP-MGR-01',
    status: 'ACTIVE' as any,
    sessionId: 'sess-2',
    roles: ['MANAGER'],
    organizationId: 'org-test-1',
    permissions: ['EMPLOYEE_VIEW', 'ATTENDANCE_VIEW', 'LEAVE_APPROVE'], // NO PAYROLL PERMISSIONS
  };

  const plainEmployeeUser: AuthenticatedUser = {
    id: 'user-employee',
    email: 'john.doe@example.com',
    firstName: 'John',
    lastName: 'Doe',
    employeeCode: 'EMP-001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-3',
    roles: ['EMPLOYEE'],
    organizationId: 'org-test-1',
    permissions: ['PAYSLIP_VIEW_SELF'],
  };

  const mockEmployee = {
    id: 'emp-target-1',
    employeeCode: 'EMP-100',
    displayName: 'Alice Engineer',
    organizationId: 'org-test-1',
    status: 'ACTIVE',
    joiningDate: new Date('2025-01-01'),
    deletedAt: null,
  };

  const mockSalaryStructure = {
    id: 'struct-eng-v1',
    code: 'ENG_TECH',
    name: 'Engineering Staff Structure',
    version: 1,
    currency: 'INR',
    isActive: true,
    organizationId: 'org-test-1',
    items: [
      {
        componentId: 'comp-basic',
        calculationType: 'PERCENTAGE_OF_GROSS',
        amountOrPercentage: new Prisma.Decimal('50.00'),
        formula: null,
        component: {
          id: 'comp-basic',
          code: 'BASIC',
          name: 'Basic Salary',
          type: 'EARNING',
          affectsNetSalary: true,
          displayOrder: 1,
        },
      },
      {
        componentId: 'comp-hra',
        calculationType: 'PERCENTAGE_OF_BASIC',
        amountOrPercentage: new Prisma.Decimal('40.00'),
        formula: null,
        component: {
          id: 'comp-hra',
          code: 'HRA',
          name: 'House Rent Allowance',
          type: 'EARNING',
          affectsNetSalary: true,
          displayOrder: 2,
        },
      },
      {
        componentId: 'comp-pf',
        calculationType: 'PERCENTAGE_OF_BASIC',
        amountOrPercentage: new Prisma.Decimal('12.00'),
        formula: null,
        component: {
          id: 'comp-pf',
          code: 'PF_EMP',
          name: 'Employee Provident Fund',
          type: 'DEDUCTION',
          affectsNetSalary: true,
          displayOrder: 3,
        },
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      employee: {
        findFirst: jest.fn(),
      },
      salaryStructure: {
        findFirst: jest.fn(),
      },
      employeeCompensation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      employeeCompensationItem: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    service = new EmployeeCompensationService(mockPrisma, mockAudit);
  });

  describe('1. Unauthorized Employee & Manager Access Protection', () => {
    it('strictly forbids a team manager without explicit payroll permission from viewing employee compensation', async () => {
      await expect(
        service.getEmployeeCompensationHistory(managerOnlyUser, 'emp-target-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('strictly forbids a regular employee from viewing compensation history of another employee', async () => {
      await expect(
        service.getEmployeeCompensationHistory(plainEmployeeUser, 'emp-target-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows authorized HR / Admin with PAYROLL_VIEW or PAYROLL_COMPENSATION to view history', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrisma.employeeCompensation.findMany.mockResolvedValue([]);

      const result = await service.getEmployeeCompensationHistory(hrAdminUser, 'emp-target-1');
      expect(result.employee.employeeCode).toBe('EMP-100');
      expect(result.history).toEqual([]);
    });
  });

  describe('2. Compensation Assignment Creation, Validation & Automatic Predecessor Capping', () => {
    it('creates an approved compensation and automatically caps prior open-ended compensation to prevent overlapping intervals', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrisma.salaryStructure.findFirst.mockResolvedValue(mockSalaryStructure);
      mockPrisma.employeeCompensation.findFirst
        // 1. Check exact conflict
        .mockResolvedValueOnce(null)
        // 2. Active predecessor query in transaction
        .mockResolvedValueOnce({
          id: 'comp-initial',
          effectiveFrom: new Date('2025-01-01'),
          effectiveTo: null,
          status: 'APPROVED',
        });

      mockPrisma.employeeCompensation.create.mockResolvedValue({
        id: 'comp-revision-2026',
        employeeId: 'emp-target-1',
        structureId: 'struct-eng-v1',
        ctcAnnual: new Prisma.Decimal('1200000.00'),
        grossMonthly: new Prisma.Decimal('70000.00'),
        effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
        effectiveTo: null,
        status: 'APPROVED',
      });

      // Mock subsequent fetch for return
      mockPrisma.employeeCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-revision-2026',
          status: 'APPROVED',
          effectiveFrom: new Date('2026-04-01'),
          effectiveTo: null,
          structure: mockSalaryStructure,
          items: [],
        },
      ]);

      const result = await service.createAssignment(hrAdminUser, 'emp-target-1', {
        structureId: 'struct-eng-v1',
        ctcAnnual: 1200000,
        effectiveFrom: '2026-04-01T00:00:00.000Z',
        changeReason: CompensationChangeReason.ANNUAL_INCREMENT,
        reason: 'Appraisal 2026',
        submitForApproval: false,
      });

      // Verify predecessor capping
      expect(mockPrisma.employeeCompensation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comp-initial' },
          data: expect.objectContaining({
            effectiveTo: expect.any(Date),
          }),
        }),
      );

      // Verify audit record
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPENSATION_ASSIGN_CREATED',
          entity: 'EmployeeCompensation',
        }),
      );

      expect(result.currentCompensation).toBeDefined();
    });

    it('rejects creation when salary structure is inactive or retired', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrisma.salaryStructure.findFirst.mockResolvedValue({
        ...mockSalaryStructure,
        isActive: false,
      });

      await expect(
        service.createAssignment(hrAdminUser, 'emp-target-1', {
          structureId: 'struct-eng-v1',
          ctcAnnual: 1000000,
          effectiveFrom: '2026-05-01T00:00:00.000Z',
          changeReason: CompensationChangeReason.MARKET_CORRECTION,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creation when effectiveTo is before effectiveFrom', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrisma.salaryStructure.findFirst.mockResolvedValue(mockSalaryStructure);

      await expect(
        service.createAssignment(hrAdminUser, 'emp-target-1', {
          structureId: 'struct-eng-v1',
          ctcAnnual: 1000000,
          effectiveFrom: '2026-10-01T00:00:00.000Z',
          effectiveTo: '2026-05-01T00:00:00.000Z', // Before effectiveFrom!
          changeReason: CompensationChangeReason.OTHER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creation when another approved assignment already begins on the exact same date', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrisma.salaryStructure.findFirst.mockResolvedValue(mockSalaryStructure);
      mockPrisma.employeeCompensation.findFirst.mockResolvedValue({
        id: 'comp-conflict',
        status: 'APPROVED',
        effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
      });

      await expect(
        service.createAssignment(hrAdminUser, 'emp-target-1', {
          structureId: 'struct-eng-v1',
          ctcAnnual: 1500000,
          effectiveFrom: '2026-04-01T00:00:00.000Z',
          changeReason: CompensationChangeReason.PROMOTION,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('3. Salary Change Approval & Rejection Workflow', () => {
    it('allows submitting for approval as PENDING_APPROVAL without immediately capping previous assignment', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrisma.salaryStructure.findFirst.mockResolvedValue(mockSalaryStructure);
      mockPrisma.employeeCompensation.findFirst.mockResolvedValue(null);

      mockPrisma.employeeCompensation.create.mockResolvedValue({
        id: 'comp-pending-1',
        employeeId: 'emp-target-1',
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.employeeCompensation.findMany.mockResolvedValue([]);

      await service.createAssignment(hrAdminUser, 'emp-target-1', {
        structureId: 'struct-eng-v1',
        ctcAnnual: 1800000,
        effectiveFrom: '2026-12-01T00:00:00.000Z',
        changeReason: CompensationChangeReason.PROMOTION,
        submitForApproval: true,
      });

      // Verify status was created as PENDING_APPROVAL and predecessor was NOT capped yet
      expect(mockPrisma.employeeCompensation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING_APPROVAL',
            approvedById: null,
            approvedAt: null,
          }),
        }),
      );
      expect(mockPrisma.employeeCompensation.update).not.toHaveBeenCalled();
    });

    it('approves a pending compensation and caps prior active assignment', async () => {
      mockPrisma.employeeCompensation.findFirst
        // 1. Find record to approve
        .mockResolvedValueOnce({
          id: 'comp-pending-1',
          employeeId: 'emp-target-1',
          effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
          status: 'PENDING_APPROVAL',
          notes: 'Promo review',
        })
        // 2. Find predecessor in transaction
        .mockResolvedValueOnce({
          id: 'comp-old',
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          status: 'APPROVED',
        });

      mockPrisma.employeeCompensation.update.mockResolvedValue({
        id: 'comp-pending-1',
        status: 'APPROVED',
        approvedById: hrAdminUser.id,
      });

      const approved = await service.approve(hrAdminUser, 'comp-pending-1', {
        comments: 'Approved by Compensation Committee',
      });

      expect(approved.status).toBe('APPROVED');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPENSATION_ASSIGN_APPROVED',
        }),
      );
    });

    it('rejects a pending compensation and records rejection reason', async () => {
      mockPrisma.employeeCompensation.findFirst.mockResolvedValue({
        id: 'comp-pending-2',
        employeeId: 'emp-target-1',
        status: 'PENDING_APPROVAL',
      });

      mockPrisma.employeeCompensation.update.mockResolvedValue({
        id: 'comp-pending-2',
        status: 'REJECTED',
        rejectionReason: 'Exceeds departmental pay band',
      });

      const rejected = await service.reject(hrAdminUser, 'comp-pending-2', {
        rejectionReason: 'Exceeds departmental pay band',
      });

      expect(rejected.status).toBe('REJECTED');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPENSATION_ASSIGN_REJECTED',
          metadata: expect.objectContaining({
            rejectionReason: 'Exceeds departmental pay band',
          }),
        }),
      );
    });
  });

  describe('4. Mid-Period Salary Revision & Proration Segmentation', () => {
    it('returns a single period segment when no mid-period revision occurred', async () => {
      mockPrisma.employeeCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-single',
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          status: 'APPROVED',
          ctcAnnual: new Prisma.Decimal('1200000.00'),
          grossMonthly: new Prisma.Decimal('100000.00'),
          structure: { code: 'ENG_STD' },
          items: [],
        },
      ]);

      const result = await service.getApplicableForPeriod(hrAdminUser, 'emp-target-1', {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(result.hasApplicableCompensation).toBe(true);
      expect(result.isMidPeriodRevision).toBe(false);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].activeDays).toBe(31);
      expect(result.segments[0].weight).toBe(1.0);
    });

    it('correctly detects mid-period revision and computes separate segments with exact day weights', async () => {
      // Revision on Oct 16:
      // Oct 1 to Oct 15 (15 days under Old Comp)
      // Oct 16 to Oct 31 (16 days under New Comp)
      // Total days: 31
      mockPrisma.employeeCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-old',
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: new Date('2026-10-15T23:59:59.999Z'),
          status: 'APPROVED',
          ctcAnnual: new Prisma.Decimal('1000000.00'),
          grossMonthly: new Prisma.Decimal('83333.33'),
          structure: { code: 'ENG_JUNIOR' },
          items: [],
        },
        {
          id: 'comp-new',
          effectiveFrom: new Date('2026-10-16T00:00:00.000Z'),
          effectiveTo: null,
          status: 'APPROVED',
          ctcAnnual: new Prisma.Decimal('1400000.00'),
          grossMonthly: new Prisma.Decimal('116666.67'),
          structure: { code: 'ENG_SENIOR' },
          items: [],
        },
      ]);

      const result = await service.getApplicableForPeriod(hrAdminUser, 'emp-target-1', {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(result.hasApplicableCompensation).toBe(true);
      expect(result.isMidPeriodRevision).toBe(true);
      expect(result.segments).toHaveLength(2);

      // Segment 1 (Oct 1 - Oct 15 = 15 days)
      expect(result.segments[0].activeDays).toBe(15);
      expect(result.segments[0].weight).toBeCloseTo(15 / 31, 4);
      expect(result.segments[0].structureCode).toBe('ENG_JUNIOR');

      // Segment 2 (Oct 16 - Oct 31 = 16 days)
      expect(result.segments[1].activeDays).toBe(16);
      expect(result.segments[1].weight).toBeCloseTo(16 / 31, 4);
      expect(result.segments[1].structureCode).toBe('ENG_SENIOR');
    });
  });

  describe('5. Secure CSV Export & Formula Injection Sanitization', () => {
    it('blocks export if user lacks PAYROLL_EXPORT permission', async () => {
      await expect(
        service.exportCompensationHistory(managerOnlyUser, 'emp-target-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sanitizes dangerous spreadsheet formula prefixes (=, +, -, @) with prepended apostrophe', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: 'emp-target-1',
        employeeCode: '=CMD|calc', // Potential formula injection payload
        displayName: '@AdminUser',
        status: 'ACTIVE',
        joiningDate: new Date('2025-01-01'),
        deletedAt: null,
      });

      mockPrisma.employeeCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          structure: { code: '+SECRET_STRUCT', version: 1 },
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          status: 'APPROVED',
          changeReason: '-INCREMENT',
          ctcAnnual: new Prisma.Decimal('1000000'),
          grossMonthly: new Prisma.Decimal('80000'),
          createdBy: { firstName: 'HR', lastName: 'Admin' },
          approvedBy: null,
        },
      ]);

      const csv = await service.exportCompensationHistory(hrAdminUser, 'emp-target-1');

      // Check that formulas were neutralized with a leading apostrophe
      expect(csv).toContain('"\'=CMD|calc"');
      expect(csv).toContain('"\'@AdminUser"');
      expect(csv).toContain('"\'+SECRET_STRUCT"');
      expect(csv).toContain('"\'-INCREMENT"');
    });
  });
});
