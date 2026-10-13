import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PayrollRunsService } from '../services/payroll-runs.service';
import { PayrollCalculationEngineService } from '../services/payroll-calculation-engine.service';
import { Prisma } from '@prisma/client';

describe('Phase 11.8: Payroll Review, Approval, Locking, and Publishing Tests', () => {
  let runsService: PayrollRunsService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockInputs: any;
  let mockValidation: any;

  const orgId = 'org-test-1';
  const creatorId = 'user-creator-1';
  const calculatorId = 'user-calc-1';
  const approverId = 'user-approver-2';

  const mockPeriod = {
    id: 'period-2026-10',
    organizationId: orgId,
    year: 2026,
    month: 10,
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-31'),
    cutoffDate: new Date('2026-10-25'),
    totalDays: 31,
    status: 'OPEN',
  };

  beforeEach(() => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      payrollPeriod: {
        findUnique: jest.fn().mockResolvedValue(mockPeriod),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      payrollRun: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      payrollApprovalHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      employeeCompensation: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      payrollAdjustment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      employeePayrollSnapshot: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 5 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(mockPrisma);
        }
        return Promise.all(cb);
      }),
    };

    mockInputs = {
      getEmployeeWorkSummary: jest.fn(),
      detectLateSourceChanges: jest.fn().mockResolvedValue({ totalLateChanges: 0, changes: [] }),
      getPayrollAttendanceReconciliation: jest.fn().mockResolvedValue({ items: [] }),
    };

    mockValidation = {
      validateRun: jest.fn().mockResolvedValue({
        total: 0,
        blockingErrors: 0,
        warnings: 0,
        information: 0,
        open: 0,
        resolved: 0,
        overridden: 0,
        hasBlockingErrors: false,
        canApprove: true,
      }),
      getExceptionsSummary: jest.fn().mockResolvedValue({
        total: 0,
        blockingErrors: 0,
        warnings: 0,
        information: 0,
        open: 0,
        resolved: 0,
        overridden: 0,
        hasBlockingErrors: false,
        canApprove: true,
        unresolvedWarnings: [],
      }),
    };

    runsService = new PayrollRunsService(
      mockPrisma,
      mockAudit,
      new PayrollCalculationEngineService(),
      mockInputs,
      mockValidation,
    );
  });

  describe('1. Unauthorized Approval and Permission Verification', () => {
    it('should reject approval when caller lacks PAYROLL_APPROVE permission', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
        createdById: creatorId,
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);

      await expect(
        runsService.approve(orgId, 'run-1', {}, approverId, ['PAYROLL_VIEW', 'PAYROLL_MANAGE']),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        runsService.approve(orgId, 'run-1', {}, approverId, ['PAYROLL_VIEW', 'PAYROLL_MANAGE']),
      ).rejects.toThrow(
        'Unauthorized: Approving payroll runs strictly requires PAYROLL_APPROVE permission.',
      );
    });
  });

  describe('2. Separation of Duties and Self-Approval Restrictions', () => {
    it('should prevent run creator from approving their own run (even with admin permissions)', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
        createdById: creatorId, // Creator is attempting to approve
        calculatedAt: new Date(),
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);

      await expect(
        runsService.approve(orgId, 'run-1', { comments: 'Self approval' }, creatorId, [
          'PAYROLL_APPROVE',
        ]),
      ).rejects.toThrow(BadRequestException);

      await expect(
        runsService.approve(orgId, 'run-1', { comments: 'Self approval' }, creatorId, [
          'PAYROLL_APPROVE',
        ]),
      ).rejects.toThrow(
        'Separation of duties violation: A user cannot approve a payroll run they created.',
      );
    });

    it('should prevent calculation executor from approving the run', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
        createdById: 'different-creator',
        calculatedAt: new Date(),
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);

      // Simulation: actor 'calculatorId' executed the calculation step
      mockPrisma.payrollApprovalHistory.findFirst.mockResolvedValue({
        id: 'hist-calc',
        actorId: calculatorId,
        action: 'CALCULATED',
      });

      await expect(
        runsService.approve(orgId, 'run-1', { comments: 'Self approval attempt' }, calculatorId, [
          'PAYROLL_APPROVE',
        ]),
      ).rejects.toThrow(BadRequestException);

      await expect(
        runsService.approve(orgId, 'run-1', { comments: 'Self approval attempt' }, calculatorId, [
          'PAYROLL_APPROVE',
        ]),
      ).rejects.toThrow(
        'Separation of duties violation: The user who calculated this payroll run cannot approve it.',
      );
    });
  });

  describe('3. Validation Blocking and Exception Enforcement', () => {
    it('should block approval when unresolved blocking exceptions exist', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
        createdById: creatorId,
        calculatedAt: new Date(),
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);

      mockValidation.getExceptionsSummary.mockResolvedValue({
        hasBlockingErrors: true,
        blockingErrors: 3,
        canApprove: false,
      });

      await expect(
        runsService.approve(orgId, 'run-1', {}, approverId, ['PAYROLL_APPROVE']),
      ).rejects.toThrow(BadRequestException);

      await expect(
        runsService.approve(orgId, 'run-1', {}, approverId, ['PAYROLL_APPROVE']),
      ).rejects.toThrow(
        'Cannot approve payroll run: 3 unresolved blocking error(s) must be resolved first.',
      );
    });
  });

  describe('4. Material Changes Invalidation Gating', () => {
    it('should require recalculation when late attendance changes are detected post-calculation', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
        createdById: creatorId,
        calculatedAt: new Date(Date.now() - 3600000), // Calculated 1 hour ago
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);

      mockInputs.detectLateSourceChanges.mockResolvedValue({
        totalLateChanges: 2,
        changes: [{ employeeId: 'emp-1' }, { employeeId: 'emp-2' }],
      });

      await expect(
        runsService.approve(orgId, 'run-1', {}, approverId, ['PAYROLL_APPROVE']),
      ).rejects.toThrow(BadRequestException);

      await expect(
        runsService.approve(orgId, 'run-1', {}, approverId, ['PAYROLL_APPROVE']),
      ).rejects.toThrow('Material attendance/leave changes (2) detected since last calculation');
    });

    it('should require recalculation when new adjustments are approved post-calculation', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        periodId: 'period-2026-10',
        status: 'REVIEW_PENDING',
        createdById: creatorId,
        calculatedAt: new Date(Date.now() - 3600000),
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);

      mockPrisma.payrollAdjustment.count.mockResolvedValue(1); // 1 new adjustment since calculatedAt

      await expect(
        runsService.approve(orgId, 'run-1', {}, approverId, ['PAYROLL_APPROVE']),
      ).rejects.toThrow(BadRequestException);

      await expect(
        runsService.approve(orgId, 'run-1', {}, approverId, ['PAYROLL_APPROVE']),
      ).rejects.toThrow('1 payroll adjustment(s) were added or modified since last calculation');
    });
  });

  describe('5. Approved Runs and Transition Workflows', () => {
    it('should approve run when all controls pass and preserve warnings in audit trail', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
        createdById: creatorId,
        calculatedAt: new Date(),
        totalGross: new Prisma.Decimal(500000),
        totalDeductions: new Prisma.Decimal(50000),
        totalNet: new Prisma.Decimal(450000),
        totalEmployerCost: new Prisma.Decimal(60000),
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.update.mockResolvedValue({
        ...mockRun,
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: approverId,
      });

      mockValidation.getExceptionsSummary.mockResolvedValue({
        hasBlockingErrors: false,
        warnings: 2,
        unresolvedWarnings: [{ id: 'w-1', title: 'Salary spike' }],
        canApprove: true,
      });

      const result = await runsService.approve(
        orgId,
        'run-1',
        { comments: 'All figures verified against GL budgets' },
        approverId,
        ['PAYROLL_APPROVE'],
      );

      expect(result.status).toBe('APPROVED');
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'APPROVED',
            actorId: approverId,
            comments:
              'All figures verified against GL budgets | Preserved 2 unresolved review warning(s).',
          }),
        }),
      );
    });
  });

  describe('6. Rejection Workflow', () => {
    it('should transition REVIEW_PENDING run back to DRAFT with mandatory reason', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.update.mockResolvedValue({
        ...mockRun,
        status: 'DRAFT',
      });

      const result = await runsService.reject(
        orgId,
        'run-1',
        {
          rejectionReason: 'Commission numbers need verification from sales head',
        },
        approverId,
      );

      expect(result.status).toBe('DRAFT');
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REJECTED',
            comments: 'Commission numbers need verification from sales head',
            actorId: approverId,
          }),
        }),
      );
    });

    it('should reject without reason throw BadRequestException', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);

      await expect(
        runsService.reject(orgId, 'run-1', { rejectionReason: '' }, approverId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('7. Controlled Return-for-Correction Workflow', () => {
    it('should allow returning an APPROVED run back to REVIEW_PENDING with mandatory reason', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'APPROVED',
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.update.mockResolvedValue({
        ...mockRun,
        status: 'REVIEW_PENDING',
        approvedAt: null,
        approvedById: null,
      });

      const result = await runsService.returnForCorrection(
        orgId,
        'run-1',
        {
          reason: 'Late executive bonus approved post initial signoff',
          notes: 'Recalculating with updated bonus scheme',
        },
        approverId,
      );

      expect(result.status).toBe('REVIEW_PENDING');
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'RETURNED_FOR_CORRECTION',
            actorId: approverId,
            comments: expect.stringContaining('Late executive bonus approved post initial signoff'),
          }),
        }),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYROLL_RUN_RETURNED_FOR_CORRECTION',
        }),
      );
    });

    it('should fail if attempting return-for-correction on a run that is not APPROVED', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'DRAFT',
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);

      await expect(
        runsService.returnForCorrection(
          orgId,
          'run-1',
          {
            reason: 'Correction',
          },
          approverId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('8. Locking and Snapshot Freeze Controls', () => {
    it('should lock an APPROVED run and freeze records permanently', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'APPROVED',
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.update.mockResolvedValue({
        ...mockRun,
        status: 'LOCKED',
        lockedAt: new Date(),
        lockedById: approverId,
      });

      const result = await runsService.lock(
        orgId,
        'run-1',
        {
          notes: 'Signed off by Board of Directors',
        },
        approverId,
      );

      expect(result.status).toBe('LOCKED');
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LOCKED',
            actorId: approverId,
          }),
        }),
      );
    });

    it('should prevent edits or recalculation on a LOCKED run', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'LOCKED',
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);

      await expect(runsService.recalculate(orgId, 'run-1', creatorId)).rejects.toThrow(
        BadRequestException,
      );

      await expect(runsService.recalculate(orgId, 'run-1', creatorId)).rejects.toThrow(
        'Current status is LOCKED',
      );

      await expect(
        runsService.updateSnapshot(orgId, 'run-1', 'snap-1', { baseMonthlyGross: 60000 }),
      ).rejects.toThrow('Post-lock edits and recalculations are strictly prohibited');
    });
  });

  describe('9. Controlled Post-Lock Correction Runs', () => {
    it('should create a supplementary correction run linked to locked parent with reason', async () => {
      const mockLockedRun = {
        id: 'run-locked-1',
        organizationId: orgId,
        periodId: 'period-2026-10',
        status: 'LOCKED',
        scope: 'ALL',
        runNumber: 1,
        title: 'October 2026 Regular Run',
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockLockedRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockLockedRun);
      mockPrisma.payrollRun.count.mockResolvedValue(1);
      mockPrisma.payrollRun.create.mockImplementation((args: any) => ({
        id: 'run-corr-2',
        ...args.data,
      }));

      const corrResult = await runsService.createCorrectionRun(
        orgId,
        'run-locked-1',
        {
          correctionReason: 'Statutory minimum wage adjustment retroactive mandate',
          notes: 'Affects 3 employees in production branch',
        },
        creatorId,
      );

      expect(corrResult.status).toBe('DRAFT');
      expect(corrResult.parentRunId).toBe('run-locked-1');
      expect(corrResult.runNumber).toBe(2);
      expect(corrResult.createdById).toBe(creatorId);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYROLL_CORRECTION_RUN_CREATED',
        }),
      );
    });
  });

  describe('10. Payslip Publishing vs Payment Status Separation', () => {
    it('should publish payslips from LOCKED status without changing payment status', async () => {
      const mockLockedRun = {
        id: 'run-locked-1',
        organizationId: orgId,
        status: 'LOCKED',
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockLockedRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockLockedRun);
      mockPrisma.payrollRun.update.mockResolvedValue({
        ...mockLockedRun,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: approverId,
      });

      const pubResult = await runsService.publish(orgId, 'run-locked-1', approverId);

      expect(pubResult.status).toBe('PUBLISHED');
      // Verify snapshot update marks payslipStatus to PUBLISHED, but paymentStatus remains intact
      expect(mockPrisma.employeePayrollSnapshot.updateMany).toHaveBeenCalledWith({
        where: { payrollRunId: 'run-locked-1' },
        data: {
          payslipStatus: 'PUBLISHED',
          publishedAt: expect.any(Date),
        },
      });
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYROLL_RUN_PUBLISHED',
        }),
      );
    });

    it('should prohibit publishing directly from APPROVED status before locking', async () => {
      const mockAppRun = {
        id: 'run-app-1',
        organizationId: orgId,
        status: 'APPROVED',
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockAppRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockAppRun);

      await expect(runsService.publish(orgId, 'run-app-1', approverId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(runsService.publish(orgId, 'run-app-1', approverId)).rejects.toThrow(
        "Run must be 'LOCKED' before publishing payslips",
      );
    });
  });

  describe('11. Concurrency and Race Condition Safety', () => {
    it('should throw ConflictException on concurrent approval attempt', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
        createdById: creatorId,
        calculatedAt: new Date(),
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      // Simulate race condition: inside transaction, findUnique returns status that is already APPROVED
      mockPrisma.payrollRun.findUnique.mockResolvedValue({ status: 'APPROVED' });

      await expect(
        runsService.approve(orgId, 'run-1', {}, approverId, ['PAYROLL_APPROVE']),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('12. Review Summary and Variance Analytics', () => {
    it('should compute department summaries, comparison variances, and movement tracking', async () => {
      const mockRun = {
        id: 'run-1',
        organizationId: orgId,
        periodId: 'period-2026-10',
        period: mockPeriod,
        title: 'October 2026 Run',
        scope: 'ALL',
        status: 'REVIEW_PENDING',
        calculationVersion: 1,
        calculatedAt: new Date(),
        totalEmployees: 2,
        totalGross: new Prisma.Decimal(200000),
        totalDeductions: new Prisma.Decimal(20000),
        totalNet: new Prisma.Decimal(180000),
        totalEmployerCost: new Prisma.Decimal(30000),
        createdById: creatorId,
        createdBy: { id: creatorId, displayName: 'Alice HR' },
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollRun.findUnique.mockResolvedValue(mockRun);

      mockPrisma.employeePayrollSnapshot.findMany.mockResolvedValue([
        {
          departmentName: 'Engineering',
          earnedGross: new Prisma.Decimal(120000),
          totalDeductions: new Prisma.Decimal(12000),
          netSalary: new Prisma.Decimal(108000),
          calculationInputSnapshot: { totalEmployerContributions: 18000 },
        },
        {
          departmentName: 'Sales',
          earnedGross: new Prisma.Decimal(80000),
          totalDeductions: new Prisma.Decimal(8000),
          netSalary: new Prisma.Decimal(72000),
          calculationInputSnapshot: { totalEmployerContributions: 12000 },
        },
      ]);

      const reviewSummary = await runsService.getReviewSummary(orgId, 'run-1', creatorId);

      expect(reviewSummary.runId).toBe('run-1');
      expect(reviewSummary.totals.totalGross).toBe(200000);
      expect(reviewSummary.totals.totalNet).toBe(180000);
      expect(reviewSummary.totals.totalEmployerCost).toBe(30000);
      expect(reviewSummary.departments).toHaveLength(2);
      expect(reviewSummary.departments[0].departmentName).toBe('Engineering');
      expect(reviewSummary.departments[0].employeeCount).toBe(1);
      expect(reviewSummary.departments[0].totalNet).toBe(108000);
      expect(reviewSummary.departments[0].totalEmployerCost).toBe(18000);

      // Verify separation of duties check flag for creator
      expect(reviewSummary.separationOfDuties.selfApprovalBlocked).toBe(true);
      expect(reviewSummary.separationOfDuties.canCurrentUserApprove).toBe(false);
    });
  });
});
