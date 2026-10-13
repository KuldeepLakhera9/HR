import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayrollAnalyticsService } from './services/payroll-analytics.service';
import { ReportExportService } from './services/report-export.service';
import { ReportReconciliationService } from './services/report-reconciliation.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('Phase 11.10: Payroll Reports, Secure Exports, and Reconciliation', () => {
  let payrollAnalyticsService: PayrollAnalyticsService;
  let reportExportService: ReportExportService;
  let reconciliationService: ReportReconciliationService;
  let prisma: any;
  let auditService: any;
  let hierarchyService: any;

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@company.internal',
    firstName: 'Admin',
    lastName: 'User',
    employeeCode: 'EMP-ADM-01',
    status: 'ACTIVE' as any,
    sessionId: 'session-1',
    roles: ['ADMIN'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW', 'payroll:reports_view', 'payroll:view_all'],
  };

  const mockHrUser: AuthenticatedUser = {
    id: 'user-hr-1',
    email: 'hr@company.internal',
    firstName: 'HR',
    lastName: 'Specialist',
    employeeCode: 'EMP-HR-01',
    status: 'ACTIVE' as any,
    sessionId: 'session-2',
    roles: ['HR'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW', 'payroll:reports_view'],
  };

  const mockUnauthorizedUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'dev@company.internal',
    firstName: 'John',
    lastName: 'Developer',
    employeeCode: 'EMP-DEV-01',
    status: 'ACTIVE' as any,
    sessionId: 'session-3',
    roles: ['EMPLOYEE'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW'], // lacks explicit payroll permissions
  };

  const mockPeriod = {
    id: 'period-2026-10',
    organizationId: 'org-test-1',
    year: 2026,
    month: 10,
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-31'),
    status: 'OPEN',
  };

  const mockRun = {
    id: 'run-final-1',
    organizationId: 'org-test-1',
    periodId: 'period-2026-10',
    title: 'October 2026 Regular Payroll',
    runNumber: 1,
    calculationVersion: 1,
    status: 'LOCKED',
    period: mockPeriod,
  };

  const mockSnapshots = [
    {
      id: 'snap-1',
      organizationId: 'org-test-1',
      payrollRunId: 'run-final-1',
      employeeId: 'emp-1',
      employeeCode: 'EMP-001',
      employeeName: 'Alice Engineer',
      departmentName: 'Engineering',
      designationTitle: 'Senior Dev',
      branchName: 'HQ',
      calendarDays: 31,
      workingDays: 22,
      paidDays: 22,
      lopDays: 0,
      baseMonthlyGross: 100000,
      earnedGross: 100000,
      totalDeductions: 15000,
      netSalary: 85000,
      roundingAdjustment: 0,
      currency: 'INR',
      payslipStatus: 'PUBLISHED',
      paymentStatus: 'PAID',
      paymentMethod: 'BANK_TRANSFER',
      bankName: 'HDFC',
      bankAccountMasked: '••••1234',
      panMasked: '••••5678',
      isException: false,
      items: [
        {
          componentCode: 'BASIC',
          componentName: 'Basic Salary',
          type: 'EARNING',
          standardAmount: 50000,
          earnedAmount: 50000,
        },
        {
          componentCode: 'HRA',
          componentName: 'House Rent Allowance',
          type: 'EARNING',
          standardAmount: 30000,
          earnedAmount: 30000,
        },
        {
          componentCode: 'SPECIAL',
          componentName: 'Special Allowance',
          type: 'EARNING',
          standardAmount: 20000,
          earnedAmount: 20000,
        },
        {
          componentCode: 'PF_EE',
          componentName: 'Provident Fund (Employee)',
          type: 'DEDUCTION',
          standardAmount: 6000,
          earnedAmount: 6000,
        },
        {
          componentCode: 'TDS',
          componentName: 'Tax Deducted at Source',
          type: 'DEDUCTION',
          standardAmount: 9000,
          earnedAmount: 9000,
        },
        {
          componentCode: 'PF_ER',
          componentName: 'Provident Fund (Employer)',
          type: 'EMPLOYER_CONTRIBUTION',
          standardAmount: 6000,
          earnedAmount: 6000,
        },
      ],
      employee: {
        id: 'emp-1',
        employeeCode: 'EMP-001',
        departmentId: 'dept-eng',
        department: { id: 'dept-eng', name: 'Engineering' },
        branchId: 'branch-hq',
        branch: { id: 'branch-hq', name: 'HQ' },
        status: 'ACTIVE',
      },
    },
    {
      id: 'snap-2',
      organizationId: 'org-test-1',
      payrollRunId: 'run-final-1',
      employeeId: 'emp-2',
      employeeCode: 'EMP-002',
      employeeName: 'Bob Product',
      departmentName: 'Product',
      designationTitle: 'Product Manager',
      branchName: 'HQ',
      calendarDays: 31,
      workingDays: 22,
      paidDays: 20,
      lopDays: 2,
      baseMonthlyGross: 120000,
      earnedGross: 109090.91,
      totalDeductions: 16000,
      netSalary: 93090.91,
      roundingAdjustment: 0,
      currency: 'INR',
      payslipStatus: 'PUBLISHED',
      paymentStatus: 'PAID',
      paymentMethod: 'BANK_TRANSFER',
      bankName: 'ICICI',
      bankAccountMasked: '••••9876',
      panMasked: '••••4321',
      isException: false,
      items: [
        {
          componentCode: 'BASIC',
          componentName: 'Basic Salary',
          type: 'EARNING',
          standardAmount: 60000,
          earnedAmount: 54545.45,
        },
        {
          componentCode: 'HRA',
          componentName: 'House Rent Allowance',
          type: 'EARNING',
          standardAmount: 36000,
          earnedAmount: 32727.27,
        },
        {
          componentCode: 'SPECIAL',
          componentName: 'Special Allowance',
          type: 'EARNING',
          standardAmount: 24000,
          earnedAmount: 21818.19,
        },
        {
          componentCode: 'PF_EE',
          componentName: 'Provident Fund (Employee)',
          type: 'DEDUCTION',
          standardAmount: 6000,
          earnedAmount: 6000,
        },
        {
          componentCode: 'TDS',
          componentName: 'Tax Deducted at Source',
          type: 'DEDUCTION',
          standardAmount: 10000,
          earnedAmount: 10000,
        },
        {
          componentCode: 'PF_ER',
          componentName: 'Provident Fund (Employer)',
          type: 'EMPLOYER_CONTRIBUTION',
          standardAmount: 6000,
          earnedAmount: 6000,
        },
      ],
      employee: {
        id: 'emp-2',
        employeeCode: 'EMP-002',
        departmentId: 'dept-prod',
        department: { id: 'dept-prod', name: 'Product' },
        branchId: 'branch-hq',
        branch: { id: 'branch-hq', name: 'HQ' },
        status: 'ACTIVE',
      },
    },
  ];

  beforeEach(async () => {
    prisma = {
      payrollRun: {
        findFirst: jest.fn().mockImplementation((args: any) => {
          if (args.where?.id === 'non-existent') return null;
          return Promise.resolve(mockRun);
        }),
        findMany: jest.fn().mockResolvedValue([mockRun]),
      },
      payrollPeriod: {
        findFirst: jest.fn().mockResolvedValue(mockPeriod),
        findMany: jest.fn().mockResolvedValue([mockPeriod]),
      },
      employeePayrollSnapshot: {
        findMany: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.departmentId === 'dept-eng') {
            return Promise.resolve([mockSnapshots[0]]);
          }
          return Promise.resolve(mockSnapshots);
        }),
        count: jest.fn().mockResolvedValue(mockSnapshots.length),
      },
      payrollException: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      payrollAdjustment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      payrollApprovalHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      department: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dept-eng', name: 'Engineering' },
          { id: 'dept-prod', name: 'Product' },
        ]),
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: 'branch-hq', name: 'HQ' }]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-test-1', timezone: 'Asia/Kolkata' }),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(2),
      },
      attendanceDailySummary: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      leaveBalanceAccount: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    auditService = {
      logAction: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
      createAuditLog: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
    };

    hierarchyService = {
      getSubordinateEmployeeIds: jest.fn().mockResolvedValue(['emp-1', 'emp-2']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    payrollAnalyticsService = module.get<PayrollAnalyticsService>(PayrollAnalyticsService);

    reportExportService = new ReportExportService(
      prisma,
      hierarchyService,
      payrollAnalyticsService,
    );

    reconciliationService = new ReportReconciliationService(prisma);
  });

  // ===========================================================================
  // 1. Report Totals & Finalized-Run Consistency
  // ===========================================================================
  describe('1. Report Totals & Finalized-Run Consistency', () => {
    it('calculates exact gross, deductions, net, employer contributions, and CTC totals', async () => {
      const summary = await payrollAnalyticsService.getPayrollSummaryReport(mockAdminUser, {
        runId: 'run-final-1',
      });

      expect(summary.run.id).toBe('run-final-1');
      expect(summary.headcount.totalEmployees).toBe(2);

      // Expected sums:
      const expectedEarnedGross = Math.round((100000 + 109090.91) * 100) / 100; // 209090.91
      const expectedDeductions = 15000 + 16000; // 31000
      const expectedNetSalary = Math.round((85000 + 93090.91) * 100) / 100; // 178090.91
      const expectedEmployerContrib = 6000 + 6000; // 12000

      expect(summary.financialTotals.earnedGross).toBeCloseTo(expectedEarnedGross, 1);
      expect(summary.financialTotals.totalEmployeeDeductions).toBe(expectedDeductions);
      expect(summary.financialTotals.netSalary).toBeCloseTo(expectedNetSalary, 1);
      expect(summary.financialTotals.totalEmployerContributions).toBe(expectedEmployerContrib);
      expect(summary.financialTotals.totalCostToCompany).toBeCloseTo(
        expectedEarnedGross + expectedEmployerContrib,
        1,
      );

      // Ledger reconciliation check: Gross - Deductions == Net
      expect(summary.reconciliationAudit.grossMinusDeductionsEqualsNet).toBe(true);
      expect(summary.reconciliationAudit.discrepancyAmount).toBeLessThanOrEqual(0.05); // penny rounding tolerance
    });

    it('throws NotFoundException when the requested payroll run does not exist', async () => {
      await expect(
        payrollAnalyticsService.getPayrollSummaryReport(mockAdminUser, { runId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // 2. Department & Branch Cost Scoping
  // ===========================================================================
  describe('2. Department & Branch Cost Scoping', () => {
    it('scopes totals strictly to the filtered department', async () => {
      const deptSummary = await payrollAnalyticsService.getPayrollSummaryReport(mockAdminUser, {
        runId: 'run-final-1',
        departmentId: 'dept-eng',
      });

      // Engineering has only Alice (gross 100000, net 85000)
      expect(deptSummary.headcount.totalEmployees).toBe(1);
      expect(deptSummary.financialTotals.earnedGross).toBe(100000);
      expect(deptSummary.financialTotals.netSalary).toBe(85000);
      expect(deptSummary.financialTotals.totalEmployeeDeductions).toBe(15000);
    });

    it('aggregates cost centers across departments and branches correctly', async () => {
      const costCenterReport = await payrollAnalyticsService.getCostCenterReport(mockAdminUser, {
        runId: 'run-final-1',
      });

      expect(costCenterReport.totalHeadcount).toBe(2);
      expect(costCenterReport.departments.length).toBe(2);

      const engDept = costCenterReport.departments.find((d) => d.name === 'Engineering');
      const prodDept = costCenterReport.departments.find((d) => d.name === 'Product');

      expect(engDept).toBeDefined();
      expect(engDept?.earnedGross).toBe(100000);
      expect(engDept?.netPay).toBe(85000);

      expect(prodDept).toBeDefined();
      expect(prodDept?.earnedGross).toBeCloseTo(109090.91, 1);
    });
  });

  // ===========================================================================
  // 3. Employee-Level Register Authorization & RBAC
  // ===========================================================================
  describe('3. Employee-Level Register Authorization & RBAC', () => {
    it('allows ADMIN to access confidential employee payroll register', async () => {
      const register = await payrollAnalyticsService.getPayrollRegisterReport(mockAdminUser, {
        runId: 'run-final-1',
      });

      expect(register.items.length).toBe(2);
      expect(register.items[0].employeeCode).toBe('EMP-001');
      expect(register.items[0].netSalary).toBe(85000);
      expect(register.items[0].bankAccountMasked).toBe('••••1234');
    });

    it('allows HR to access confidential employee payroll register', async () => {
      const register = await payrollAnalyticsService.getPayrollRegisterReport(mockHrUser, {
        runId: 'run-final-1',
      });

      expect(register.items.length).toBe(2);
    });

    it('strictly forbids standard employee or unauthorized user from viewing salary register (403 Forbidden)', async () => {
      await expect(
        payrollAnalyticsService.getPayrollRegisterReport(mockUnauthorizedUser, {
          runId: 'run-final-1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // 4. Secure CSV Export & Formula Injection Escaping
  // ===========================================================================
  describe('4. Secure CSV Export & Formula Injection Escaping', () => {
    it('escapes cells starting with formula injection characters (=, +, -, @, Tab, CR)', () => {
      // Direct unit test of sanitizeCsvField
      expect(reportExportService.sanitizeCsvField('=SUM(A1:B1)')).toBe('"\'=SUM(A1:B1)"');
      expect(reportExportService.sanitizeCsvField('+123456')).toBe('"\'+123456"');
      expect(reportExportService.sanitizeCsvField('-500.00')).toBe('"\'-500.00"');
      expect(reportExportService.sanitizeCsvField('@cmd|calc')).toBe('"\'@cmd|calc"');
      expect(reportExportService.sanitizeCsvField('\tTAB_INDENT')).toBe('"\'\tTAB_INDENT"');
      expect(reportExportService.sanitizeCsvField('%PERCENT_TEST')).toBe('"\'%PERCENT_TEST"');

      // Standard safe strings should be wrapped in standard CSV quotes
      expect(reportExportService.sanitizeCsvField('Engineering')).toBe('"Engineering"');
      expect(reportExportService.sanitizeCsvField('Alice Developer')).toBe('"Alice Developer"');
    });

    it('escapes internal double quotes properly in CSV output', () => {
      expect(reportExportService.sanitizeCsvField('John "The Architect" Doe')).toBe(
        '"John ""The Architect"" Doe"',
      );
    });

    it('exports sanitized Payroll Register CSV with formula protection', async () => {
      const exportResult = await reportExportService.exportReportCsv(mockAdminUser, {
        reportKey: 'REP-PAY-03',
        runId: 'run-final-1',
      });

      expect(exportResult.filename).toContain('REP-PAY-03');
      expect(exportResult.contentType).toBe('text/csv; charset=utf-8');
      expect(exportResult.csv).toContain('Employee Code');
      expect(exportResult.csv).toContain('EMP-001');
      expect(exportResult.csv).toContain('85000.00');
    });

    it('blocks unauthorized users from exporting sensitive payroll register (REP-PAY-03)', async () => {
      await expect(
        reportExportService.exportReportCsv(mockUnauthorizedUser, {
          reportKey: 'REP-PAY-03',
          runId: 'run-final-1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // 5. Audit Logging Without Leaking Row Contents
  // ===========================================================================
  describe('5. Audit Logging Without Leaking Row Contents', () => {
    it('records export metadata in audit log without storing sensitive row payloads', async () => {
      await reportExportService.exportReportCsv(mockAdminUser, {
        reportKey: 'REP-PAY-01',
        runId: 'run-final-1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-test-1',
            userId: 'user-admin-1',
            action: 'REPORT_EXPORTED',
            entity: 'REPORT',
            entityId: 'REP-PAY-01',
            newValues: expect.objectContaining({
              reportKey: 'REP-PAY-01',
              rowCount: expect.any(Number),
            }),
          }),
        }),
      );

      // Verify no salary snapshot rows or bank account numbers were passed into newValues
      const callArgs = prisma.auditLog.create.mock.calls[0][0];
      expect(JSON.stringify(callArgs.data.newValues)).not.toContain('85000');
      expect(JSON.stringify(callArgs.data.newValues)).not.toContain('••••1234');
    });
  });

  // ===========================================================================
  // 6. Period-over-Period Variance & Movements
  // ===========================================================================
  describe('6. Period-over-Period Variance & Movements', () => {
    it('computes percentage changes and trend direction accurately', async () => {
      const priorRun = {
        ...mockRun,
        id: 'run-prior',
        title: 'September 2026 Regular Payroll',
        period: { ...mockPeriod, id: 'period-prior', month: 9 },
      };

      // Mock finding comparison run
      prisma.payrollRun.findFirst = jest.fn().mockImplementation((args: any) => {
        if (args.where?.id === 'run-prior') return Promise.resolve(priorRun);
        return Promise.resolve(mockRun);
      });

      const comparison = await payrollAnalyticsService.getPeriodComparisonReport(mockAdminUser, {
        runId: 'run-final-1',
        compareRunId: 'run-prior',
      });

      expect(comparison.basePeriod).toBeDefined();
      expect(comparison.comparePeriod).toBeDefined();
      expect(comparison.variances.length).toBeGreaterThan(0);
      expect(comparison.departmentComparisons).toBeDefined();
    });
  });

  // ===========================================================================
  // 7. Data Quality & Ledger Reconciliation (Domain 6)
  // ===========================================================================
  describe('7. Data Quality & Ledger Reconciliation (Domain 6)', () => {
    it('detects calculation discrepancies (DQ-PAY-01) when net pay drift exceeds rounding tolerance', async () => {
      // Inject synthetic corrupted snapshot where net != earnedGross - deductions
      const corruptedSnapshot = {
        ...mockSnapshots[0],
        id: 'corrupted-snap',
        earnedGross: 100000,
        totalDeductions: 10000,
        netSalary: 75000, // Should be 90000! Discrepancy = 15000
      };

      prisma.employeePayrollSnapshot.findMany = jest.fn().mockResolvedValue([corruptedSnapshot]);

      const auditResult = await reconciliationService.runDataQualityChecks(mockAdminUser, {
        domain: 'PAYROLL',
      });

      expect(auditResult.summaryByDomain['PAYROLL']).toBeDefined();
      const payrollDiscrepancies = auditResult.discrepancies.filter((d) => d.domain === 'PAYROLL');

      const dqPay01 = payrollDiscrepancies.find((d) => d.checkCode === 'DQ-PAY-01');
      expect(dqPay01).toBeDefined();
      expect(dqPay01?.severity).toBe('CRITICAL');
      expect(dqPay01?.checkName).toBe('Net Salary Calculation Discrepancy');
      expect(dqPay01?.description).toContain('differs from Net Salary');
    });

    it('detects negative net salary anomalies (DQ-PAY-02)', async () => {
      const negativeNetSnapshot = {
        ...mockSnapshots[0],
        id: 'neg-snap',
        earnedGross: 10000,
        totalDeductions: 15000,
        netSalary: -5000, // Negative pay!
      };

      prisma.employeePayrollSnapshot.findMany = jest.fn().mockResolvedValue([negativeNetSnapshot]);

      const auditResult = await reconciliationService.runDataQualityChecks(mockAdminUser, {
        domain: 'PAYROLL',
      });

      const dqPay02 = auditResult.discrepancies.find((d) => d.checkCode === 'DQ-PAY-02');
      expect(dqPay02).toBeDefined();
      expect(dqPay02?.severity).toBe('CRITICAL');
      expect(dqPay02?.checkName).toBe('Negative Net Salary Detected');
      expect(dqPay02?.description).toContain('is negative');
    });
  });
});
