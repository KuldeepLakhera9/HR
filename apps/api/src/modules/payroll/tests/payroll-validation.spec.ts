import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayrollValidationService } from '../services/payroll-validation.service';
import { PayrollRunsService } from '../services/payroll-runs.service';
import { PayrollCalculationEngineService } from '../services/payroll-calculation-engine.service';

describe('Phase 11.7: Payroll Validation and Exception Management Tests', () => {
  let validationService: PayrollValidationService;
  let runsService: PayrollRunsService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockCalculationEngine: any;
  let mockInputs: any;

  beforeEach(() => {
    mockPrisma = {
      payrollRun: {
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      payrollException: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      payrollApprovalHistory: {
        create: jest.fn(),
      },
      employeePayrollSnapshot: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      payrollAdjustment: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockCalculationEngine = new PayrollCalculationEngineService();
    mockInputs = {
      getPayrollAttendanceReconciliation: jest.fn(),
      detectLateSourceChanges: jest.fn(),
    };

    validationService = new PayrollValidationService(mockPrisma, mockAudit);
    runsService = new PayrollRunsService(
      mockPrisma,
      mockAudit,
      mockCalculationEngine,
      mockInputs,
      validationService,
    );
  });

  describe('Explainable Validation Rules & Exception Generation', () => {
    it('should detect BLOCKING_ERROR for missing compensation assignment and negative net pay', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        organizationId: 'org-1',
        calculationVersion: 1,
        period: { year: 2026, month: 10 },
        snapshots: [
          {
            id: 'snap-1',
            employeeId: 'emp-1',
            employeeCode: 'EMP001',
            employeeName: 'Alice MissingComp',
            baseMonthlyGross: 0,
            earnedGross: 0,
            totalDeductions: 0,
            netSalary: 0,
            isException: true,
            exceptionReason: 'No approved compensation structure found',
            calculationInputSnapshot: {},
          },
          {
            id: 'snap-2',
            employeeId: 'emp-2',
            employeeCode: 'EMP002',
            employeeName: 'Bob NegativeNet',
            baseMonthlyGross: 50000,
            earnedGross: 20000,
            totalDeductions: 25000,
            netSalary: -5000,
            isException: false,
            calculationInputSnapshot: {},
          },
        ],
      });

      mockPrisma.payrollException.count.mockResolvedValue(2);

      await validationService.validateRun('org-1', 'run-1');

      // Verify open exceptions deleted before regeneration
      expect(mockPrisma.payrollException.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', payrollRunId: 'run-1', status: 'OPEN' },
      });

      // Verify exceptions created
      expect(mockPrisma.payrollException.createMany).toHaveBeenCalled();
      const createCall = mockPrisma.payrollException.createMany.mock.calls[0][0];
      const createdItems = createCall.data;
      const blockingItems = createdItems.filter((i: any) => i.severity === 'BLOCKING_ERROR');

      expect(blockingItems).toHaveLength(2);
      expect(blockingItems.some((i: any) => i.category === 'MISSING_COMPENSATION')).toBe(true);
      expect(blockingItems.some((i: any) => i.category === 'NEGATIVE_NET_PAY')).toBe(true);
    });

    it('should detect ANOMALY_SALARY_SPIKE and ANOMALY_SALARY_DROP as WARNINGs without altering pay amounts', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-2',
        organizationId: 'org-1',
        calculationVersion: 1,
        period: { year: 2026, month: 10 },
        snapshots: [
          {
            id: 'snap-spike',
            employeeId: 'emp-spike',
            employeeCode: 'EMP003',
            employeeName: 'Charlie Spike',
            baseMonthlyGross: 100000,
            earnedGross: 140000, // +40% spike
            totalDeductions: 10000,
            netSalary: 130000,
            isException: false,
            calculationInputSnapshot: {},
          },
          {
            id: 'snap-drop',
            employeeId: 'emp-drop',
            employeeCode: 'EMP004',
            employeeName: 'Diana Drop',
            baseMonthlyGross: 100000,
            earnedGross: 60000, // -40% drop
            totalDeductions: 5000,
            netSalary: 55000,
            isException: false,
            calculationInputSnapshot: {},
          },
        ],
      });

      mockPrisma.payrollException.count.mockResolvedValue(2);

      await validationService.validateRun('org-1', 'run-2');

      const createCall = mockPrisma.payrollException.createMany.mock.calls[0][0];
      const items = createCall.data;

      expect(
        items.some((i: any) => i.category === 'ANOMALY_SALARY_SPIKE' && i.severity === 'WARNING'),
      ).toBe(true);
      expect(
        items.some((i: any) => i.category === 'ANOMALY_SALARY_DROP' && i.severity === 'WARNING'),
      ).toBe(true);

      // Verify explainable spike & drop titles
      const spike = items.find((i: any) => i.category === 'ANOMALY_SALARY_SPIKE');
      expect(spike.title).toContain('+40%');
      expect(spike.explanation).toContain('higher than base monthly salary');

      const drop = items.find((i: any) => i.category === 'ANOMALY_SALARY_DROP');
      expect(drop.title).toContain('-40%');
      expect(drop.explanation).toContain('lower than base monthly salary');
    });
  });

  describe('Approval Gating: Blocking Errors vs Review Warnings', () => {
    it('should PREVENT approval when open BLOCKING_ERROR exceptions remain', async () => {
      // Mock run in REVIEW_PENDING status
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-blocked',
        organizationId: 'org-1',
        status: 'REVIEW_PENDING',
        title: 'October 2026 Payroll',
      });

      // Mock exception count showing 1 blocking error
      mockPrisma.payrollException.count.mockImplementation((args: any) => {
        if (args?.where?.severity === 'BLOCKING_ERROR') return Promise.resolve(1);
        if (args?.where?.severity === 'WARNING') return Promise.resolve(2);
        return Promise.resolve(3);
      });

      mockPrisma.payrollException.findMany.mockResolvedValue([]);

      await expect(
        runsService.approve(
          'org-1',
          'run-blocked',
          { comments: 'Ready to sign off' },
          'user-manager',
        ),
      ).rejects.toThrow(/1 unresolved blocking error\(s\) must be resolved first/);

      // Ensure run status was NOT updated to APPROVED
      expect(mockPrisma.payrollRun.update).not.toHaveBeenCalled();
    });

    it('should ALLOW approval when only WARNINGs exist and PRESERVE warnings in audit trail', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-warnings-only',
        organizationId: 'org-1',
        status: 'REVIEW_PENDING',
        title: 'October 2026 Payroll',
      });

      // Summary counts: 0 blocking errors, 2 warnings
      mockPrisma.payrollException.count
        .mockResolvedValueOnce(2) // total
        .mockResolvedValueOnce(0) // blockingErrors = 0
        .mockResolvedValueOnce(2) // warnings = 2
        .mockResolvedValueOnce(0) // info = 0
        .mockResolvedValueOnce(2) // open = 2
        .mockResolvedValueOnce(0) // resolved
        .mockResolvedValueOnce(0); // overridden

      mockPrisma.payrollException.findMany.mockResolvedValue([
        {
          id: 'ex-1',
          category: 'ANOMALY_SALARY_SPIKE',
          title: 'Salary Spike',
          employee: { displayName: 'John' },
        },
        {
          id: 'ex-2',
          category: 'UNRESOLVED_ATTENDANCE',
          title: 'Pending Attendance',
          employee: { displayName: 'Jane' },
        },
      ]);

      mockPrisma.payrollRun.update.mockResolvedValue({
        id: 'run-warnings-only',
        status: 'APPROVED',
      });

      const approved = await runsService.approve(
        'org-1',
        'run-warnings-only',
        { comments: 'Approved with accepted spike anomaly' },
        'user-finance-head',
      );

      expect(approved.status).toBe('APPROVED');
      expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED',
            approvedById: 'user-finance-head',
          }),
        }),
      );

      // Verify approval history preserved warnings
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            comments: expect.stringContaining('Preserved 2 unresolved review warning(s)'),
          }),
        }),
      );

      // Verify audit record preserved warning counts and metadata
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYROLL_RUN_APPROVED',
          metadata: expect.objectContaining({
            unresolvedWarningsCount: 2,
            unresolvedExceptionsPreserved: expect.arrayContaining([
              expect.objectContaining({ category: 'ANOMALY_SALARY_SPIKE' }),
            ]),
          }),
        }),
      );
    });
  });

  describe('Exception Investigation & Resolution Workflow', () => {
    it('should reject exception resolution if resolutionNotes is missing or under 5 characters', async () => {
      mockPrisma.payrollException.findFirst.mockResolvedValue({
        id: 'ex-10',
        organizationId: 'org-1',
        payrollRunId: 'run-1',
        payrollRun: { status: 'REVIEW_PENDING' },
        severity: 'BLOCKING_ERROR',
      });

      // Too short note (< 5 chars)
      await expect(
        validationService.resolveException(
          'org-1',
          'ex-10',
          { action: 'OVERRIDE_APPROVED', resolutionNotes: 'ok' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validationService.resolveException(
          'org-1',
          'ex-10',
          { action: 'OVERRIDE_APPROVED', resolutionNotes: '   ' },
          'user-1',
        ),
      ).rejects.toThrow(/minimum 5 characters/);
    });

    it('should reject resolving exceptions on LOCKED or PUBLISHED runs', async () => {
      mockPrisma.payrollException.findFirst.mockResolvedValue({
        id: 'ex-locked',
        organizationId: 'org-1',
        payrollRunId: 'run-locked',
        payrollRun: { status: 'LOCKED' },
      });

      await expect(
        validationService.resolveException(
          'org-1',
          'ex-locked',
          { action: 'OVERRIDE_APPROVED', resolutionNotes: 'Authorized override by VP' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully resolve an exception, update run open counts, and log audit event', async () => {
      mockPrisma.payrollException.findFirst.mockResolvedValue({
        id: 'ex-valid',
        organizationId: 'org-1',
        payrollRunId: 'run-1',
        payrollRun: { status: 'REVIEW_PENDING' },
        severity: 'BLOCKING_ERROR',
        category: 'MISSING_COMPENSATION',
      });

      mockPrisma.payrollException.update.mockResolvedValue({
        id: 'ex-valid',
        status: 'OVERRIDDEN',
        resolutionAction: 'OVERRIDE_APPROVED',
        resolutionNotes: 'Approved manual compensation assignment verified with HR VP',
        resolvedById: 'user-exec',
      });

      mockPrisma.payrollException.count.mockResolvedValue(0); // 0 remaining open

      const resolved = await validationService.resolveException(
        'org-1',
        'ex-valid',
        {
          action: 'OVERRIDE_APPROVED',
          resolutionNotes: 'Approved manual compensation assignment verified with HR VP',
        },
        'user-exec',
      );

      expect(resolved.status).toBe('OVERRIDDEN');
      expect(mockPrisma.payrollException.update).toHaveBeenCalledWith({
        where: { id: 'ex-valid' },
        data: expect.objectContaining({
          status: 'OVERRIDDEN',
          resolutionAction: 'OVERRIDE_APPROVED',
          resolutionNotes: 'Approved manual compensation assignment verified with HR VP',
          resolvedById: 'user-exec',
        }),
      });

      // Verify run exceptionCount was updated
      expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: { exceptionCount: 0 },
      });

      // Verify audit trail logged
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYROLL_EXCEPTION_RESOLVED',
          entity: 'PayrollException',
          entityId: 'ex-valid',
          userId: 'user-exec',
          metadata: expect.objectContaining({
            action: 'OVERRIDE_APPROVED',
            newStatus: 'OVERRIDDEN',
            notes: 'Approved manual compensation assignment verified with HR VP',
          }),
        }),
      );
    });
  });

  describe('Revalidation and Filtering', () => {
    it('should support revalidation on demand via runsService.revalidate', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-active',
        organizationId: 'org-1',
        status: 'REVIEW_PENDING',
        snapshots: [],
        period: { year: 2026, month: 10 },
      });

      mockPrisma.payrollException.count.mockResolvedValue(0);
      mockPrisma.payrollException.findMany.mockResolvedValue([]);

      const result = await runsService.revalidate('org-1', 'run-active');

      expect(mockPrisma.payrollException.deleteMany).toHaveBeenCalled();
      expect(result.canApprove).toBe(true);
      expect(result.blockingErrors).toBe(0);
    });

    it('should disallow revalidation on LOCKED runs', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-finalized',
        organizationId: 'org-1',
        status: 'LOCKED',
      });

      await expect(runsService.revalidate('org-1', 'run-finalized')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
