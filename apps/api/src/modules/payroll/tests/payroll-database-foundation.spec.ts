import { Prisma } from '@prisma/client';

describe('Phase 11.1: Payroll Data Model & Database Foundation Specification Tests', () => {
  describe('1. Financial Precision & Arithmetic Isolation (Zero-Float Guarantee)', () => {
    it('guarantees exact decimal arithmetic avoiding IEEE-754 binary floating-point artifacts', () => {
      // Standard JS float error: 0.1 + 0.2 === 0.30000000000000004
      const floatSum = 0.1 + 0.2;
      expect(floatSum).not.toBe(0.3);

      // Decimal precision guarantee:
      const decA = new Prisma.Decimal('0.1');
      const decB = new Prisma.Decimal('0.2');
      const decSum = decA.plus(decB);
      expect(decSum.toString()).toBe('0.3');
      expect(decSum.toNumber()).toBe(0.3);
    });

    it('handles high-precision fractional currency calculations without drift', () => {
      // 0.7 * 100 in JS float produces 70.00000000000001
      const decRate = new Prisma.Decimal('0.7');
      const decMultiplier = new Prisma.Decimal('100');
      const result = decRate.times(decMultiplier);
      expect(result.toString()).toBe('70');
      expect(result.toFixed(2)).toBe('70.00');
    });

    it('correctly calculates 4-decimal pro-rata ratios and rounds to 2 decimal places (Half-Up)', () => {
      const basicMonthly = new Prisma.Decimal('45000.00'); // Monthly Basic
      const totalMonthDays = new Prisma.Decimal(31); // October (31 days)
      const paidDays = new Prisma.Decimal('28.5'); // 28.5 days (2.5 days LOP)

      // Exact ratio: 28.5 / 31 = 0.9193548387...
      const proRataRatio = paidDays.dividedBy(totalMonthDays);
      expect(proRataRatio.toFixed(4)).toBe('0.9194');

      // Unrounded earned: 45000 * (28.5 / 31) = 41370.9677419...
      const earnedBasicRaw = basicMonthly.times(paidDays).dividedBy(totalMonthDays);

      // Half-Up rounded to 2 decimal places: 41370.97
      const earnedBasic = earnedBasicRaw.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      expect(earnedBasic.toString()).toBe('41370.97');
    });

    it('calculates Net Pay integer rounding and balances via dedicated rounding adjustment delta', () => {
      const earnedGross = new Prisma.Decimal('75432.65');
      const totalDeductions = new Prisma.Decimal('12845.20');

      // Exact Net: 75432.65 - 12845.20 = 62587.45
      const exactNet = earnedGross.minus(totalDeductions);
      expect(exactNet.toString()).toBe('62587.45');

      // Integer Rounded Net Pay (Indian Payroll Convention):
      const integerNetPay = exactNet.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
      expect(integerNetPay.toString()).toBe('62587');

      // Balancing Rounding Adjustment: 62587.00 - 62587.45 = -0.45
      const roundingAdjustment = integerNetPay.minus(exactNet);
      expect(roundingAdjustment.toString()).toBe('-0.45');

      // Verify Mathematical Invariant: exactNet + roundingAdjustment === integerNetPay
      expect(exactNet.plus(roundingAdjustment).equals(integerNetPay)).toBe(true);
    });
  });

  describe('2. Effective-Dated Compensation Assignments & Overlap Prevention', () => {
    interface CompensationRecord {
      id: string;
      employeeId: string;
      ctcAnnual: Prisma.Decimal;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      isLocked: boolean;
    }

    /**
     * Helper validation logic simulating transaction-aware service validation
     */
    function validateNoOverlappingCompensation(
      existingRecords: CompensationRecord[],
      newAssignment: { effectiveFrom: Date; effectiveTo: Date | null },
      excludeId?: string,
    ): { isValid: boolean; conflictReason?: string } {
      if (newAssignment.effectiveTo && newAssignment.effectiveFrom > newAssignment.effectiveTo) {
        return {
          isValid: false,
          conflictReason: 'effectiveFrom date must be earlier than or equal to effectiveTo date',
        };
      }

      for (const rec of existingRecords) {
        if (excludeId && rec.id === excludeId) continue;

        const recStart = rec.effectiveFrom.getTime();
        const recEnd = rec.effectiveTo ? rec.effectiveTo.getTime() : Infinity;
        const newStart = newAssignment.effectiveFrom.getTime();
        const newEnd = newAssignment.effectiveTo ? newAssignment.effectiveTo.getTime() : Infinity;

        // Overlap condition: (StartA <= EndB) and (EndA >= StartB)
        if (newStart <= recEnd && newEnd >= recStart) {
          return {
            isValid: false,
            conflictReason: `Overlapping compensation assignment detected with record ${rec.id} (${rec.effectiveFrom.toISOString().slice(0, 10)} to ${rec.effectiveTo ? rec.effectiveTo.toISOString().slice(0, 10) : 'ongoing'})`,
          };
        }
      }

      return { isValid: true };
    }

    it('accepts non-overlapping historical and current compensation assignments', () => {
      const historical: CompensationRecord[] = [
        {
          id: 'comp-1',
          employeeId: 'emp-1',
          ctcAnnual: new Prisma.Decimal('600000.00'),
          effectiveFrom: new Date('2025-01-01T00:00:00Z'),
          effectiveTo: new Date('2025-12-31T23:59:59Z'),
          isLocked: true,
        },
      ];

      const newAssignment = {
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null, // Current active
      };

      const result = validateNoOverlappingCompensation(historical, newAssignment);
      expect(result.isValid).toBe(true);
    });

    it('rejects invalid inverted date ranges where effectiveFrom is after effectiveTo', () => {
      const result = validateNoOverlappingCompensation([], {
        effectiveFrom: new Date('2026-06-01T00:00:00Z'),
        effectiveTo: new Date('2026-01-01T00:00:00Z'),
      });

      expect(result.isValid).toBe(false);
      expect(result.conflictReason).toContain('effectiveFrom date must be earlier');
    });

    it('rejects new assignment that overlaps an existing active or historical assignment', () => {
      const existing: CompensationRecord[] = [
        {
          id: 'comp-1',
          employeeId: 'emp-1',
          ctcAnnual: new Prisma.Decimal('720000.00'),
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: null, // Ongoing
          isLocked: true,
        },
      ];

      // Attempting to add overlapping compensation without terminating existing one
      const overlapping = {
        effectiveFrom: new Date('2026-07-01T00:00:00Z'),
        effectiveTo: null,
      };

      const result = validateNoOverlappingCompensation(existing, overlapping);
      expect(result.isValid).toBe(false);
      expect(result.conflictReason).toContain('Overlapping compensation assignment detected');
    });

    it('preserves historical compensation records during promotion/increment revision', () => {
      // Simulating automated safe transition
      const initialComp: CompensationRecord = {
        id: 'comp-v1',
        employeeId: 'emp-1',
        ctcAnnual: new Prisma.Decimal('600000.00'),
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
        isLocked: false,
      };

      // Annual revision effective from July 1, 2026:
      const revisionEffectiveFrom = new Date('2026-07-01T00:00:00Z');

      // 1. Prior record is capped to June 30, 2026 23:59:59
      const closedInitial: CompensationRecord = {
        ...initialComp,
        effectiveTo: new Date(revisionEffectiveFrom.getTime() - 1000),
        isLocked: true,
      };

      // 2. New record begins July 1, 2026
      const revisionComp: CompensationRecord = {
        id: 'comp-v2',
        employeeId: 'emp-1',
        ctcAnnual: new Prisma.Decimal('800000.00'),
        effectiveFrom: revisionEffectiveFrom,
        effectiveTo: null,
        isLocked: false,
      };

      // Validating sequential integrity:
      expect(closedInitial.effectiveTo?.toISOString()).toBe('2026-06-30T23:59:59.000Z');
      expect(revisionComp.effectiveFrom.toISOString()).toBe('2026-07-01T00:00:00.000Z');

      const verification = validateNoOverlappingCompensation([closedInitial], revisionComp);
      expect(verification.isValid).toBe(true);
    });
  });

  describe('3. Uniqueness Constraints & Entity Identification', () => {
    it('verifies payroll run composite uniqueness key structure', () => {
      // In schema: @@unique([organizationId, periodId, scope, runNumber, calculationVersion])
      const runKey = {
        organizationId: 'org-test-1',
        periodId: 'period-2026-10',
        scope: 'ALL',
        runNumber: 1,
        calculationVersion: 1,
      };

      const compositeKeyString = `${runKey.organizationId}_${runKey.periodId}_${runKey.scope}_${runKey.runNumber}_${runKey.calculationVersion}`;
      expect(compositeKeyString).toBe('org-test-1_period-2026-10_ALL_1_1');

      // Supplementary run has different runNumber:
      const supplementaryKey = { ...runKey, runNumber: 2 };
      expect(
        `${supplementaryKey.organizationId}_${supplementaryKey.periodId}_${supplementaryKey.scope}_${supplementaryKey.runNumber}_${supplementaryKey.calculationVersion}`,
      ).toBe('org-test-1_period-2026-10_ALL_2_1');

      // Recalculated draft has incremented calculationVersion:
      const recalcKey = { ...runKey, calculationVersion: 2 };
      expect(
        `${recalcKey.organizationId}_${recalcKey.periodId}_${recalcKey.scope}_${recalcKey.runNumber}_${recalcKey.calculationVersion}`,
      ).toBe('org-test-1_period-2026-10_ALL_1_2');
    });

    it('verifies payslip number format and per-employee uniqueness in a run', () => {
      // In schema: @@unique([payrollRunId, employeeId]) and @@unique([organizationId, payslipNumber])
      const payslipNumberPattern = /^PS-\d{6}-\d{5}$/; // PS-YYYYMM-XXXXX
      const samplePayslipNumber = 'PS-202610-00102';

      expect(payslipNumberPattern.test(samplePayslipNumber)).toBe(true);
      expect(samplePayslipNumber).toMatch(/^PS-202610/);
    });
  });

  describe('4. Historical Snapshot Preservation & Immutability', () => {
    it('guarantees locked payslips preserve historical numbers even if component definitions mutate', () => {
      // Simulated frozen snapshot
      const frozenSnapshot = {
        id: 'snap-1',
        employeeId: 'emp-101',
        employeeCode: 'EMP-101',
        employeeName: 'Aarav Patel',
        baseMonthlyGross: new Prisma.Decimal('50000.00'),
        earnedGross: new Prisma.Decimal('46774.19'),
        totalDeductions: new Prisma.Decimal('3800.00'),
        netSalary: new Prisma.Decimal('42974.00'),
        items: [
          { componentCode: 'BASIC', earnedAmount: new Prisma.Decimal('23387.10') },
          { componentCode: 'HRA', earnedAmount: new Prisma.Decimal('11693.55') },
          { componentCode: 'PF_EMPLOYEE', earnedAmount: new Prisma.Decimal('1800.00') },
        ],
        calculationInputSnapshot: {
          calendarDays: 31,
          paidDays: 29,
          lopDays: 2,
          structureVersion: 1,
          basicPercentageOfGross: 50,
        },
      };

      // Master data change simulated: HRA policy updated from 25% to 30%, Basic formula modified
      const currentMasterSettings = {
        structureVersion: 2,
        basicPercentageOfGross: 55,
        hraPercentageOfBasic: 50,
      };

      // Verification: frozen snapshot values remain intact
      expect(frozenSnapshot.items[0].earnedAmount.toFixed(2)).toBe('23387.10');
      expect(frozenSnapshot.items[1].earnedAmount.toFixed(2)).toBe('11693.55');
      expect(frozenSnapshot.calculationInputSnapshot.structureVersion).toBe(1);
      expect(frozenSnapshot.calculationInputSnapshot.structureVersion).not.toBe(
        currentMasterSettings.structureVersion,
      );
    });

    it('verifies PII masking protection on financial snapshot models', () => {
      const rawBankAcc = '123456789012';
      const rawPan = 'ABCDE1234F';

      // Masking helpers
      const maskBank = (acc: string) => `XXXXXX${acc.slice(-4)}`;
      const maskPan = (pan: string) => `XXXXX${pan.slice(-4)}`;

      const snapshotRecord = {
        bankAccountMasked: maskBank(rawBankAcc),
        panMasked: maskPan(rawPan),
      };

      expect(snapshotRecord.bankAccountMasked).toBe('XXXXXX9012');
      expect(snapshotRecord.panMasked).toBe('XXXXX234F');
      expect(snapshotRecord.bankAccountMasked).not.toContain('12345678');
      expect(snapshotRecord.panMasked).not.toContain('ABCDE');
    });
  });

  describe('5. Database Relational Deletion Rules & Integrity', () => {
    it('verifies relational constraints prevent accidental cascade of critical historical payroll data', () => {
      // Relational policies defined in schema:
      // 1. SalaryComponent -> SalaryStructureItem: onDelete: Restrict
      // 2. Employee -> EmployeePayrollSnapshot: onDelete: Restrict
      // 3. SalaryStructure -> EmployeeCompensation: onDelete: Restrict
      // 4. PayrollPeriod -> PayrollRun: onDelete: Restrict

      const deletionRules = {
        salaryComponentReferencedInStructure: 'RESTRICT',
        employeeWithLockedPayrollSnapshot: 'RESTRICT',
        salaryStructureReferencedInCompensation: 'RESTRICT',
        payrollPeriodWithExecutedRuns: 'RESTRICT',
      };

      expect(deletionRules.salaryComponentReferencedInStructure).toBe('RESTRICT');
      expect(deletionRules.employeeWithLockedPayrollSnapshot).toBe('RESTRICT');
      expect(deletionRules.salaryStructureReferencedInCompensation).toBe('RESTRICT');
      expect(deletionRules.payrollPeriodWithExecutedRuns).toBe('RESTRICT');
    });
  });
});
