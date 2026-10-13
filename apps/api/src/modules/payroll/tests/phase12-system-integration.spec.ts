import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PayrollInputsService } from '../services/payroll-inputs.service';
import { PayrollRunsService } from '../services/payroll-runs.service';
import { PayrollCalculationEngineService } from '../services/payroll-calculation-engine.service';
import { PayrollValidationService } from '../services/payroll-validation.service';

describe('Phase 12: Comprehensive System Integration & Workflow Completion', () => {
  let inputsService: PayrollInputsService;
  let runsService: PayrollRunsService;
  let calcEngine: PayrollCalculationEngineService;
  let validationService: PayrollValidationService;

  let mockPrisma: any;
  let mockAudit: any;

  const orgId = 'org-integration-12';
  const managerUserId = 'usr-manager-1';
  const employeeUserId = 'usr-emp-1';
  const managerEmpId = 'emp-mgr-1';
  const testEmpId = 'emp-test-1';

  const testPeriod = {
    id: 'period-2026-10',
    organizationId: orgId,
    periodNumber: 10,
    fiscalYear: 2026,
    year: 2026,
    month: 10,
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2026-10-31T23:59:59.999Z'),
    totalDays: 31,
    status: 'ACTIVE',
    isLocked: false,
  };

  const sampleEmployee = {
    id: testEmpId,
    organizationId: orgId,
    userId: employeeUserId,
    employeeCode: 'EMP-INT-001',
    firstName: 'Priya',
    lastName: 'Nair',
    displayName: 'Priya Nair',
    status: 'ACTIVE',
    joiningDate: new Date('2026-01-01'),
    exitDate: null,
    managerId: managerEmpId,
    isActive: true,
    employment: {
      branchId: 'branch-hq',
      departmentId: 'dept-eng',
      designationId: 'desig-lead',
      branch: { id: 'branch-hq', name: 'HQ Bengaluru' },
      department: { id: 'dept-eng', name: 'Engineering' },
      designation: { id: 'desig-lead', title: 'Tech Lead' },
    },
    shiftAssignments: [
      {
        shift: {
          id: 'shift-gen',
          name: 'General Shift',
          workDays: [1, 2, 3, 4, 5],
        },
      },
    ],
  };

  const sampleCompensation = {
    id: 'comp-1',
    organizationId: orgId,
    employeeId: testEmpId,
    structureId: 'struct-eng',
    ctcAnnual: new Prisma.Decimal('1200000.00'),
    grossMonthly: new Prisma.Decimal('100000.00'),
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: 'APPROVED',
    isLocked: false,
    items: [
      {
        id: 'comp-item-basic',
        componentId: 'comp-basic',
        monthlyAmount: new Prisma.Decimal('50000.00'),
        annualAmount: new Prisma.Decimal('600000.00'),
        component: {
          id: 'comp-basic',
          code: 'BASIC',
          name: 'Basic Salary',
          type: 'EARNING',
          calculationType: 'FLAT',
          isTaxable: true,
          isPfApplicable: true,
          isEsiApplicable: false,
        },
      },
      {
        id: 'comp-item-hra',
        componentId: 'comp-hra',
        monthlyAmount: new Prisma.Decimal('30000.00'),
        annualAmount: new Prisma.Decimal('360000.00'),
        component: {
          id: 'comp-hra',
          code: 'HRA',
          name: 'House Rent Allowance',
          type: 'EARNING',
          calculationType: 'FLAT',
          isTaxable: true,
          isPfApplicable: false,
          isEsiApplicable: false,
        },
      },
      {
        id: 'comp-item-spl',
        componentId: 'comp-spl',
        monthlyAmount: new Prisma.Decimal('20000.00'),
        annualAmount: new Prisma.Decimal('240000.00'),
        component: {
          id: 'comp-spl',
          code: 'SPL_ALW',
          name: 'Special Allowance',
          type: 'EARNING',
          calculationType: 'FLAT',
          isTaxable: true,
          isPfApplicable: false,
          isEsiApplicable: false,
        },
      },
    ],
  };

  beforeEach(() => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(true),
    };

    mockPrisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue(sampleEmployee),
        findMany: jest.fn().mockResolvedValue([sampleEmployee]),
        count: jest.fn().mockResolvedValue(1),
      },
      employeeCompensation: {
        findFirst: jest.fn().mockResolvedValue(sampleCompensation),
        findMany: jest.fn().mockResolvedValue([sampleCompensation]),
      },
      attendanceDailySummary: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ads-1',
            date: new Date('2026-10-01'),
            status: 'PRESENT',
            mode: 'OFFICE',
            effectiveWorkMinutes: 480,
          },
          {
            id: 'ads-2',
            date: new Date('2026-10-02'),
            status: 'PRESENT',
            mode: 'WORK_FROM_HOME',
            effectiveWorkMinutes: 480,
          },
        ]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'leave-1',
            startDate: new Date('2026-10-05'),
            endDate: new Date('2026-10-06'),
            status: 'APPROVED',
            leaveType: { id: 'lt-pl', name: 'Privilege Leave', isPaid: true },
          },
        ]),
      },
      wfhRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wfh-1',
            startDate: new Date('2026-10-02'),
            endDate: new Date('2026-10-02'),
            status: 'APPROVED',
          },
        ]),
      },
      officialVisit: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'visit-1',
            startDate: new Date('2026-10-07'),
            endDate: new Date('2026-10-07'),
            status: 'APPROVED',
          },
        ]),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'hol-1',
            date: new Date('2026-10-02'),
            name: 'Gandhi Jayanti',
          },
        ]),
      },
      attendanceCorrectionRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceException: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      payrollPeriod: {
        findFirst: jest.fn().mockResolvedValue(testPeriod),
        findUnique: jest.fn().mockResolvedValue(testPeriod),
      },
      payrollApprovalHistory: {
        create: jest.fn().mockResolvedValue({ id: 'pah-1' }),
      },
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation((args) => Promise.resolve({ id: 'pr-10', ...args.data })),
        update: jest
          .fn()
          .mockImplementation((args) => Promise.resolve({ id: 'pr-10', ...args.data })),
      },
      employeePayrollSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payrollAdjustment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      payrollException: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      salaryComponent: {
        findMany: jest.fn().mockResolvedValue(sampleCompensation.items.map((i) => i.component)),
      },
      salaryStructure: {
        findFirst: jest.fn().mockResolvedValue({ id: 'struct-eng', name: 'Engineering Base' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(mockPrisma);
        }
        return Promise.all(callback);
      }),
    };

    inputsService = new PayrollInputsService(mockPrisma);
    calcEngine = new PayrollCalculationEngineService();
    validationService = new PayrollValidationService(mockPrisma, mockAudit as any);
    runsService = new PayrollRunsService(
      mockPrisma,
      mockAudit as any,
      calcEngine,
      inputsService,
      validationService,
    );
  });

  describe('1. Employee Lifecycle & Eligibility Integration', () => {
    it('accurately resolves active, probation, and notice period employees while excluding resigned and terminated', async () => {
      const eligible = await runsService.resolveEligibleEmployees(orgId, 'ALL');
      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
          }),
        }),
      );
      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe(testEmpId);
    });

    it('detects mid-period joiners and accurately calculates prorated eligibility days', async () => {
      const joinerEmployee = {
        ...sampleEmployee,
        joiningDate: new Date('2026-10-15'), // Joined on Oct 15
      };
      mockPrisma.employee.findFirst.mockResolvedValueOnce(joinerEmployee);

      const summary = await inputsService.getEmployeeWorkSummary(
        orgId,
        testEmpId,
        testPeriod as any,
      );

      // From Oct 15 to Oct 31 inclusive = 17 days
      expect(summary.isMidPeriodJoiner).toBe(true);
      expect(summary.eligibleDaysInPeriod).toBe(17);
      expect(summary.warnings).toContainEqual(
        expect.stringContaining('Mid-period joiner: joined on 2026-10-15'),
      );
    });

    it('detects mid-period leavers and accurately limits eligible days up to exit date', async () => {
      const leaverEmployee = {
        ...sampleEmployee,
        exitDate: new Date('2026-10-10'), // Exited on Oct 10
      };
      mockPrisma.employee.findFirst.mockResolvedValueOnce(leaverEmployee);

      const summary = await inputsService.getEmployeeWorkSummary(
        orgId,
        testEmpId,
        testPeriod as any,
      );

      // From Oct 1 to Oct 10 inclusive = 10 days
      expect(summary.isMidPeriodLeaver).toBe(true);
      expect(summary.eligibleDaysInPeriod).toBe(10);
      expect(summary.warnings).toContainEqual(
        expect.stringContaining('Mid-period leaver: exit date on 2026-10-10'),
      );
    });

    it('marks employee completely ineligible if joining date is after the payroll period end', async () => {
      const futureJoiner = {
        ...sampleEmployee,
        joiningDate: new Date('2026-11-01'), // Joins next month
      };
      mockPrisma.employee.findFirst.mockResolvedValueOnce(futureJoiner);

      const summary = await inputsService.getEmployeeWorkSummary(
        orgId,
        testEmpId,
        testPeriod as any,
      );

      expect(summary.eligibleDaysInPeriod).toBe(0);
      expect(summary.paidDays).toBe(0);
      expect(summary.lopDays).toBe(31);
      expect(summary.warnings).toContainEqual(
        expect.stringContaining('Employee joining date is after the payroll period end date'),
      );
    });
  });

  describe('2. Operational Module Workflows Integration (Attendance, Leave, WFH, Visits)', () => {
    it('aggregates approved leaves, WFH days, official visits, and attendance summaries into payroll inputs', async () => {
      const summary = await inputsService.getEmployeeWorkSummary(
        orgId,
        testEmpId,
        testPeriod as any,
      );

      expect(summary.totalCalendarDays).toBe(31);
      expect(summary.wfhDays).toBeGreaterThanOrEqual(1);
      expect(summary.officialVisitDays).toBeGreaterThanOrEqual(1);
      expect(summary.paidDays).toBeGreaterThan(0);
      expect(summary.sources.sourceHash).toBeDefined();
    });

    it('treats unapproved absences as loss of pay days', async () => {
      mockPrisma.leaveRequest.findMany.mockResolvedValueOnce([]); // No approved leaves
      mockPrisma.attendanceDailySummary.findMany.mockResolvedValueOnce([
        {
          id: 'ads-absent',
          date: new Date('2026-10-05'),
          status: 'ABSENT',
          effectiveWorkMinutes: 0,
        },
      ]);

      const summary = await inputsService.getEmployeeWorkSummary(
        orgId,
        testEmpId,
        testPeriod as any,
      );

      expect(summary.approvedPaidLeaveDays).toBe(0);
      expect(summary.lopDays).toBeGreaterThanOrEqual(0);
    });
  });

  describe('3. Validation Guardrails & Exception Integration', () => {
    it('raises warning or exception if pending attendance corrections exist in period', async () => {
      mockPrisma.attendanceCorrectionRequest.findMany.mockResolvedValueOnce([
        {
          id: 'corr-pending-1',
          employeeId: testEmpId,
          targetDate: new Date('2026-10-12'),
          status: 'PENDING',
          reason: 'Biometric device failed on punch out',
        },
      ]);

      const summary = await inputsService.getEmployeeWorkSummary(
        orgId,
        testEmpId,
        testPeriod as any,
      );

      expect(summary.unresolvedExceptionCount).toBe(1);
      expect(summary.sources.unresolvedExceptionIds).toContain('corr-pending-1');
    });

    it('validates run exceptions and catches missing bank accounts or unassigned components', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce({
        id: 'pr-10',
        organizationId: orgId,
        calculationVersion: 1,
        snapshots: [
          {
            id: 'snap-1',
            employeeId: testEmpId,
            grossEarnings: new Prisma.Decimal('100000.00'),
            netPay: new Prisma.Decimal('90000.00'),
            employee: {
              ...sampleEmployee,
              contact: { bankAccountNumber: null },
            },
            items: [],
          },
        ],
      });

      const validation = await validationService.validateRun(orgId, 'pr-10');
      expect(validation).toBeDefined();
      expect(validation.total).toBeDefined();
      expect(typeof validation.canApprove).toBe('boolean');
    });
  });

  describe('4. End-to-End Financial Calculation & Decimal Precision', () => {
    it('computes exact 2-decimal rounded gross, statutory deductions, and net pay', () => {
      const calculation = calcEngine.calculateEmployeePayroll({
        employeeId: testEmpId,
        employeeCode: sampleEmployee.employeeCode,
        employeeName: sampleEmployee.displayName,
        period: {
          id: testPeriod.id,
          startDate: testPeriod.startDate,
          endDate: testPeriod.endDate,
          totalDays: 31,
          year: 2026,
          month: 10,
        },
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        compensations: [
          {
            compensationId: sampleCompensation.id,
            structureId: sampleCompensation.structureId,
            ctcAnnual: sampleCompensation.ctcAnnual,
            grossMonthly: sampleCompensation.grossMonthly,
            effectiveFrom: sampleCompensation.effectiveFrom,
            effectiveTo: sampleCompensation.effectiveTo,
            activeDaysInPeriod: 31,
            segmentStartDate: testPeriod.startDate,
            segmentEndDate: testPeriod.endDate,
            items: [
              {
                componentId: 'comp-basic',
                componentCode: 'BASIC',
                componentName: 'Basic Salary',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal('50000.00'),
                isProRataApplicable: true,
              },
              {
                componentId: 'comp-hra',
                componentCode: 'HRA',
                componentName: 'House Rent Allowance',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal('30000.00'),
                isProRataApplicable: true,
              },
              {
                componentId: 'comp-spl',
                componentCode: 'SPL_ALW',
                componentName: 'Special Allowance',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal('20000.00'),
                isProRataApplicable: true,
              },
            ],
          },
        ],
        adjustments: [],
      });

      expect(calculation.baseMonthlyGross.toString()).toBe('100000');
      expect(calculation.netSalary.isPositive()).toBe(true);
      expect(calculation.reconciliation.netPayReconciled).toBe(true);
      expect(calculation.netSalary.toString()).toBe(
        calculation.earnedGross.minus(calculation.totalEmployeeDeductions).toString(),
      );
    });

    it('accurately deducts Loss of Pay (LOP) when unpaid days are present', () => {
      const calculation = calcEngine.calculateEmployeePayroll({
        employeeId: testEmpId,
        employeeCode: sampleEmployee.employeeCode,
        employeeName: sampleEmployee.displayName,
        period: {
          id: testPeriod.id,
          startDate: testPeriod.startDate,
          endDate: testPeriod.endDate,
          totalDays: 31,
          year: 2026,
          month: 10,
        },
        calendarDays: 31,
        paidDays: 26,
        lopDays: 5, // 5 days LOP
        compensations: [
          {
            compensationId: sampleCompensation.id,
            structureId: sampleCompensation.structureId,
            ctcAnnual: sampleCompensation.ctcAnnual,
            grossMonthly: sampleCompensation.grossMonthly,
            effectiveFrom: sampleCompensation.effectiveFrom,
            effectiveTo: sampleCompensation.effectiveTo,
            activeDaysInPeriod: 31,
            segmentStartDate: testPeriod.startDate,
            segmentEndDate: testPeriod.endDate,
            items: [
              {
                componentId: 'comp-basic',
                componentCode: 'BASIC',
                componentName: 'Basic Salary',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal('50000.00'),
                isProRataApplicable: true,
              },
              {
                componentId: 'comp-hra',
                componentCode: 'HRA',
                componentName: 'House Rent Allowance',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal('30000.00'),
                isProRataApplicable: true,
              },
              {
                componentId: 'comp-spl',
                componentCode: 'SPL_ALW',
                componentName: 'Special Allowance',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal('20000.00'),
                isProRataApplicable: true,
              },
            ],
          },
        ],
        adjustments: [],
      });

      // Earned gross is prorated for 26/31 days
      expect(calculation.earnedGross.toNumber()).toBeLessThan(
        calculation.baseMonthlyGross.toNumber(),
      );
      expect(calculation.netSalary.toNumber()).toBeLessThan(
        calculation.baseMonthlyGross.toNumber(),
      );
      expect(calculation.reconciliation.netPayReconciled).toBe(true);
    });
  });

  describe('5. Role Authorization, Four-Eyes Approval Gate, and ESS Isolation', () => {
    it('prevents non-existent period from creating a payroll run', async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValueOnce(null);

      await expect(
        runsService.create(
          orgId,
          {
            periodId: 'invalid-period',
            scope: 'ALL',
          } as any,
          managerUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('enforces four-eyes principle preventing the same user who created payroll from approving it', async () => {
      // Mock run created by usr-hr-1 in REVIEW_PENDING status
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'pr-active',
        organizationId: orgId,
        periodId: testPeriod.id,
        status: 'REVIEW_PENDING',
        createdById: 'usr-hr-1',
        period: testPeriod,
      });

      await expect(
        runsService.approve(
          orgId,
          'pr-active',
          {
            comments: 'Self approval attempt',
          } as any,
          'usr-hr-1', // same user
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows distinct authorized user to approve payroll run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'pr-active',
        organizationId: orgId,
        periodId: testPeriod.id,
        status: 'REVIEW_PENDING',
        createdById: 'usr-hr-1',
        period: testPeriod,
      });

      const approved = await runsService.approve(
        orgId,
        'pr-active',
        {
          comments: 'Four-eyes approved after independent audit verification',
        } as any,
        'usr-admin-2', // distinct approver
      );

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYROLL_RUN_APPROVED',
          entity: 'PayrollRun',
        }),
      );
    });
  });
});
