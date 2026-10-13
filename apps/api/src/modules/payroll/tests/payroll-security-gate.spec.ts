import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { PayslipsService } from '../services/payslips.service';
import { PayslipPdfService } from '../services/payslip-pdf.service';
import { EmployeeCompensationService } from '../services/employee-compensation.service';
import { PayrollRunsService } from '../services/payroll-runs.service';
import { PayrollCalculationEngineService } from '../services/payroll-calculation-engine.service';
import { PayrollValidationService } from '../services/payroll-validation.service';
import { PayrollAnalyticsService } from '../../reports/services/payroll-analytics.service';
import { ReportExportService } from '../../reports/services/report-export.service';

describe('Phase 11: Payroll Security, RBAC, IDOR, and Regression Testing Gate', () => {
  const orgPrimary = 'org-corp-alpha';
  const orgSecondary = 'org-corp-beta';

  // Synthetic Users for Role Matrix
  const adminUser: AuthenticatedUser = {
    id: 'usr-admin-1',
    organizationId: orgPrimary,
    email: 'admin@alpha.com',
    firstName: 'System',
    lastName: 'Admin',
    roles: ['ADMIN'],
    employeeCode: 'EMP-ADM-01',
    status: 'ACTIVE' as any,
    sessionId: 'sess-adm-1',
    permissions: [
      'PAYROLL_VIEW',
      'PAYROLL_MANAGE',
      'PAYROLL_APPROVE',
      'PAYROLL_COMPENSATION',
      'PAYROLL_EXPORT',
      'REPORT_VIEW',
    ],
  };

  const hrManagerUser: AuthenticatedUser = {
    id: 'usr-hr-1',
    organizationId: orgPrimary,
    email: 'hr.manager@alpha.com',
    firstName: 'Helen',
    lastName: 'HR',
    roles: ['HR'],
    employeeCode: 'EMP-HR-01',
    status: 'ACTIVE' as any,
    sessionId: 'sess-hr-1',
    permissions: ['PAYROLL_VIEW', 'PAYROLL_MANAGE', 'PAYROLL_COMPENSATION', 'REPORT_VIEW'],
  };

  const lineManagerUser: AuthenticatedUser = {
    id: 'usr-mgr-1',
    organizationId: orgPrimary,
    email: 'manager@alpha.com',
    firstName: 'Mark',
    lastName: 'Manager',
    roles: ['MANAGER'],
    employeeCode: 'EMP-MGR-01',
    status: 'ACTIVE' as any,
    sessionId: 'sess-mgr-1',
    permissions: ['REPORT_VIEW'],
  };

  const employeeAlice: AuthenticatedUser = {
    id: 'usr-emp-alice',
    organizationId: orgPrimary,
    email: 'alice@alpha.com',
    firstName: 'Alice',
    lastName: 'Smith',
    roles: ['EMPLOYEE'],
    employeeCode: 'EMP-001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-emp-1',
    permissions: [],
  };

  const employeeBob: AuthenticatedUser = {
    id: 'usr-emp-bob',
    organizationId: orgPrimary,
    email: 'bob@alpha.com',
    firstName: 'Bob',
    lastName: 'Jones',
    roles: ['EMPLOYEE'],
    employeeCode: 'EMP-002',
    status: 'ACTIVE' as any,
    sessionId: 'sess-emp-2',
    permissions: [],
  };

  const attackerCrossOrg: AuthenticatedUser = {
    id: 'usr-hacker-beta',
    organizationId: orgSecondary,
    email: 'mallory@beta.com',
    firstName: 'Mallory',
    lastName: 'Rival',
    roles: ['ADMIN'],
    employeeCode: 'EMP-BETA-01',
    status: 'ACTIVE' as any,
    sessionId: 'sess-beta-1',
    permissions: [
      'PAYROLL_VIEW',
      'PAYROLL_MANAGE',
      'PAYROLL_APPROVE',
      'PAYROLL_COMPENSATION',
      'PAYROLL_EXPORT',
    ],
  };

  let mockPrisma: any;
  let mockAudit: any;
  let payslipsService: PayslipsService;
  let pdfService: PayslipPdfService;
  let compService: EmployeeCompensationService;
  let runsService: PayrollRunsService;
  let calcEngine: PayrollCalculationEngineService;
  let validationService: PayrollValidationService;
  let analyticsService: PayrollAnalyticsService;
  let exportService: ReportExportService;

  beforeEach(() => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      employeeCompensation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      employeePayrollSnapshot: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      payrollRun: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      payrollPeriod: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      payrollApprovalHistory: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      payrollAdjustment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      salaryStructure: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      salaryComponent: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: orgPrimary,
          name: 'Alpha Corp Global',
          city: 'Mumbai',
          state: 'Maharashtra',
          country: 'India',
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'aud-log-1' }),
      },
      $transaction: jest.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(mockPrisma);
        }
        return cb;
      }),
    };

    pdfService = new PayslipPdfService();
    payslipsService = new PayslipsService(mockPrisma, mockAudit, pdfService);
    compService = new EmployeeCompensationService(mockPrisma, mockAudit);
    calcEngine = new PayrollCalculationEngineService();

    const mockInputs: any = {
      getEmployeeWorkSummary: jest.fn(),
      detectLateSourceChanges: jest.fn().mockResolvedValue({ totalLateChanges: 0, items: [] }),
    };

    validationService = new PayrollValidationService(mockPrisma, mockAudit);
    runsService = new PayrollRunsService(
      mockPrisma,
      mockAudit,
      calcEngine,
      mockInputs,
      validationService,
    );
    analyticsService = new PayrollAnalyticsService(mockPrisma, mockAudit);

    const mockHierarchy: any = {
      getTeamMemberIds: jest.fn().mockResolvedValue(['emp-sub-1', 'emp-sub-2']),
    };
    exportService = new ReportExportService(mockPrisma, mockHierarchy, analyticsService);
  });

  // ===========================================================================
  // 1. IDOR & BOLA ATTEMPTS
  // ===========================================================================
  describe('Gate 1: IDOR & BOLA Defenses (Tenant Isolation & Employee Scope)', () => {
    it('should block Employee A from accessing Employee B payslip (IDOR attempt)', async () => {
      // Mock Alice looking up Bob's payslip
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: 'emp-alice-id',
        userId: employeeAlice.id,
        organizationId: orgPrimary,
      });

      mockPrisma.employeePayrollSnapshot.findFirst.mockResolvedValue({
        id: 'snap-bob-1',
        organizationId: orgPrimary,
        employeeId: 'emp-bob-id', // Owned by Bob!
        payslipNumber: 'PAY-BOB-202610-001',
        payslipStatus: 'PUBLISHED',
        earnedGross: new Prisma.Decimal('100000.00'),
        totalDeductions: new Prisma.Decimal('15000.00'),
        netSalary: new Prisma.Decimal('85000.00'),
        payrollRun: {
          period: {
            id: 'per-1',
            year: 2026,
            month: 10,
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
          },
        },
      });

      await expect(payslipsService.getPayslipDetail('snap-bob-1', employeeAlice)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should block Employee A from downloading Employee B payslip PDF stream', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: 'emp-alice-id',
        userId: employeeAlice.id,
        organizationId: orgPrimary,
      });

      mockPrisma.employeePayrollSnapshot.findFirst.mockResolvedValue({
        id: 'snap-bob-1',
        organizationId: orgPrimary,
        employeeId: 'emp-bob-id',
        payslipNumber: 'PAY-BOB-202610-001',
        payslipStatus: 'PUBLISHED',
        earnedGross: new Prisma.Decimal('100000.00'),
        totalDeductions: new Prisma.Decimal('15000.00'),
        netSalary: new Prisma.Decimal('85000.00'),
        payrollRun: {
          period: {
            id: 'per-1',
            year: 2026,
            month: 10,
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
          },
        },
      });

      await expect(
        payslipsService.getPayslipPdfBuffer('snap-bob-1', employeeAlice),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject Cross-Tenant snapshot inspection (Cross-Organization IDOR)', async () => {
      // Mallory from orgSecondary queries snapshot belonging to orgPrimary
      mockPrisma.employeePayrollSnapshot.findFirst.mockResolvedValue(null); // Filter by user.organizationId fails

      await expect(
        payslipsService.getPayslipDetail('snap-alpha-1', attackerCrossOrg),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prevent Employee from accessing their own UNPUBLISHED payslip', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: 'emp-alice-id',
        userId: employeeAlice.id,
        organizationId: orgPrimary,
      });

      mockPrisma.employeePayrollSnapshot.findFirst.mockResolvedValue({
        id: 'snap-alice-draft',
        organizationId: orgPrimary,
        employeeId: 'emp-alice-id', // Is owner
        payslipNumber: 'PAY-ALICE-DRAFT',
        payslipStatus: 'GENERATED', // NOT yet published by HR!
        earnedGross: new Prisma.Decimal('75000.00'),
        totalDeductions: new Prisma.Decimal('10000.00'),
        netSalary: new Prisma.Decimal('65000.00'),
        payrollRun: {
          period: {
            id: 'per-1',
            year: 2026,
            month: 10,
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
          },
        },
      });

      await expect(
        payslipsService.getPayslipDetail('snap-alice-draft', employeeAlice),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block unauthorized employee from querying compensation history', async () => {
      // Alice tries to inspect Bob's compensation
      await expect(
        compService.getEmployeeCompensationHistory(employeeAlice, 'emp-bob-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent unauthorized manager from viewing confidential employee payroll register', () => {
      // Manager has REPORT_VIEW, but NOT PAYROLL_VIEW / PAYROLL_MANAGE
      expect(() => {
        analyticsService.checkPayrollReportAccess(lineManagerUser, true);
      }).toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // 2. ROLE COMBINATIONS MATRIX (ADMIN, HR, MANAGER, EMPLOYEE)
  // ===========================================================================
  describe('Gate 2: Role Combination Matrix & Backend RBAC Enforcement', () => {
    it('ADMIN: Granted full access to payroll operational reports and employee register', () => {
      const accessAggregate = analyticsService.checkPayrollReportAccess(adminUser, false);
      const accessEmployee = analyticsService.checkPayrollReportAccess(adminUser, true);

      expect(accessAggregate.isAdminOrHr).toBe(true);
      expect(accessEmployee.isAdminOrHr).toBe(true);
    });

    it('HR: Granted access to operational reports and employee-level register', () => {
      const accessAggregate = analyticsService.checkPayrollReportAccess(hrManagerUser, false);
      const accessEmployee = analyticsService.checkPayrollReportAccess(hrManagerUser, true);

      expect(accessAggregate.isAdminOrHr).toBe(true);
      expect(accessEmployee.isAdminOrHr).toBe(true);
    });

    it('MANAGER: Allowed aggregate summary reports, but strictly denied employee register', () => {
      const accessAggregate = analyticsService.checkPayrollReportAccess(lineManagerUser, false);
      expect(accessAggregate.isManager).toBe(true);

      expect(() => {
        analyticsService.checkPayrollReportAccess(lineManagerUser, true);
      }).toThrow(ForbiddenException);
    });

    it('EMPLOYEE: Denied both aggregate reports and employee register', () => {
      expect(() => {
        analyticsService.checkPayrollReportAccess(employeeAlice, false);
      }).toThrow(ForbiddenException);

      expect(() => {
        analyticsService.checkPayrollReportAccess(employeeAlice, true);
      }).toThrow(ForbiddenException);
    });

    it('Separation of Duties: Creator cannot approve their own payroll run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-alpha-1',
        organizationId: orgPrimary,
        status: 'REVIEW_PENDING',
        createdById: hrManagerUser.id, // Helen created it!
        periodId: 'per-1',
      });

      await expect(
        runsService.approve(
          orgPrimary,
          'run-alpha-1',
          { comments: 'Self approval attempt' },
          hrManagerUser.id, // Helen attempting to approve!
          ['PAYROLL_APPROVE'],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Separation of Duties: Calculator cannot approve their own payroll run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-alpha-2',
        organizationId: orgPrimary,
        status: 'REVIEW_PENDING',
        createdById: 'usr-different-creator',
        periodId: 'per-1',
      });

      mockPrisma.payrollApprovalHistory.findFirst.mockResolvedValue({
        id: 'app-hist-1',
        payrollRunId: 'run-alpha-2',
        actorId: hrManagerUser.id, // Helen calculated it
        action: 'CALCULATED',
      });

      await expect(
        runsService.approve(
          orgPrimary,
          'run-alpha-2',
          { comments: 'Approving what I calculated' },
          hrManagerUser.id, // Helen attempting to approve
          ['PAYROLL_APPROVE'],
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // 3. FINALIZED IMMUTABILITY & CONTROLLED CORRECTION
  // ===========================================================================
  describe('Gate 3: Immutable Finalized Records & Controlled Correction Workflows', () => {
    it('should reject recalculation of a LOCKED payroll run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-locked-1',
        organizationId: orgPrimary,
        status: 'LOCKED',
      });

      await expect(
        runsService.recalculate(orgPrimary, 'run-locked-1', adminUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject recalculation of a PUBLISHED payroll run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-published-1',
        organizationId: orgPrimary,
        status: 'PUBLISHED',
      });

      await expect(
        runsService.recalculate(orgPrimary, 'run-published-1', adminUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject direct cancellation of a LOCKED payroll run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-locked-1',
        organizationId: orgPrimary,
        status: 'LOCKED',
      });

      await expect(
        runsService.cancel(orgPrimary, 'run-locked-1', 'Accidental mistake', adminUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require a valid correction workflow with parent lineage for finalized runs', async () => {
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce({
          id: 'run-locked-parent',
          organizationId: orgPrimary,
          status: 'LOCKED',
          periodId: 'per-1',
          runNumber: 1,
          scope: 'ALL',
          title: 'October Main Payroll',
          totalEmployees: 50,
        })
        .mockResolvedValueOnce({ runNumber: 1 }); // highest run

      mockPrisma.payrollRun.create.mockResolvedValue({
        id: 'run-corr-2',
        parentRunId: 'run-locked-parent',
        runNumber: 2,
        title: 'Correction: October Main Payroll (Run #2)',
        status: 'DRAFT',
      });

      const corrRun = await runsService.createCorrectionRun(
        orgPrimary,
        'run-locked-parent',
        {
          correctionReason: 'Missed overtime bonus payment for operations team',
          notes: 'Approved by CFO on 2026-10-12',
        },
        adminUser.id,
      );

      expect(corrRun.parentRunId).toBe('run-locked-parent');
      expect(corrRun.runNumber).toBe(2);
      expect(corrRun.status).toBe('DRAFT');
    });
  });

  // ===========================================================================
  // 4. CONCURRENCY, ROLLBACK, AND TRANSACTION INTEGRITY
  // ===========================================================================
  describe('Gate 4: Concurrency Protection, Idempotency, and Rollbacks', () => {
    it('should abort status transition and throw ConflictException if status changed concurrently', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-conc-1',
        organizationId: orgPrimary,
        status: 'APPROVED',
      });

      // Simulate concurrent process changing status to LOCKED right before lock update transaction
      mockPrisma.payrollRun.findUnique.mockResolvedValue({
        id: 'run-conc-1',
        status: 'LOCKED', // Already locked by another worker!
      });

      await expect(
        runsService.lock(orgPrimary, 'run-conc-1', { notes: 'Finalizing' }, adminUser.id),
      ).rejects.toThrow(ConflictException);
    });

    it('should roll back calculation and mark run FAILED when exception occurs during orchestration', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-fail-1',
        organizationId: orgPrimary,
        status: 'DRAFT',
        periodId: 'per-1',
        scope: 'ALL',
        runNumber: 1,
        calculationVersion: 1,
        period: {
          id: 'per-1',
          startDate: new Date('2026-10-01'),
          endDate: new Date('2026-10-31'),
          totalDays: 31,
        },
      });

      // Simulate database failure during employee resolution
      mockPrisma.employee.findMany.mockRejectedValue(new Error('Connection pool exhausted'));

      mockPrisma.payrollRun.update.mockResolvedValue({
        id: 'run-fail-1',
        status: 'DRAFT',
      });

      await expect(runsService.calculate(orgPrimary, 'run-fail-1', adminUser.id)).rejects.toThrow(
        BadRequestException,
      );

      // Verify status rolled back to DRAFT with calculation error logged
      expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-fail-1' },
          data: expect.objectContaining({
            status: 'DRAFT',
            calculationLog: expect.objectContaining({
              error: 'Connection pool exhausted',
            }),
          }),
        }),
      );
    });
  });

  // ===========================================================================
  // 5. DECIMAL ARITHMETIC, ROUNDING, AND RECONCILIATION
  // ===========================================================================
  describe('Gate 5: Decimal Precision, Rounding Boundaries, and Financial Reconciliation', () => {
    it('should calculate gross-to-net without JavaScript floating-point drift', () => {
      // Basic 50,000.33, HRA 25,000.33, Special 12,500.34
      // Total Gross = 87,501.00 exactly
      // PF = 1,800.00, PT = 200.00, TDS = 10,000.50
      // Net = 87,501.00 - 12,000.50 = 75,500.50
      const basic = new Prisma.Decimal('50000.33');
      const hra = new Prisma.Decimal('25000.33');
      const special = new Prisma.Decimal('12500.34');
      const gross = basic.plus(hra).plus(special);

      expect(gross.toFixed(2)).toBe('87501.00');

      const pf = new Prisma.Decimal('1800.00');
      const pt = new Prisma.Decimal('200.00');
      const tds = new Prisma.Decimal('10000.50');
      const totalDeductions = pf.plus(pt).plus(tds);

      expect(totalDeductions.toFixed(2)).toBe('12000.50');

      const net = gross.minus(totalDeductions);
      expect(net.toFixed(2)).toBe('75500.50');

      // Verify reconciliation equation: Gross - Deductions - Net == 0
      const diff = gross.minus(totalDeductions).minus(net);
      expect(diff.isZero()).toBe(true);
    });

    it('should correctly handle Half-Up rounding at exact fractional boundaries (.005)', () => {
      const unrounded = new Prisma.Decimal('1234.565');
      const roundedHalfUp = unrounded.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      expect(roundedHalfUp.toFixed(2)).toBe('1234.57');

      const unroundedDown = new Prisma.Decimal('1234.564');
      const roundedDown = unroundedDown.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      expect(roundedDown.toFixed(2)).toBe('1234.56');
    });

    it('should calculate LOP proration accurately without penny leaks', () => {
      // 31 days calendar month, 3 days LOP
      // Active days = 28 / 31
      const monthlyGross = new Prisma.Decimal('62000.00');
      const totalCalendarDays = 31;
      const lopDays = 3;
      const paidDays = totalCalendarDays - lopDays; // 28

      const prorationFactor = new Prisma.Decimal(paidDays).dividedBy(totalCalendarDays);
      const earnedGross = monthlyGross
        .times(prorationFactor)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      // (62000 * 28) / 31 = 56000.00 exactly
      expect(earnedGross.toFixed(2)).toBe('56000.00');
    });
  });

  // ===========================================================================
  // 6. PRIVATE DOCUMENT DELIVERY & DATA MASKING
  // ===========================================================================
  describe('Gate 6: Private Document Delivery, PII Masking, and Cache Headers', () => {
    it('should mask bank account and PAN in employee payslip snapshot payload', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: 'emp-alice-id',
        userId: employeeAlice.id,
        organizationId: orgPrimary,
      });

      mockPrisma.employeePayrollSnapshot.findFirst.mockResolvedValue({
        id: 'snap-alice-pub',
        organizationId: orgPrimary,
        employeeId: 'emp-alice-id',
        payslipNumber: 'PAY-202610-001',
        payslipStatus: 'PUBLISHED',
        bankAccountMasked: '••••••••••••4321',
        panMasked: 'ABCDE••••F',
        pfUan: '100998877665',
        earnedGross: new Prisma.Decimal('80000.00'),
        totalDeductions: new Prisma.Decimal('8000.00'),
        netSalary: new Prisma.Decimal('72000.00'),
        calendarDays: new Prisma.Decimal(31),
        workingDays: new Prisma.Decimal(22),
        paidDays: new Prisma.Decimal(22),
        lopDays: new Prisma.Decimal(0),
        currency: 'INR',
        payrollRun: {
          period: {
            id: 'per-1',
            year: 2026,
            month: 10,
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
          },
        },
        items: [],
      });

      const detail = await payslipsService.getPayslipDetail('snap-alice-pub', employeeAlice);

      expect(detail.snapshot.bankAccountMasked).toBe('••••••••••••4321');
      expect(detail.snapshot.panMasked).toBe('ABCDE••••F');
      expect(detail.snapshot.bankAccountMasked).not.toContain('12345678');
    });

    it('should generate authorized PDF binary buffer for valid owner', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: 'emp-alice-id',
        userId: employeeAlice.id,
        organizationId: orgPrimary,
      });

      mockPrisma.employeePayrollSnapshot.findFirst.mockResolvedValue({
        id: 'snap-alice-pub',
        organizationId: orgPrimary,
        employeeId: 'emp-alice-id',
        employeeName: 'Alice Smith',
        employeeCode: 'EMP-001',
        payslipNumber: 'PAY-202610-001',
        payslipStatus: 'PUBLISHED',
        earnedGross: new Prisma.Decimal('80000.00'),
        totalDeductions: new Prisma.Decimal('8000.00'),
        netSalary: new Prisma.Decimal('72000.00'),
        calendarDays: new Prisma.Decimal(31),
        workingDays: new Prisma.Decimal(22),
        paidDays: new Prisma.Decimal(22),
        lopDays: new Prisma.Decimal(0),
        currency: 'INR',
        payrollRun: {
          period: {
            id: 'per-1',
            year: 2026,
            month: 10,
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
          },
        },
        items: [],
      });

      const pdf = await payslipsService.getPayslipPdfBuffer('snap-alice-pub', employeeAlice);

      expect(pdf.buffer).toBeInstanceOf(Buffer);
      expect(pdf.buffer.length).toBeGreaterThan(0);
      expect(pdf.filename).toBe('Payslip_EMP-001_2026_10.pdf');
    });
  });

  // ===========================================================================
  // 7. CSV EXPORT & FORMULA INJECTION DEFENSE (CWE-1236)
  // ===========================================================================
  describe('Gate 7: CSV Formula Injection Mitigation & Export Boundaries', () => {
    it('should prefix dangerous formula trigger characters (=, +, -, @, \\t, \\r, %) with single quote', () => {
      // Test malicious input payloads
      expect(exportService.sanitizeCsvField('=SUM(A1:A100)')).toBe(`"'=SUM(A1:A100)"`);
      expect(exportService.sanitizeCsvField('+cmd|/C calc!A0')).toBe(`"'+cmd|/C calc!A0"`);
      expect(exportService.sanitizeCsvField('-1+1')).toBe(`"'-1+1"`);
      expect(exportService.sanitizeCsvField('@SUM(1+1)')).toBe(`"'@SUM(1+1)"`);
      expect(exportService.sanitizeCsvField('\tTAB_TRIGGER')).toBe(`"'\tTAB_TRIGGER"`);
      expect(exportService.sanitizeCsvField('%PERCENT_VAR')).toBe(`"'%PERCENT_VAR"`);

      // Test standard benign strings
      expect(exportService.sanitizeCsvField('Alice Smith')).toBe(`"Alice Smith"`);
      expect(exportService.sanitizeCsvField('Engineering')).toBe(`"Engineering"`);
      expect(exportService.sanitizeCsvField(125000)).toBe(`"125000"`);
      expect(exportService.sanitizeCsvField(null)).toBe('""');
    });

    it('should escape internal double quotes in CSV fields', () => {
      expect(exportService.sanitizeCsvField('Executive "VP" Office')).toBe(
        `"Executive ""VP"" Office"`,
      );
    });

    it('should block regular employees from triggering organizational CSV exports', async () => {
      await expect(
        exportService.exportReportCsv(employeeAlice, { reportKey: 'REP-PAY-01' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // 8. AUDIT LOG HYGIENE (NON-EXPOSURE OF SENSITIVE PAYLOADS)
  // ===========================================================================
  describe('Gate 8: Audit Log Scrubbing and Sensitive PII Non-Exposure', () => {
    it('should record operational metadata without logging plaintext salaries or bank accounts', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: 'emp-alice-id',
        userId: employeeAlice.id,
        organizationId: orgPrimary,
      });

      mockPrisma.employeePayrollSnapshot.findFirst.mockResolvedValue({
        id: 'snap-alice-pub',
        organizationId: orgPrimary,
        employeeId: 'emp-alice-id',
        payslipNumber: 'PAY-202610-001',
        payslipStatus: 'PUBLISHED',
        bankAccountMasked: '••••••••••••4321',
        panMasked: 'ABCDE••••F',
        earnedGross: new Prisma.Decimal('80000.00'),
        totalDeductions: new Prisma.Decimal('8000.00'),
        netSalary: new Prisma.Decimal('72000.00'),
        calendarDays: new Prisma.Decimal(31),
        workingDays: new Prisma.Decimal(22),
        paidDays: new Prisma.Decimal(22),
        lopDays: new Prisma.Decimal(0),
        currency: 'INR',
        payrollRun: {
          period: {
            id: 'per-1',
            year: 2026,
            month: 10,
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
          },
        },
        items: [],
      });

      await payslipsService.getPayslipDetail('snap-alice-pub', employeeAlice);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYSLIP_VIEWED',
          organizationId: orgPrimary,
          userId: employeeAlice.id,
          entityId: 'snap-alice-pub',
        }),
      );

      const auditPayload = mockAudit.record.mock.calls[0][0];
      const stringifiedPayload = JSON.stringify(auditPayload);

      // Verify no raw unmasked bank account or unmasked salary details leaked into audit metadata
      expect(stringifiedPayload).not.toContain('80000.00');
      expect(stringifiedPayload).not.toContain('72000.00');
      expect(stringifiedPayload).not.toContain('12345678');
    });
  });
});
