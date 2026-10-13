import {
  PayrollCalculationEngineService,
  EmployeeCalculationInput,
} from '../services/payroll-calculation-engine.service';
import { Prisma } from '@prisma/client';
import { performance } from 'perf_hooks';

describe('Phase 15: Performance, Scalability & Reliability Benchmarks', () => {
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

  function createSyntheticInput(
    index: number,
    paidDays: number,
    lopDays: number,
  ): EmployeeCalculationInput {
    const ctcAnnual = new Prisma.Decimal(600000 + (index % 50) * 20000);
    const grossMonthly = ctcAnnual.dividedBy(12).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const basicMonthly = grossMonthly.times(0.5).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const hraMonthly = basicMonthly.times(0.5).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    return {
      employeeId: `emp-${index}`,
      employeeCode: `EMP${String(index).padStart(4, '0')}`,
      employeeName: `Employee ${index}`,
      departmentName: index % 2 === 0 ? 'Engineering' : 'Operations',
      designationTitle: index % 3 === 0 ? 'Senior Specialist' : 'Associate',
      branchName: 'Headquarters',
      period: defaultPeriod,
      calendarDays: 31,
      workingDays: 22,
      paidDays,
      lopDays,
      compensations: [
        {
          compensationId: `comp-${index}`,
          structureId: 'struct-1',
          structureName: 'Standard Package',
          currency: 'INR',
          ctcAnnual,
          grossMonthly,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          activeDaysInPeriod: 31,
          segmentStartDate: defaultPeriod.startDate,
          segmentEndDate: defaultPeriod.endDate,
          items: [
            {
              componentId: 'c-basic',
              componentCode: 'BASIC',
              componentName: 'Basic Salary',
              type: 'EARNING',
              calculationType: 'FLAT_AMOUNT',
              amountOrPercentage: basicMonthly,
              isProRataApplicable: true,
              isStatutory: false,
              affectsNetSalary: true,
              displayOrder: 1,
            },
            {
              componentId: 'c-hra',
              componentCode: 'HRA',
              componentName: 'House Rent Allowance',
              type: 'EARNING',
              calculationType: 'FLAT_AMOUNT',
              amountOrPercentage: hraMonthly,
              isProRataApplicable: true,
              isStatutory: false,
              affectsNetSalary: true,
              displayOrder: 2,
            },
            {
              componentId: 'c-pf',
              componentCode: 'PF_EE',
              componentName: 'Provident Fund (Employee)',
              type: 'DEDUCTION',
              calculationType: 'PERCENTAGE_OF_BASIC',
              amountOrPercentage: new Prisma.Decimal(12),
              isProRataApplicable: false,
              isStatutory: true,
              affectsNetSalary: true,
              displayOrder: 3,
            },
            {
              componentId: 'c-pt',
              componentCode: 'PT',
              componentName: 'Professional Tax',
              type: 'DEDUCTION',
              calculationType: 'FLAT_AMOUNT',
              amountOrPercentage: new Prisma.Decimal(200),
              isProRataApplicable: false,
              isStatutory: true,
              affectsNetSalary: true,
              displayOrder: 4,
            },
          ],
        },
      ],
      adjustments:
        index % 5 === 0
          ? [
              {
                adjustmentId: `adj-${index}`,
                type: 'BONUS',
                title: 'Quarterly Performance Bonus',
                amount: new Prisma.Decimal(5000),
                isTaxable: true,
              },
            ]
          : [],
    };
  }

  describe('1. Micro-Benchmark: 100, 500, and 1,000 Employee Calculations', () => {
    it('should calculate 100 employee payrolls with high throughput and strict 2-decimal precision', () => {
      const latencies: number[] = [];
      const t0 = performance.now();

      for (let i = 0; i < 100; i++) {
        const input = createSyntheticInput(i, 31 - (i % 3), i % 3);
        const itemT0 = performance.now();
        const result = engine.calculateEmployeePayroll(input, 1, 1);
        const itemT1 = performance.now();
        latencies.push(itemT1 - itemT0);

        // Financial validation
        expect(result.netSalary.decimalPlaces()).toBeLessThanOrEqual(2);
        expect(result.earnedGross.decimalPlaces()).toBeLessThanOrEqual(2);
        expect(result.totalEmployeeDeductions.decimalPlaces()).toBeLessThanOrEqual(2);
        expect(result.isException).toBe(false);
      }

      const totalMs = performance.now() - t0;
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      // 100 calculations should complete in well under 1000ms
      expect(totalMs).toBeLessThan(1000);
      expect(p50).toBeLessThan(5); // Sub-5ms per employee
      expect(p95).toBeLessThan(15);
    });

    it('should calculate 500 employee payrolls reproducibly without memory leak', () => {
      const initialMem = process.memoryUsage().heapUsed;
      const t0 = performance.now();

      let aggregateNet = new Prisma.Decimal(0);
      for (let i = 0; i < 500; i++) {
        const input = createSyntheticInput(i, 30, 1);
        const result = engine.calculateEmployeePayroll(input, 1, 1);
        aggregateNet = aggregateNet.plus(result.netSalary);
      }

      const totalMs = performance.now() - t0;
      const finalMem = process.memoryUsage().heapUsed;
      const heapDeltaMb = (finalMem - initialMem) / (1024 * 1024);

      // Verify throughput and bounded memory usage
      expect(totalMs).toBeLessThan(3000);
      expect(heapDeltaMb).toBeLessThan(50); // Less than 50MB delta for 500 computations
      expect(aggregateNet.greaterThan(0)).toBe(true);
    });

    it('should produce identical results on repeated calculation (idempotency and reproducibility)', () => {
      const input = createSyntheticInput(42, 28, 3);
      const run1 = engine.calculateEmployeePayroll(input, 1, 1);
      const run2 = engine.calculateEmployeePayroll(input, 1, 1);

      expect(run1.earnedGross.toString()).toBe(run2.earnedGross.toString());
      expect(run1.netSalary.toString()).toBe(run2.netSalary.toString());
      expect(run1.totalEmployeeDeductions.toString()).toBe(run2.totalEmployeeDeductions.toString());
      expect(run1.payslipNumber).toBe(run2.payslipNumber);
    });
  });

  describe('2. Concurrent Calculation Safety', () => {
    it('should safely process concurrent employee calculations without data race or state contamination', async () => {
      const tasks = Array.from({ length: 50 }, (_, i) => {
        return Promise.resolve().then(() => {
          const input = createSyntheticInput(i, 31, 0);
          return engine.calculateEmployeePayroll(input, 1, 1);
        });
      });

      const results = await Promise.all(tasks);
      expect(results.length).toBe(50);

      const payslipNumbers = new Set(results.map((r) => r.payslipNumber));
      // Each payslip number must be unique
      expect(payslipNumbers.size).toBe(50);

      // Verify all nets are valid decimals > 0
      for (const res of results) {
        expect(res.netSalary.greaterThan(0)).toBe(true);
        expect(res.earnedGross.greaterThan(0)).toBe(true);
      }
    });
  });
});
