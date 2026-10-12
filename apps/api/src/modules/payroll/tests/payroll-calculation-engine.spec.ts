import { BadRequestException } from '@nestjs/common';
import {
  EmployeeCalculationInput,
  PayrollCalculationEngineService,
} from '../services/payroll-calculation-engine.service';
import { Prisma } from '@prisma/client';

describe('Phase 11.5: Payroll Calculation Engine Unit Tests', () => {
  let engine: PayrollCalculationEngineService;

  const defaultPeriod = {
    id: 'period-2026-10',
    year: 2026,
    month: 10,
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2026-10-31T23:59:59.999Z'),
    totalDays: 31,
  };

  beforeEach(() => {
    engine = new PayrollCalculationEngineService();
  });

  describe('1. Input Validation & Boundary Enforcement', () => {
    it('should reject calculation when employee identifiers are missing', () => {
      const input: any = {
        employeeId: '',
        employeeCode: '',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
      };

      expect(() => engine.calculateEmployeePayroll(input)).toThrow(BadRequestException);
    });

    it('should reject negative, non-finite, or invalid calendar/paid days', () => {
      const baseInput: EmployeeCalculationInput = {
        employeeId: 'emp-1',
        employeeCode: 'E001',
        employeeName: 'John Doe',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: -5, // Invalid negative paid days
        lopDays: 0,
        compensations: [],
      };

      expect(() => engine.calculateEmployeePayroll(baseInput)).toThrow(BadRequestException);

      // Paid days exceeding calendar days
      baseInput.paidDays = 35;
      expect(() => engine.calculateEmployeePayroll(baseInput)).toThrow(BadRequestException);

      // Non-finite / NaN days
      baseInput.paidDays = NaN;
      expect(() => engine.calculateEmployeePayroll(baseInput)).toThrow(BadRequestException);
    });

    it('should reject non-finite or invalid adjustment amounts', () => {
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-1',
        employeeCode: 'E001',
        employeeName: 'John Doe',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        compensations: [
          {
            compensationId: 'comp-1',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(1200000),
            grossMonthly: new Prisma.Decimal(100000),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [],
          },
        ],
        adjustments: [
          {
            adjustmentId: 'adj-1',
            type: 'BONUS',
            title: 'Q3 Bonus',
            amount: new Prisma.Decimal(NaN), // Invalid NaN
          },
        ],
      };

      expect(() => engine.calculateEmployeePayroll(input)).toThrow(BadRequestException);
    });

    it('should flag exception with explicit reason when compensation assignment is missing rather than guessing or silently zeroing', () => {
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-unassigned',
        employeeCode: 'E099',
        employeeName: 'Unassigned Staff',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        compensations: [], // EMPTY: No approved salary structure
      };

      const result = engine.calculateEmployeePayroll(input);

      expect(result.isException).toBe(true);
      expect(result.exceptionReason).toBe(
        'No approved compensation assignment active for this period',
      );
      expect(result.earnedGross.toString()).toBe('0');
      expect(result.netSalary.toString()).toBe('0');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('2. Standard Components, Dependencies & Formula Resolution', () => {
    it('should resolve Flat Amount, Percentage of Basic, and Percentage of Gross accurately', () => {
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-1',
        employeeCode: 'E001',
        employeeName: 'Alice Johnson',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        compensations: [
          {
            compensationId: 'comp-1',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(1200000),
            grossMonthly: new Prisma.Decimal(100000),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic Salary',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(50000),
                displayOrder: 1,
              },
              {
                componentCode: 'HRA',
                componentName: 'House Rent Allowance',
                type: 'EARNING',
                calculationType: 'PERCENTAGE_OF_BASIC',
                amountOrPercentage: new Prisma.Decimal(40), // 40% of 50000 = 20000
                displayOrder: 2,
              },
              {
                componentCode: 'SPECIAL',
                componentName: 'Special Allowance',
                type: 'EARNING',
                calculationType: 'PERCENTAGE_OF_GROSS',
                amountOrPercentage: new Prisma.Decimal(30), // 30% of 100000 = 30000
                displayOrder: 3,
              },
              {
                componentCode: 'PF_EMP',
                componentName: 'Provident Fund (Employee)',
                type: 'DEDUCTION',
                calculationType: 'PERCENTAGE_OF_BASIC',
                amountOrPercentage: new Prisma.Decimal(12), // 12% of 50000 = 6000
                affectsNetSalary: true,
                displayOrder: 4,
              },
            ],
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);

      // Verify itemized amounts
      const basic = result.items.find((i) => i.componentCode === 'BASIC')!;
      const hra = result.items.find((i) => i.componentCode === 'HRA')!;
      const special = result.items.find((i) => i.componentCode === 'SPECIAL')!;
      const pf = result.items.find((i) => i.componentCode === 'PF_EMP')!;

      expect(basic.earnedAmount.toString()).toBe('50000');
      expect(hra.earnedAmount.toString()).toBe('20000');
      expect(special.earnedAmount.toString()).toBe('30000');
      expect(pf.earnedAmount.toString()).toBe('6000');

      // Gross = 50000 + 20000 + 30000 = 100000
      expect(result.earnedGross.toString()).toBe('100000');
      // Deductions = 6000
      expect(result.totalEmployeeDeductions.toString()).toBe('6000');
      // Net = 100000 - 6000 = 94000
      expect(result.netSalary.toString()).toBe('94000');
      expect(result.reconciliation.netPayReconciled).toBe(true);
    });

    it('should safely evaluate zero-eval mathematical formula expressions with decimal precision', () => {
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-2',
        employeeCode: 'E002',
        employeeName: 'Bob Smith',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        compensations: [
          {
            compensationId: 'comp-2',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(1200000),
            grossMonthly: new Prisma.Decimal(100000),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(40000),
                displayOrder: 1,
              },
              {
                componentCode: 'DA',
                componentName: 'Dearness Allowance',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(10000),
                displayOrder: 2,
              },
              {
                componentCode: 'PF',
                componentName: 'PF Deduction',
                type: 'DEDUCTION',
                calculationType: 'FORMULA',
                formula: '(BASIC + DA) * 0.12', // 12% of (40000 + 10000) = 6000
                amountOrPercentage: new Prisma.Decimal(0),
                affectsNetSalary: true,
                displayOrder: 3,
              },
            ],
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);
      const pf = result.items.find((i) => i.componentCode === 'PF')!;
      expect(pf.earnedAmount.toString()).toBe('6000');
      expect(result.reconciliation.netPayReconciled).toBe(true);
    });
  });

  describe('3. Proration Rules & Mid-Period Compensation Revisions', () => {
    it('should correctly prorate salary based on attendance LOP days', () => {
      // 31 calendar days, 20 paid days, 11 LOP days
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-prorated',
        employeeCode: 'E010',
        employeeName: 'Charlie Brown',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 20,
        lopDays: 11,
        compensations: [
          {
            compensationId: 'comp-10',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(620000),
            grossMonthly: new Prisma.Decimal(62000),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(31000),
                isProRataApplicable: true,
                displayOrder: 1,
              },
              {
                componentCode: 'HRA',
                componentName: 'HRA',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(31000),
                isProRataApplicable: true,
                displayOrder: 2,
              },
            ],
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);

      // Proration ratio = 20 / 31
      // Basic earned = 31000 * (20 / 31) = 20000.00
      // HRA earned = 31000 * (20 / 31) = 20000.00
      const basic = result.items.find((i) => i.componentCode === 'BASIC')!;
      const hra = result.items.find((i) => i.componentCode === 'HRA')!;

      expect(basic.earnedAmount.toString()).toBe('20000');
      expect(hra.earnedAmount.toString()).toBe('20000');
      expect(result.earnedGross.toString()).toBe('40000');
      expect(result.netSalary.toString()).toBe('40000');
      expect(result.reconciliation.netPayReconciled).toBe(true);
    });

    it('should handle exempt components that are not prorated for LOP', () => {
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-exempt',
        employeeCode: 'E011',
        employeeName: 'Diana Prince',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 20,
        lopDays: 11,
        compensations: [
          {
            compensationId: 'comp-11',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(600000),
            grossMonthly: new Prisma.Decimal(50000),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(31000),
                isProRataApplicable: true, // Prorates to 20000
                displayOrder: 1,
              },
              {
                componentCode: 'COMMUNICATION',
                componentName: 'Fixed Communication Allowance',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(5000),
                isProRataApplicable: false, // Exempt from proration: remains 5000
                displayOrder: 2,
              },
            ],
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);
      const comm = result.items.find((i) => i.componentCode === 'COMMUNICATION')!;
      expect(comm.earnedAmount.toString()).toBe('5000');
      expect(result.earnedGross.toString()).toBe('25000'); // 20000 + 5000
      expect(result.reconciliation.netPayReconciled).toBe(true);
    });

    it('should calculate mid-period salary revision across multiple compensation segments', () => {
      // Promotion effective on October 16:
      // Segment 1 (Oct 1 - Oct 15): 15 days @ Basic 31000/mo
      // Segment 2 (Oct 16 - Oct 31): 16 days @ Basic 62000/mo
      // Full attendance (31 paid days)
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-promoted',
        employeeCode: 'E012',
        employeeName: 'Evan Wright',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        compensations: [
          {
            compensationId: 'comp-pre-promo',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(372000),
            grossMonthly: new Prisma.Decimal(31000),
            effectiveFrom: new Date('2026-01-01'),
            effectiveTo: new Date('2026-10-15T23:59:59.999Z'),
            activeDaysInPeriod: 15,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-15'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic Salary',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(31000),
                isProRataApplicable: true,
                displayOrder: 1,
              },
            ],
          },
          {
            compensationId: 'comp-post-promo',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(744000),
            grossMonthly: new Prisma.Decimal(62000),
            effectiveFrom: new Date('2026-10-16T00:00:00.000Z'),
            effectiveTo: null,
            activeDaysInPeriod: 16,
            segmentStartDate: new Date('2026-10-16'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic Salary (Promoted)',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(62000),
                isProRataApplicable: true,
                displayOrder: 1,
              },
            ],
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);

      // Segment 1: 31000 * (15 / 31) = 15000.00
      // Segment 2: 62000 * (16 / 31) = 32000.00
      // Total earned = 15000 + 32000 = 47000.00
      expect(result.earnedGross.toString()).toBe('47000');
      expect(result.netSalary.toString()).toBe('47000');
      expect(result.items.length).toBe(2);
      expect(result.reconciliation.netPayReconciled).toBe(true);
    });
  });

  describe('4. Approved One-Time Adjustments & Deductions', () => {
    it('should add approved earnings adjustments (bonus, overtime) and deduction adjustments (advance recovery)', () => {
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-adj',
        employeeCode: 'E020',
        employeeName: 'Fiona Gallagher',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        compensations: [
          {
            compensationId: 'comp-20',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(600000),
            grossMonthly: new Prisma.Decimal(50000),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(50000),
                displayOrder: 1,
              },
            ],
          },
        ],
        adjustments: [
          {
            adjustmentId: 'adj-bonus',
            type: 'BONUS',
            title: 'Festive Bonus',
            amount: new Prisma.Decimal(15000),
          },
          {
            adjustmentId: 'adj-recovery',
            type: 'ADVANCE_RECOVERY',
            title: 'Salary Advance Installment',
            amount: new Prisma.Decimal(5000),
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);

      // Base earnings = 50000, Bonus = +15000 -> Gross = 65000
      // Recovery = 5000 -> Deductions = 5000
      // Net = 65000 - 5000 = 60000
      expect(result.earnedGross.toString()).toBe('65000');
      expect(result.totalEmployeeDeductions.toString()).toBe('5000');
      expect(result.netSalary.toString()).toBe('60000');
      expect(result.reconciliation.netPayReconciled).toBe(true);
    });
  });

  describe('5. Separate Employer-Side Contributions', () => {
    it('should categorize employer contributions separately without deducting from employee net take-home pay', () => {
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-employer-cost',
        employeeCode: 'E030',
        employeeName: 'George Clark',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        compensations: [
          {
            compensationId: 'comp-30',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(1200000),
            grossMonthly: new Prisma.Decimal(100000),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(50000),
                displayOrder: 1,
              },
              {
                componentCode: 'PF_EMP',
                componentName: 'PF (Employee Contribution)',
                type: 'DEDUCTION',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(1800),
                affectsNetSalary: true, // Employee deduction
                displayOrder: 2,
              },
              {
                componentCode: 'PF_EMPR',
                componentName: 'PF (Employer Contribution)',
                type: 'DEDUCTION',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(1800),
                affectsNetSalary: false, // Employer cost: DOES NOT reduce net pay
                displayOrder: 3,
              },
              {
                componentCode: 'GRATUITY',
                componentName: 'Gratuity Provision (Employer)',
                type: 'DEDUCTION',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(2400),
                affectsNetSalary: false, // Employer cost
                displayOrder: 4,
              },
            ],
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);

      // Gross = 50000
      // Employee Deductions = 1800 (only PF_EMP)
      // Net Pay = 50000 - 1800 = 48200 (NOT reduced by employer contributions!)
      expect(result.earnedGross.toString()).toBe('50000');
      expect(result.totalEmployeeDeductions.toString()).toBe('1800');
      expect(result.netSalary.toString()).toBe('48200');

      // Employer Contributions = 1800 + 2400 = 4200
      expect(result.totalEmployerContributions.toString()).toBe('4200');

      const emprPf = result.items.find((i) => i.componentCode === 'PF_EMPR')!;
      expect(emprPf.isEmployerContribution).toBe(true);

      expect(result.reconciliation.netPayReconciled).toBe(true);
    });
  });

  describe('6. Financial Rounding Boundaries & Edge Cases', () => {
    it('should support NEAREST_INTEGER rounding policy and track roundingAdjustment precisely', () => {
      // 50000.35 net pay with nearest integer rounding -> 50000.00, roundingAdjustment = -0.35
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-round',
        employeeCode: 'E040',
        employeeName: 'Hannah Montana',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        roundingPolicy: {
          netPayRounding: 'NEAREST_INTEGER',
          netPayPrecision: 0,
        },
        compensations: [
          {
            compensationId: 'comp-40',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(600000),
            grossMonthly: new Prisma.Decimal(50000.35),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(50000.35),
                displayOrder: 1,
              },
            ],
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);

      expect(result.netSalaryBeforeRounding.toString()).toBe('50000.35');
      expect(result.netSalary.toString()).toBe('50000');
      expect(result.roundingAdjustment.toString()).toBe('-0.35');
      expect(result.reconciliation.netPayReconciled).toBe(true);
    });

    it('should floor negative net salary at zero and emit explicit warning when deductions exceed earnings', () => {
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-negative',
        employeeCode: 'E050',
        employeeName: 'Ian Malcolm',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 5, // Heavily reduced paid days due to LOP
        lopDays: 26,
        compensations: [
          {
            compensationId: 'comp-50',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal(372000),
            grossMonthly: new Prisma.Decimal(31000),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal(31000),
                isProRataApplicable: true, // Prorates to 31000 * (5/31) = 5000
                displayOrder: 1,
              },
            ],
          },
        ],
        adjustments: [
          {
            adjustmentId: 'adj-loan',
            type: 'ADVANCE_RECOVERY',
            title: 'Fixed Monthly Loan Repayment',
            amount: new Prisma.Decimal(12000), // Exceeds earned gross of 5000
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);

      // Earned Gross = 5000, Deductions = 12000
      // Net Before Rounding = -7000, Net Floor = 0
      expect(result.earnedGross.toString()).toBe('5000');
      expect(result.totalEmployeeDeductions.toString()).toBe('12000');
      expect(result.netSalaryBeforeRounding.toString()).toBe('-7000');
      expect(result.netSalary.toString()).toBe('0');
      expect(result.warnings.some((w) => w.includes('capped at ₹0.00'))).toBe(true);
    });

    it('should calculate extreme large amounts safely with multi-digit decimal precision', () => {
      // Annual CTC 120,000,000 (12 Crores) -> Monthly 10,000,000
      const input: EmployeeCalculationInput = {
        employeeId: 'emp-exec',
        employeeCode: 'E099',
        employeeName: 'CEO Executive',
        period: defaultPeriod,
        calendarDays: 31,
        paidDays: 31,
        lopDays: 0,
        compensations: [
          {
            compensationId: 'comp-exec',
            currency: 'INR',
            ctcAnnual: new Prisma.Decimal('120000000.00'),
            grossMonthly: new Prisma.Decimal('10000000.00'),
            effectiveFrom: new Date('2026-01-01'),
            activeDaysInPeriod: 31,
            segmentStartDate: new Date('2026-10-01'),
            segmentEndDate: new Date('2026-10-31'),
            items: [
              {
                componentCode: 'BASIC',
                componentName: 'Basic Salary',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal('6000000.00'),
                displayOrder: 1,
              },
              {
                componentCode: 'PERF_BONUS',
                componentName: 'Executive Retainer',
                type: 'EARNING',
                calculationType: 'FLAT_AMOUNT',
                amountOrPercentage: new Prisma.Decimal('4000000.00'),
                displayOrder: 2,
              },
              {
                componentCode: 'TDS',
                componentName: 'TDS (Income Tax)',
                type: 'DEDUCTION',
                calculationType: 'PERCENTAGE_OF_GROSS',
                amountOrPercentage: new Prisma.Decimal('30.00'), // 30% of 10,000,000 = 3,000,000
                affectsNetSalary: true,
                displayOrder: 3,
              },
            ],
          },
        ],
      };

      const result = engine.calculateEmployeePayroll(input);

      expect(result.earnedGross.toString()).toBe('10000000');
      expect(result.totalEmployeeDeductions.toString()).toBe('3000000');
      expect(result.netSalary.toString()).toBe('7000000');
      expect(result.reconciliation.netPayReconciled).toBe(true);
    });
  });
});
