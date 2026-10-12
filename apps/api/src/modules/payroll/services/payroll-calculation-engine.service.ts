import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FormulaParserUtil } from '../utils/formula-parser.util';

export interface CalculationComponentInput {
  componentId?: string | null;
  componentCode: string;
  componentName: string;
  type: 'EARNING' | 'DEDUCTION';
  calculationType: 'FLAT_AMOUNT' | 'PERCENTAGE_OF_BASIC' | 'PERCENTAGE_OF_GROSS' | 'FORMULA';
  amountOrPercentage: Prisma.Decimal;
  formula?: string | null;
  isProRataApplicable?: boolean;
  isStatutory?: boolean;
  affectsNetSalary?: boolean;
  displayOrder?: number;
}

export interface CompensationSegmentInput {
  compensationId: string;
  structureId?: string;
  structureName?: string;
  structureVersion?: number;
  currency?: string;
  ctcAnnual: Prisma.Decimal;
  grossMonthly: Prisma.Decimal;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  items: CalculationComponentInput[];
  activeDaysInPeriod: number;
  segmentStartDate: Date;
  segmentEndDate: Date;
}

export interface AdjustmentInput {
  adjustmentId: string;
  type:
    | 'BONUS'
    | 'ARREAR'
    | 'OVERTIME'
    | 'INCENTIVE'
    | 'REIMBURSEMENT'
    | 'DEDUCTION_OTHER'
    | 'ADVANCE_RECOVERY';
  title: string;
  amount: Prisma.Decimal;
  isTaxable?: boolean;
}

export interface RoundingPolicyConfig {
  componentRounding?: 'HALF_UP' | 'DOWN' | 'UP';
  componentPrecision?: number;
  netPayRounding?: 'HALF_UP' | 'NEAREST_INTEGER';
  netPayPrecision?: number;
}

export interface EmployeeCalculationInput {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentName?: string | null;
  designationTitle?: string | null;
  branchName?: string | null;
  period: {
    id: string;
    year: number;
    month: number;
    startDate: Date;
    endDate: Date;
    totalDays: number;
  };
  calendarDays: number;
  workingDays?: number;
  paidDays: number;
  lopDays: number;
  compensations: CompensationSegmentInput[];
  adjustments?: AdjustmentInput[];
  roundingPolicy?: RoundingPolicyConfig;
}

export interface ItemizedCalculationResult {
  componentId?: string | null;
  componentCode: string;
  componentName: string;
  type: 'EARNING' | 'DEDUCTION';
  isEmployerContribution: boolean;
  standardAmount: Prisma.Decimal;
  earnedAmount: Prisma.Decimal;
  calculationType: string;
  formula?: string | null;
  inputSource: 'COMPENSATION_STRUCTURE' | 'MID_PERIOD_SEGMENT' | 'ADJUSTMENT';
  displayOrder: number;
  explanation: string;
}

export interface CalculationReconciliationResult {
  grossEarningsMatch: boolean;
  deductionsMatch: boolean;
  netPayReconciled: boolean;
  calculatedNetMinusSummary: Prisma.Decimal;
  warnings: string[];
}

export interface PayrollCalculationOutput {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  payslipNumber: string;
  currency: string;
  calendarDays: Prisma.Decimal;
  workingDays: Prisma.Decimal;
  paidDays: Prisma.Decimal;
  lopDays: Prisma.Decimal;
  prorationRatio: Prisma.Decimal;
  baseMonthlyGross: Prisma.Decimal;
  earnedGross: Prisma.Decimal;
  totalEmployeeDeductions: Prisma.Decimal;
  totalEmployerContributions: Prisma.Decimal;
  netSalaryBeforeRounding: Prisma.Decimal;
  netSalary: Prisma.Decimal;
  roundingAdjustment: Prisma.Decimal;
  items: ItemizedCalculationResult[];
  calculationInputSnapshot: Record<string, any>;
  reconciliation: CalculationReconciliationResult;
  warnings: string[];
  isException: boolean;
  exceptionReason?: string | null;
}

@Injectable()
export class PayrollCalculationEngineService {
  private readonly logger = new Logger(PayrollCalculationEngineService.name);

  /**
   * Validate calculation input parameters strictly
   */
  validateInput(input: EmployeeCalculationInput): void {
    if (!input.employeeId || !input.employeeCode) {
      throw new BadRequestException('Employee identification is required for calculation.');
    }

    if (!input.period || !input.period.totalDays || input.period.totalDays <= 0) {
      throw new BadRequestException(
        `Invalid payroll period totalDays: ${input.period?.totalDays}. Must be strictly positive.`,
      );
    }

    if (
      !Number.isFinite(input.calendarDays) ||
      input.calendarDays <= 0 ||
      input.calendarDays > 366
    ) {
      throw new BadRequestException(
        `Invalid calendarDays: ${input.calendarDays}. Must be a finite positive number.`,
      );
    }

    if (!Number.isFinite(input.paidDays) || input.paidDays < 0) {
      throw new BadRequestException(
        `Invalid paidDays: ${input.paidDays}. Must be a finite non-negative number.`,
      );
    }

    if (!Number.isFinite(input.lopDays) || input.lopDays < 0) {
      throw new BadRequestException(
        `Invalid lopDays: ${input.lopDays}. Must be a finite non-negative number.`,
      );
    }

    if (input.paidDays > input.calendarDays) {
      throw new BadRequestException(
        `Paid days (${input.paidDays}) cannot exceed total calendar days (${input.calendarDays}).`,
      );
    }

    // Check adjustments
    if (input.adjustments) {
      for (const adj of input.adjustments) {
        if (!adj.amount || !adj.amount.isFinite() || adj.amount.isNaN()) {
          throw new BadRequestException(
            `Adjustment '${adj.title}' has invalid or non-finite amount: ${adj.amount}`,
          );
        }
      }
    }
  }

  /**
   * Safe financial rounding using Prisma.Decimal
   */
  roundDecimal(value: Prisma.Decimal, mode = 'HALF_UP', precision = 2): Prisma.Decimal {
    return FormulaParserUtil.round(value, mode, precision);
  }

  /**
   * Deterministic calculation of an employee's payroll for a single period
   */
  calculateEmployeePayroll(
    input: EmployeeCalculationInput,
    runNumber = 1,
    calculationVersion = 1,
  ): PayrollCalculationOutput {
    this.validateInput(input);

    const warnings: string[] = [];
    const totalPeriodDays = new Prisma.Decimal(input.period.totalDays);
    const paidDaysDec = new Prisma.Decimal(input.paidDays);
    const lopDaysDec = new Prisma.Decimal(input.lopDays);
    const calendarDaysDec = new Prisma.Decimal(input.calendarDays);

    const payslipNumber = `PAY-${input.period.year}${String(input.period.month).padStart(2, '0')}-${input.employeeCode}-R${runNumber}V${calculationVersion}`;

    // Missing compensation policy: Explicit exception, DO NOT silently convert to zero
    if (!input.compensations || input.compensations.length === 0) {
      const reason = 'No approved compensation assignment active for this period';
      warnings.push(reason);

      const zeroDec = new Prisma.Decimal(0);
      return {
        employeeId: input.employeeId,
        employeeCode: input.employeeCode,
        employeeName: input.employeeName,
        payslipNumber,
        currency: 'INR',
        calendarDays: calendarDaysDec,
        workingDays: new Prisma.Decimal(input.workingDays ?? input.calendarDays),
        paidDays: zeroDec,
        lopDays: calendarDaysDec,
        prorationRatio: zeroDec,
        baseMonthlyGross: zeroDec,
        earnedGross: zeroDec,
        totalEmployeeDeductions: zeroDec,
        totalEmployerContributions: zeroDec,
        netSalaryBeforeRounding: zeroDec,
        netSalary: zeroDec,
        roundingAdjustment: zeroDec,
        items: [],
        calculationInputSnapshot: {
          period: input.period,
          calendarDays: input.calendarDays,
          paidDays: input.paidDays,
          lopDays: input.lopDays,
          compensations: [],
          adjustments: [],
        },
        reconciliation: {
          grossEarningsMatch: true,
          deductionsMatch: true,
          netPayReconciled: true,
          calculatedNetMinusSummary: zeroDec,
          warnings: [reason],
        },
        warnings,
        isException: true,
        exceptionReason: reason,
      };
    }

    const prorationRatio = paidDaysDec.dividedBy(totalPeriodDays);
    const currency = input.compensations[0]?.currency || 'INR';

    const componentRounding = input.roundingPolicy?.componentRounding || 'HALF_UP';
    const componentPrecision = input.roundingPolicy?.componentPrecision ?? 2;
    const netPayRounding = input.roundingPolicy?.netPayRounding || 'HALF_UP';
    const netPayPrecision = input.roundingPolicy?.netPayPrecision ?? 2;

    const lineItems: ItemizedCalculationResult[] = [];
    let baseMonthlyGrossSum = new Prisma.Decimal(0);
    let earnedGrossSum = new Prisma.Decimal(0);
    let totalEmployeeDeductionsSum = new Prisma.Decimal(0);
    let totalEmployerContributionsSum = new Prisma.Decimal(0);

    const isMultiSegment = input.compensations.length > 1;

    // Process each compensation segment (handles both full period and mid-period salary revisions)
    for (const segment of input.compensations) {
      if (!segment.ctcAnnual || segment.ctcAnnual.isNegative() || !segment.ctcAnnual.isFinite()) {
        throw new BadRequestException(
          `Compensation ${segment.compensationId} has invalid or negative CTC: ${segment.ctcAnnual}`,
        );
      }

      baseMonthlyGrossSum = baseMonthlyGrossSum.plus(segment.grossMonthly);

      // Compute segment active days weight
      const segmentActiveDays = new Prisma.Decimal(segment.activeDaysInPeriod);
      // Segment attendance proportion: (activeDays / periodDays) * (paidDays / calendarDays)
      const segmentProrationWeight = isMultiSegment
        ? segmentActiveDays.dividedBy(totalPeriodDays).times(prorationRatio)
        : prorationRatio;

      // Map of standard evaluated amounts for formula resolution within this segment
      const standardContext: Record<string, Prisma.Decimal> = {
        GROSS: segment.grossMonthly,
        BASIC: new Prisma.Decimal(0),
      };

      // 1. First pass: Evaluate Basic and Flat/Percentage components
      const sortedItems = [...segment.items].sort(
        (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
      );

      for (const item of sortedItems) {
        let stdAmount = new Prisma.Decimal(0);

        if (item.calculationType === 'FLAT_AMOUNT') {
          stdAmount = item.amountOrPercentage;
        } else if (item.calculationType === 'PERCENTAGE_OF_BASIC') {
          const basic = standardContext['BASIC'] || new Prisma.Decimal(0);
          stdAmount = basic.times(item.amountOrPercentage).dividedBy(100);
        } else if (item.calculationType === 'PERCENTAGE_OF_GROSS') {
          stdAmount = segment.grossMonthly.times(item.amountOrPercentage).dividedBy(100);
        }

        stdAmount = this.roundDecimal(stdAmount, componentRounding, componentPrecision);
        standardContext[item.componentCode] = stdAmount;

        if (item.componentCode === 'BASIC') {
          standardContext['BASIC'] = stdAmount;
        }
      }

      // 2. Second pass: Evaluate Formulas
      for (const item of sortedItems) {
        if (item.calculationType === 'FORMULA' && item.formula) {
          try {
            const evaluated = FormulaParserUtil.evaluate(item.formula, standardContext);
            const stdAmount = this.roundDecimal(evaluated, componentRounding, componentPrecision);
            standardContext[item.componentCode] = stdAmount;
          } catch (err: any) {
            throw new BadRequestException(
              `Error calculating formula for component '${item.componentCode}' (${item.formula}): ${err.message}`,
            );
          }
        }
      }

      // 3. Third pass: Derive earned amounts with proration policy
      for (const item of sortedItems) {
        const stdAmount = standardContext[item.componentCode] || new Prisma.Decimal(0);
        const isProRata = item.isProRataApplicable !== false;

        let earnedAmount: Prisma.Decimal;
        let explanation: string;

        if (isProRata) {
          earnedAmount = this.roundDecimal(
            stdAmount.times(segmentProrationWeight),
            componentRounding,
            componentPrecision,
          );
          explanation = isMultiSegment
            ? `Prorated for segment (${segment.activeDaysInPeriod} days) at ${segmentProrationWeight.times(100).toFixed(2)}% of standard ₹${stdAmount.toFixed(2)}`
            : `Prorated at ${prorationRatio.times(100).toFixed(2)}% (${input.paidDays}/${input.period.totalDays} days) of standard ₹${stdAmount.toFixed(2)}`;
        } else {
          earnedAmount = stdAmount;
          explanation = `Fixed component exempt from LOP proration (Standard ₹${stdAmount.toFixed(2)})`;
        }

        const isEmployer = item.affectsNetSalary === false && item.type === 'DEDUCTION';

        if (item.type === 'EARNING') {
          earnedGrossSum = earnedGrossSum.plus(earnedAmount);
        } else if (item.type === 'DEDUCTION') {
          if (isEmployer) {
            totalEmployerContributionsSum = totalEmployerContributionsSum.plus(earnedAmount);
          } else {
            totalEmployeeDeductionsSum = totalEmployeeDeductionsSum.plus(earnedAmount);
          }
        }

        lineItems.push({
          componentId: item.componentId,
          componentCode: item.componentCode,
          componentName: item.componentName,
          type: item.type,
          isEmployerContribution: isEmployer,
          standardAmount: stdAmount,
          earnedAmount,
          calculationType: item.calculationType,
          formula: item.formula,
          inputSource: isMultiSegment ? 'MID_PERIOD_SEGMENT' : 'COMPENSATION_STRUCTURE',
          displayOrder: item.displayOrder ?? 0,
          explanation,
        });
      }
    }

    // Process Approved Adjustments (One-time Earnings & Deductions)
    if (input.adjustments && input.adjustments.length > 0) {
      for (const adj of input.adjustments) {
        const adjAmount = this.roundDecimal(adj.amount, componentRounding, componentPrecision);

        const isEarningAdj = ['BONUS', 'ARREAR', 'OVERTIME', 'INCENTIVE', 'REIMBURSEMENT'].includes(
          adj.type,
        );

        if (isEarningAdj) {
          earnedGrossSum = earnedGrossSum.plus(adjAmount);
          lineItems.push({
            componentId: null,
            componentCode: `ADJ_${adj.type}`,
            componentName: adj.title,
            type: 'EARNING',
            isEmployerContribution: false,
            standardAmount: adjAmount,
            earnedAmount: adjAmount,
            calculationType: 'FLAT_AMOUNT',
            formula: null,
            inputSource: 'ADJUSTMENT',
            displayOrder: 900,
            explanation: `Approved adjustment: ${adj.type} (${adj.title})`,
          });
        } else {
          // Deduction adjustment
          totalEmployeeDeductionsSum = totalEmployeeDeductionsSum.plus(adjAmount);
          lineItems.push({
            componentId: null,
            componentCode: `ADJ_${adj.type}`,
            componentName: adj.title,
            type: 'DEDUCTION',
            isEmployerContribution: false,
            standardAmount: adjAmount,
            earnedAmount: adjAmount,
            calculationType: 'FLAT_AMOUNT',
            formula: null,
            inputSource: 'ADJUSTMENT',
            displayOrder: 950,
            explanation: `Approved deduction adjustment: ${adj.type} (${adj.title})`,
          });
        }
      }
    }

    // Derive Net Pay and Apply Centralized Rounding
    const netSalaryBeforeRounding = earnedGrossSum.minus(totalEmployeeDeductionsSum);
    let netSalary: Prisma.Decimal;
    let roundingAdjustment: Prisma.Decimal;

    if (netPayRounding === 'NEAREST_INTEGER') {
      const roundedInt = this.roundDecimal(netSalaryBeforeRounding, 'NEAREST_INTEGER', 0);
      netSalary = roundedInt.isNegative() ? new Prisma.Decimal(0) : roundedInt;
      roundingAdjustment = netSalary.minus(netSalaryBeforeRounding);
    } else {
      const roundedDec = this.roundDecimal(
        netSalaryBeforeRounding,
        netPayRounding,
        netPayPrecision,
      );
      netSalary = roundedDec.isNegative() ? new Prisma.Decimal(0) : roundedDec;
      roundingAdjustment = netSalary.minus(netSalaryBeforeRounding);
    }

    if (netSalaryBeforeRounding.isNegative()) {
      warnings.push(
        `Total deductions (₹${totalEmployeeDeductionsSum.toFixed(2)}) exceed gross earnings (₹${earnedGrossSum.toFixed(2)}). Net salary capped at ₹0.00.`,
      );
    }

    // Strict Reconciliation Checks: Every line item must sum up to summary totals exactly
    let sumEarnedGross = new Prisma.Decimal(0);
    let sumEmployeeDeductions = new Prisma.Decimal(0);

    for (const item of lineItems) {
      if (item.type === 'EARNING') {
        sumEarnedGross = sumEarnedGross.plus(item.earnedAmount);
      } else if (item.type === 'DEDUCTION' && !item.isEmployerContribution) {
        sumEmployeeDeductions = sumEmployeeDeductions.plus(item.earnedAmount);
      }
    }

    const grossDiff = sumEarnedGross.minus(earnedGrossSum).abs();
    const deductionsDiff = sumEmployeeDeductions.minus(totalEmployeeDeductionsSum).abs();
    const tolerance = new Prisma.Decimal(0.01);

    const grossEarningsMatch = grossDiff.lte(tolerance);
    const deductionsMatch = deductionsDiff.lte(tolerance);

    const calculatedNetMinusSummary = earnedGrossSum
      .minus(totalEmployeeDeductionsSum)
      .plus(roundingAdjustment)
      .minus(netSalary);

    const netPayReconciled =
      grossEarningsMatch && deductionsMatch && calculatedNetMinusSummary.abs().lte(tolerance);

    if (!netPayReconciled) {
      warnings.push(
        `Reconciliation warning: Line item totals deviate from summary totals (Gross diff: ${grossDiff}, Deductions diff: ${deductionsDiff}).`,
      );
    }

    const reconciliation: CalculationReconciliationResult = {
      grossEarningsMatch,
      deductionsMatch,
      netPayReconciled,
      calculatedNetMinusSummary,
      warnings: [...warnings],
    };

    return {
      employeeId: input.employeeId,
      employeeCode: input.employeeCode,
      employeeName: input.employeeName,
      payslipNumber,
      currency,
      calendarDays: calendarDaysDec,
      workingDays: new Prisma.Decimal(input.workingDays ?? input.calendarDays),
      paidDays: paidDaysDec,
      lopDays: lopDaysDec,
      prorationRatio,
      baseMonthlyGross: baseMonthlyGrossSum,
      earnedGross: earnedGrossSum,
      totalEmployeeDeductions: totalEmployeeDeductionsSum,
      totalEmployerContributions: totalEmployerContributionsSum,
      netSalaryBeforeRounding,
      netSalary,
      roundingAdjustment,
      items: lineItems,
      calculationInputSnapshot: {
        employeeId: input.employeeId,
        employeeCode: input.employeeCode,
        period: input.period,
        calendarDays: input.calendarDays,
        workingDays: input.workingDays,
        paidDays: input.paidDays,
        lopDays: input.lopDays,
        prorationRatio: prorationRatio.toString(),
        compensations: input.compensations.map((c) => ({
          compensationId: c.compensationId,
          structureId: c.structureId,
          structureVersion: c.structureVersion,
          ctcAnnual: c.ctcAnnual.toString(),
          grossMonthly: c.grossMonthly.toString(),
          activeDaysInPeriod: c.activeDaysInPeriod,
        })),
        adjustments: input.adjustments?.map((a) => ({
          adjustmentId: a.adjustmentId,
          type: a.type,
          title: a.title,
          amount: a.amount.toString(),
        })),
        roundingPolicy: input.roundingPolicy,
      },
      reconciliation,
      warnings,
      isException: false,
      exceptionReason: null,
    };
  }
}
