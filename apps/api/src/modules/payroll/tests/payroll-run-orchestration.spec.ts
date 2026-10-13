import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PayrollPeriodsService } from '../services/payroll-periods.service';
import { PayrollRunsService } from '../services/payroll-runs.service';
import { PayrollCalculationEngineService } from '../services/payroll-calculation-engine.service';
import { Prisma } from '@prisma/client';

describe('Phase 11.4: Payroll Periods and Payroll Run Orchestration Tests', () => {
  let periodsService: PayrollPeriodsService;
  let runsService: PayrollRunsService;
  let mockPrisma: any;
  let mockAudit: any;

  const orgId = 'org-test-1';
  const actorId = 'user-admin-1';

  beforeEach(() => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      payrollPeriod: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      payrollRun: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      payrollApprovalHistory: {
        create: jest.fn(),
      },
      employee: {
        findMany: jest.fn(),
      },
      employeeCompensation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      payrollAdjustment: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      employeePayrollSnapshot: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(mockPrisma);
        }
        return Promise.all(cb);
      }),
    };

    const mockInputs = {
      getEmployeeWorkSummary: jest
        .fn()
        .mockImplementation((orgId: string, empId: string, p: any) => ({
          employeeId: empId,
          employeeCode: 'EMP-001',
          periodId: p.id,
          startDate: p.startDate.toISOString(),
          endDate: p.endDate.toISOString(),
          totalCalendarDays: p.totalDays,
          eligibleDaysInPeriod: p.totalDays,
          expectedWorkdays: p.totalDays,
          recognizedWorkdays: p.totalDays,
          officeWorkedDays: p.totalDays,
          wfhDays: 0,
          officialVisitDays: 0,
          approvedPaidLeaveDays: 0,
          approvedUnpaidLeaveDays: 0,
          holidays: 0,
          weeklyOffs: 0,
          halfDays: 0,
          absentDays: 0,
          unresolvedExceptionCount: 0,
          missingAttendanceDays: 0,
          paidDays: p.totalDays,
          lopDays: 0,
          sources: { sourceHash: 'mock-hash' },
          warnings: [],
          isException: false,
          exceptionReason: null,
          treatment: 'STANDARD_ATTENDANCE',
        })),
      detectLateSourceChanges: jest.fn().mockResolvedValue({ totalLateChanges: 0, changes: [] }),
      getPayrollAttendanceReconciliation: jest.fn().mockResolvedValue({ items: [] }),
    };

    const mockValidation = {
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
      getExceptions: jest
        .fn()
        .mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
      resolveException: jest.fn(),
    };

    periodsService = new PayrollPeriodsService(mockPrisma, mockAudit);
    runsService = new PayrollRunsService(
      mockPrisma,
      mockAudit,
      new PayrollCalculationEngineService(),
      mockInputs as any,
      mockValidation as any,
    );
  });

  describe('Payroll Period Management', () => {
    it('should create a new payroll period with computed totalDays and initial OPEN status', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue(null);
      mockPrisma.payrollPeriod.create.mockImplementation((args: any) => ({
        id: 'period-2026-10',
        ...args.data,
      }));

      const result = await periodsService.create(
        orgId,
        {
          year: 2026,
          month: 10,
          startDate: '2026-10-01T00:00:00.000Z',
          endDate: '2026-10-31T23:59:59.999Z',
          cutoffDate: '2026-10-25T23:59:59.999Z',
          payoutDate: '2026-11-01T00:00:00.000Z',
        },
        actorId,
      );

      expect(result.id).toBe('period-2026-10');
      expect(result.year).toBe(2026);
      expect(result.month).toBe(10);
      expect(result.totalDays).toBe(31);
      expect(result.status).toBe('OPEN');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYROLL_PERIOD_CREATED',
          entity: 'PayrollPeriod',
        }),
      );
    });

    it('should reject period creation when startDate is on or after endDate', async () => {
      await expect(
        periodsService.create(
          orgId,
          {
            year: 2026,
            month: 10,
            startDate: '2026-10-31T00:00:00.000Z',
            endDate: '2026-10-01T00:00:00.000Z',
          },
          actorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate period creation for the same year and month', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({ id: 'existing-period' });

      await expect(
        periodsService.create(
          orgId,
          {
            year: 2026,
            month: 10,
            startDate: '2026-10-01T00:00:00.000Z',
            endDate: '2026-10-31T23:59:59.999Z',
          },
          actorId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should prevent closing a period if active unfinalized runs exist', async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({
        id: 'period-1',
        organizationId: orgId,
        status: 'OPEN',
      });
      mockPrisma.payrollRun.findMany.mockResolvedValue([
        { id: 'run-1', title: 'October Regular', status: 'REVIEW_PENDING' },
      ]);

      await expect(periodsService.close(orgId, 'period-1', actorId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow closing a period when all runs are locked, published or cancelled', async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({
        id: 'period-1',
        organizationId: orgId,
        status: 'OPEN',
      });
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);
      mockPrisma.payrollPeriod.update.mockResolvedValue({
        id: 'period-1',
        status: 'CLOSED',
      });

      const res = await periodsService.close(orgId, 'period-1', actorId);
      expect(res.status).toBe('CLOSED');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYROLL_PERIOD_CLOSED' }),
      );
    });
  });

  describe('Payroll Run Creation & Duplicate Prevention', () => {
    it('should prevent simultaneous duplicate runs for the same period and scope', async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({
        id: 'period-1',
        organizationId: orgId,
        status: 'OPEN',
      });
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'existing-run',
        title: 'Draft Run',
        status: 'DRAFT',
      });

      await expect(
        runsService.create(
          orgId,
          { periodId: 'period-1', title: 'New Run', scope: 'ALL' },
          actorId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully create a new run in DRAFT status with initial history record', async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({
        id: 'period-1',
        organizationId: orgId,
        status: 'OPEN',
      });
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(null) // no existing active run
        .mockResolvedValueOnce(null); // highest run number check
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: 'emp-1', employeeCode: 'E001', displayName: 'Alice' },
        { id: 'emp-2', employeeCode: 'E002', displayName: 'Bob' },
      ]);
      mockPrisma.payrollRun.create.mockImplementation((args: any) => ({
        id: 'run-new',
        ...args.data,
      }));

      const run = await runsService.create(
        orgId,
        { periodId: 'period-1', title: 'October Payroll', scope: 'ALL' },
        actorId,
      );

      expect(run.id).toBe('run-new');
      expect(run.status).toBe('DRAFT');
      expect(run.runNumber).toBe(1);
      expect(run.totalEmployees).toBe(2);
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATED',
            newStatus: 'DRAFT',
          }),
        }),
      );
    });
  });

  describe('Server-Side State Machine & Calculation Orchestration', () => {
    const mockPeriod = {
      id: 'period-1',
      year: 2026,
      month: 10,
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
      totalDays: 31,
    };

    it('should reject calculation if run is in immutable status (APPROVED, LOCKED, or PUBLISHED)', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-locked',
        organizationId: orgId,
        status: 'LOCKED',
        period: mockPeriod,
      });

      await expect(runsService.calculate(orgId, 'run-locked', actorId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should orchestrate calculation: transition to CALCULATING then REVIEW_PENDING with snapshots and exception count', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        organizationId: orgId,
        status: 'DRAFT',
        calculationVersion: 1,
        runNumber: 1,
        scope: 'ALL',
        period: mockPeriod,
      });

      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          employeeCode: 'E001',
          displayName: 'Alice Engineer',
          employment: { department: { name: 'Engineering' } },
        },
        {
          id: 'emp-2',
          employeeCode: 'E002',
          displayName: 'Bob Unassigned',
          employment: { department: { name: 'Sales' } },
        },
      ]);

      // emp-1 has active compensation; emp-2 has none (triggers exception)
      const emp1Comp = {
        id: 'comp-1',
        employeeId: 'emp-1',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
        ctcAnnual: new Prisma.Decimal(1200000),
        grossMonthly: new Prisma.Decimal(100000),
        items: [
          {
            monthlyAmount: new Prisma.Decimal(60000),
            component: {
              id: 'c1',
              code: 'BASIC',
              name: 'Basic',
              type: 'EARNING',
              calculationType: 'FLAT_AMOUNT',
              displayOrder: 1,
            },
          },
          {
            monthlyAmount: new Prisma.Decimal(40000),
            component: {
              id: 'c2',
              code: 'HRA',
              name: 'HRA',
              type: 'EARNING',
              calculationType: 'FLAT_AMOUNT',
              displayOrder: 2,
            },
          },
          {
            monthlyAmount: new Prisma.Decimal(5000),
            component: {
              id: 'c3',
              code: 'PF',
              name: 'Provident Fund',
              type: 'DEDUCTION',
              calculationType: 'FLAT_AMOUNT',
              displayOrder: 3,
            },
          },
        ],
        structure: { currency: 'INR' },
      };

      mockPrisma.employeeCompensation.findMany.mockResolvedValue([emp1Comp]);
      mockPrisma.employeeCompensation.findFirst
        .mockResolvedValueOnce(emp1Comp)
        .mockResolvedValueOnce(null);

      mockPrisma.payrollRun.update.mockImplementation((args: any) => ({
        id: 'run-1',
        ...args.data,
      }));

      const calculatedRun = await runsService.calculate(orgId, 'run-1', actorId);

      expect(calculatedRun.status).toBe('REVIEW_PENDING');
      expect(calculatedRun.totalEmployees).toBe(2);
      expect(calculatedRun.exceptionCount).toBe(1); // emp-2 flagged as exception
      expect(mockPrisma.employeePayrollSnapshot.create).toHaveBeenCalledTimes(2);

      // Verify approval history tracked transition
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CALCULATED',
            previousStatus: 'CALCULATING',
            newStatus: 'REVIEW_PENDING',
          }),
        }),
      );
    });

    it('should safely recover on calculation error by rolling back status to DRAFT with error log', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        organizationId: orgId,
        status: 'DRAFT',
        calculationVersion: 1,
        runNumber: 1,
        scope: 'ALL',
        period: mockPeriod,
      });

      // Simulate unexpected database crash during employee resolution
      mockPrisma.employee.findMany.mockRejectedValue(new Error('Database connectivity lost'));

      await expect(runsService.calculate(orgId, 'run-1', actorId)).rejects.toThrow(
        BadRequestException,
      );

      // Verify rollback to DRAFT for safe retry
      expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({
            status: 'DRAFT',
            calculationLog: expect.objectContaining({
              error: 'Database connectivity lost',
            }),
          }),
        }),
      );
    });

    it('should allow approving run only from REVIEW_PENDING status', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
      });
      mockPrisma.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'APPROVED',
      });

      const approved = await runsService.approve(
        orgId,
        'run-1',
        { comments: 'Approved by CFO' },
        actorId,
      );

      expect(approved.status).toBe('APPROVED');
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'APPROVED',
            previousStatus: 'REVIEW_PENDING',
            newStatus: 'APPROVED',
          }),
        }),
      );
    });

    it('should reject run back to DRAFT with mandatory rejection reason', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        organizationId: orgId,
        status: 'REVIEW_PENDING',
      });
      mockPrisma.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'DRAFT',
      });

      const rejected = await runsService.reject(
        orgId,
        'run-1',
        { rejectionReason: 'Missing attendance data for Sales' },
        actorId,
      );

      expect(rejected.status).toBe('DRAFT');
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REJECTED',
            newStatus: 'DRAFT',
            comments: 'Missing attendance data for Sales',
          }),
        }),
      );
    });

    it('should lock run from APPROVED status, making calculation immutable', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        organizationId: orgId,
        status: 'APPROVED',
      });
      mockPrisma.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'LOCKED',
        lockedAt: new Date(),
      });

      const locked = await runsService.lock(
        orgId,
        'run-1',
        { notes: 'Month-end finalized' },
        actorId,
      );

      expect(locked.status).toBe('LOCKED');
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LOCKED',
            previousStatus: 'APPROVED',
            newStatus: 'LOCKED',
          }),
        }),
      );
    });

    it('should publish payslips from LOCKED status and update snapshot payslipStatus without triggering payment', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        organizationId: orgId,
        status: 'LOCKED',
      });
      mockPrisma.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'PUBLISHED',
      });

      const published = await runsService.publish(orgId, 'run-1', actorId);

      expect(published.status).toBe('PUBLISHED');
      expect(mockPrisma.employeePayrollSnapshot.updateMany).toHaveBeenCalledWith({
        where: { payrollRunId: 'run-1' },
        data: expect.objectContaining({
          payslipStatus: 'PUBLISHED',
        }),
      });
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PUBLISHED',
            newStatus: 'PUBLISHED',
          }),
        }),
      );
    });

    it('should disallow cancelling a LOCKED or PUBLISHED run directly', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        organizationId: orgId,
        status: 'LOCKED',
      });

      await expect(runsService.cancel(orgId, 'run-1', 'Need correction', actorId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should support authorized post-lock correction run linking to parent run with reason', async () => {
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce({
          id: 'parent-run',
          organizationId: orgId,
          periodId: 'period-1',
          runNumber: 1,
          scope: 'ALL',
          status: 'LOCKED',
          title: 'October Regular',
          totalEmployees: 25,
        })
        .mockResolvedValueOnce({ runNumber: 1 }); // highest runNumber lookup

      mockPrisma.payrollRun.create.mockImplementation((args: any) => ({
        id: 'correction-run-2',
        ...args.data,
      }));

      const correctionRun = await runsService.createCorrectionRun(
        orgId,
        'parent-run',
        { correctionReason: 'Tax deduction recalculation for executive staff' },
        actorId,
      );

      expect(correctionRun.id).toBe('correction-run-2');
      expect(correctionRun.parentRunId).toBe('parent-run');
      expect(correctionRun.runNumber).toBe(2);
      expect(correctionRun.status).toBe('DRAFT');
      expect(correctionRun.correctionReason).toBe(
        'Tax deduction recalculation for executive staff',
      );
      expect(mockPrisma.payrollApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CORRECTION_CREATED',
            newStatus: 'DRAFT',
          }),
        }),
      );
    });
  });
});
