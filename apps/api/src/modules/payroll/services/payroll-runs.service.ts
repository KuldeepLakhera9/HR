import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  ApprovePayrollRunDto,
  CorrectionPayrollRunDto,
  CreatePayrollRunDto,
  LockPayrollRunDto,
  PreviewScopeDto,
  QueryPayrollRunsDto,
  RejectPayrollRunDto,
  ReturnForCorrectionDto,
} from '../dto/payroll-run.dto';
import {
  DepartmentPayrollSummaryDto,
  PeriodComparisonVarianceDto,
  PayrollRunReviewSummaryDto,
} from '@hrms/types';

import { PayrollCalculationEngineService } from './payroll-calculation-engine.service';
import { PayrollInputsService } from './payroll-inputs.service';
import { PayrollValidationService } from './payroll-validation.service';

@Injectable()
export class PayrollRunsService {
  private readonly logger = new Logger(PayrollRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly calculationEngine: PayrollCalculationEngineService,
    private readonly payrollInputs: PayrollInputsService,
    private readonly validationService: PayrollValidationService,
  ) {}

  /**
   * Resolve eligible employees matching scope filter
   */
  async resolveEligibleEmployees(
    organizationId: string,
    scope = 'ALL',
    scopeConfig?: Record<string, any>,
  ) {
    const where: Prisma.EmployeeWhereInput = {
      organizationId,
      status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
    };

    if (scope.startsWith('BRANCH:') || scopeConfig?.branchId) {
      const branchId = scopeConfig?.branchId || scope.split(':')[1];
      where.employment = { ...((where.employment as object) || {}), branchId };
    } else if (scope.startsWith('DEPARTMENT:') || scopeConfig?.departmentId) {
      const departmentId = scopeConfig?.departmentId || scope.split(':')[1];
      where.employment = {
        ...((where.employment as object) || {}),
        departmentId,
      };
    } else if (scopeConfig?.employeeIds && scopeConfig.employeeIds.length > 0) {
      where.id = { in: scopeConfig.employeeIds };
    }

    if (scopeConfig?.employmentType) {
      where.employment = {
        ...((where.employment as object) || {}),
        employmentType: scopeConfig.employmentType,
      };
    }

    return this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeCode: true,
        displayName: true,
        firstName: true,
        lastName: true,
        status: true,
        employment: {
          select: {
            branch: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { employeeCode: 'asc' },
    });
  }

  /**
   * Preview employee scope eligibility
   */
  async previewScope(organizationId: string, dto: PreviewScopeDto) {
    const employees = await this.resolveEligibleEmployees(
      organizationId,
      dto.scope || 'ALL',
      dto.scopeConfig,
    );

    let periodStartDate = new Date();
    let periodEndDate = new Date();

    if (dto.periodId) {
      const period = await this.prisma.payrollPeriod.findUnique({
        where: { id: dto.periodId },
      });
      if (period) {
        periodStartDate = period.startDate;
        periodEndDate = period.endDate;
      }
    }

    // Batch query active approved compensation for sample preview employees (avoid N+1 queries)
    const sampleEmpSlice = employees.slice(0, 15);
    const sampleEmpIds = sampleEmpSlice.map((emp) => emp.id);

    const activeCompensations = await this.prisma.employeeCompensation.findMany({
      where: {
        employeeId: { in: sampleEmpIds },
        status: 'APPROVED',
        effectiveFrom: { lte: periodEndDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStartDate } }],
      },
      select: { employeeId: true },
    });
    const compensatedEmpIds = new Set(activeCompensations.map((c) => c.employeeId));

    const sampleEmployees = sampleEmpSlice.map((emp) => ({
      id: emp.id,
      employeeCode: emp.employeeCode,
      displayName: emp.displayName,
      branch: emp.employment?.branch?.name || null,
      department: emp.employment?.department?.name || null,
      designation: emp.employment?.designation?.title || null,
      hasActiveCompensation: compensatedEmpIds.has(emp.id),
    }));

    return {
      scope: dto.scope || 'ALL',
      eligibleCount: employees.length,
      sampleEmployees,
    };
  }

  /**
   * Create a new payroll run in DRAFT status
   */
  async create(organizationId: string, dto: CreatePayrollRunDto, actorId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: dto.periodId, organizationId },
    });

    if (!period) {
      throw new NotFoundException(`Payroll period ${dto.periodId} not found.`);
    }

    if (period.status === 'CLOSED') {
      throw new BadRequestException('Cannot create a run in a closed payroll period.');
    }

    const scope = dto.scope || 'ALL';

    // Duplicate-run prevention: Check for active run with same period and scope
    const existingActiveRun = await this.prisma.payrollRun.findFirst({
      where: {
        organizationId,
        periodId: dto.periodId,
        scope,
        status: {
          in: ['DRAFT', 'CALCULATING', 'REVIEW_PENDING', 'APPROVED'],
        },
      },
    });

    if (existingActiveRun) {
      throw new ConflictException(
        `An active payroll run ('${existingActiveRun.title}') already exists for this period and scope in status '${existingActiveRun.status}'. Complete, lock, or cancel it before creating another run.`,
      );
    }

    // Resolve max runNumber for this period
    const highestRun = await this.prisma.payrollRun.findFirst({
      where: { organizationId, periodId: dto.periodId },
      orderBy: { runNumber: 'desc' },
      select: { runNumber: true },
    });
    const runNumber = (highestRun?.runNumber || 0) + 1;

    const eligibleEmployees = await this.resolveEligibleEmployees(
      organizationId,
      scope,
      dto.scopeConfig,
    );

    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payrollRun.create({
        data: {
          organizationId,
          createdById: actorId,
          periodId: dto.periodId,
          runNumber,
          scope,
          scopeConfig: dto.scopeConfig ? (dto.scopeConfig as any) : undefined,
          calculationVersion: 1,
          title: dto.title,
          status: 'DRAFT',
          totalEmployees: eligibleEmployees.length,
          notes: dto.notes,
        },
      });

      await tx.payrollApprovalHistory.create({
        data: {
          payrollRunId: created.id,
          actorId,
          action: 'CREATED',
          comments: 'Payroll run initialized in DRAFT status',
          previousStatus: null,
          newStatus: 'DRAFT',
        },
      });

      return created;
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_RUN_CREATED',
      entity: 'PayrollRun',
      entityId: run.id,
      metadata: {
        periodId: run.periodId,
        runNumber: run.runNumber,
        title: run.title,
        scope: run.scope,
        totalEmployees: run.totalEmployees,
      },
    });

    this.logger.log(`Created payroll run ${run.title} (${run.id})`);
    return run;
  }

  /**
   * Find paginated list of runs
   */
  async findAll(organizationId: string, query: QueryPayrollRunsDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PayrollRunWhereInput = { organizationId };

    if (query.periodId) {
      where.periodId = query.periodId;
    }
    if (query.status) {
      where.status = query.status as any;
    }
    if (query.scope) {
      where.scope = query.scope;
    }

    const [total, runs] = await Promise.all([
      this.prisma.payrollRun.count({ where }),
      this.prisma.payrollRun.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          period: {
            select: {
              id: true,
              year: true,
              month: true,
              startDate: true,
              endDate: true,
              status: true,
            },
          },
          approvedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          lockedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    return {
      data: runs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find run by ID with approval history and totals
   */
  async findById(organizationId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, organizationId },
      include: {
        period: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        lockedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        publishedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        parentRun: {
          select: { id: true, title: true, runNumber: true, status: true },
        },
        correctionRuns: {
          select: {
            id: true,
            title: true,
            runNumber: true,
            status: true,
            createdAt: true,
          },
        },
        approvalHistories: {
          orderBy: { createdAt: 'desc' },
          include: {
            actor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: { snapshots: true },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run ${id} not found.`);
    }

    return run;
  }

  /**
   * Calculate/Orchestrate payroll run snapshots
   */
  async calculate(organizationId: string, runId: string, actorId: string) {
    const run = await this.findById(organizationId, runId);

    // Explicit State Machine Validation
    if (run.status === 'CALCULATING') {
      throw new ConflictException('A calculation is already in progress for this run.');
    }

    if (
      run.status === 'APPROVED' ||
      run.status === 'LOCKED' ||
      run.status === 'PUBLISHED' ||
      run.status === 'PAID'
    ) {
      throw new BadRequestException(`Cannot calculate run in immutable status '${run.status}'.`);
    }

    if (run.status === 'CANCELLED') {
      throw new BadRequestException('Cannot calculate a cancelled payroll run.');
    }

    // Must be DRAFT or REVIEW_PENDING (recalculation)
    const isRecalculation = run.status === 'REVIEW_PENDING';
    const nextCalcVersion = isRecalculation ? run.calculationVersion + 1 : run.calculationVersion;

    // Transition state to CALCULATING
    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'CALCULATING',
        calculationVersion: nextCalcVersion,
      },
    });

    try {
      const eligibleEmployees = await this.resolveEligibleEmployees(
        organizationId,
        run.scope,
        (run.scopeConfig as any) || undefined,
      );

      const period = run.period;
      const periodStartDate = period.startDate;
      const periodEndDate = period.endDate;
      const totalCalendarDays = period.totalDays;

      // Clean up prior draft snapshots if recalculating
      if (isRecalculation) {
        await this.prisma.employeePayrollSnapshot.deleteMany({
          where: { payrollRunId: runId },
        });
      }

      let runGross = new Prisma.Decimal(0);
      let runDeductions = new Prisma.Decimal(0);
      let runNet = new Prisma.Decimal(0);
      let runEmployerCost = new Prisma.Decimal(0);
      let exceptionCount = 0;
      const exceptionsList: any[] = [];

      // Batch pre-fetch compensations and adjustments for all eligible employees (O(1) lookups vs O(N) database queries)
      const eligibleEmployeeIds = eligibleEmployees.map((e) => e.id);

      const allCompensations = await this.prisma.employeeCompensation.findMany({
        where: {
          employeeId: { in: eligibleEmployeeIds },
          status: 'APPROVED',
          effectiveFrom: { lte: periodEndDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStartDate } }],
        },
        include: {
          structure: true,
          items: {
            include: { component: true },
          },
        },
        orderBy: { effectiveFrom: 'asc' },
      });

      const compensationsByEmployee = new Map<string, typeof allCompensations>();
      for (const comp of allCompensations) {
        const list = compensationsByEmployee.get(comp.employeeId) || [];
        list.push(comp);
        compensationsByEmployee.set(comp.employeeId, list);
      }

      const allAdjustments = await this.prisma.payrollAdjustment.findMany({
        where: {
          organizationId,
          employeeId: { in: eligibleEmployeeIds },
          periodId: period.id,
          status: 'APPROVED',
        },
      });

      const adjustmentsByEmployee = new Map<string, typeof allAdjustments>();
      for (const adj of allAdjustments) {
        const list = adjustmentsByEmployee.get(adj.employeeId) || [];
        list.push(adj);
        adjustmentsByEmployee.set(adj.employeeId, list);
      }

      // Process eligible employees using dedicated calculation engine
      for (const emp of eligibleEmployees) {
        const compensations = compensationsByEmployee.get(emp.id) || [];
        const adjustments = adjustmentsByEmployee.get(emp.id) || [];

        // Build compensation segment inputs
        const compensationSegments = compensations.map((comp) => {
          // Calculate overlap days within period
          const segStart =
            comp.effectiveFrom > periodStartDate ? comp.effectiveFrom : periodStartDate;
          const segEnd =
            comp.effectiveTo && comp.effectiveTo < periodEndDate ? comp.effectiveTo : periodEndDate;
          const diffMs = Math.abs(segEnd.getTime() - segStart.getTime());
          const activeDaysInPeriod = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

          return {
            compensationId: comp.id,
            structureId: comp.structureId,
            structureName: comp.structure?.name,
            structureVersion: comp.structure?.version,
            currency: comp.structure?.currency || 'INR',
            ctcAnnual: comp.ctcAnnual,
            grossMonthly: comp.grossMonthly,
            effectiveFrom: comp.effectiveFrom,
            effectiveTo: comp.effectiveTo,
            activeDaysInPeriod,
            segmentStartDate: segStart,
            segmentEndDate: segEnd,
            items: comp.items.map((item) => ({
              componentId: item.componentId,
              componentCode: item.component?.code || 'UNKNOWN',
              componentName: item.component?.name || 'Component',
              type: (item.component?.type as any) || 'EARNING',
              calculationType: (item.component?.calculationType as any) || 'FLAT_AMOUNT',
              amountOrPercentage: item.monthlyAmount,
              formula: item.component?.formula,
              isProRataApplicable: item.component?.isProRataApplicable ?? true,
              isStatutory: item.component?.isStatutory ?? false,
              affectsNetSalary: item.component?.affectsNetSalary ?? true,
              displayOrder: item.component?.displayOrder ?? 0,
            })),
          };
        });

        // 1. Obtain canonical work summary (attendance, leave, WFH, visits, holidays, shifts, lifecycle boundaries)
        const workSummary = await this.payrollInputs.getEmployeeWorkSummary(
          organizationId,
          emp.id,
          period,
        );

        // 2. Delegate calculation to domain service
        const calcOutput = this.calculationEngine.calculateEmployeePayroll(
          {
            employeeId: emp.id,
            employeeCode: emp.employeeCode,
            employeeName: emp.displayName,
            departmentName: emp.employment?.department?.name,
            designationTitle: emp.employment?.designation?.title,
            branchName: emp.employment?.branch?.name,
            period: {
              id: period.id,
              year: period.year,
              month: period.month,
              startDate: period.startDate,
              endDate: period.endDate,
              totalDays: period.totalDays,
            },
            calendarDays: workSummary.totalCalendarDays,
            workingDays: workSummary.expectedWorkdays,
            paidDays: workSummary.paidDays,
            lopDays: workSummary.lopDays,
            compensations: compensationSegments,
            adjustments: adjustments.map((adj) => ({
              adjustmentId: adj.id,
              type: adj.type as any,
              title: adj.title,
              amount: adj.amount,
              isTaxable: adj.isTaxable,
            })),
          },
          run.runNumber,
          nextCalcVersion,
        );

        runGross = runGross.plus(calcOutput.earnedGross);
        runDeductions = runDeductions.plus(calcOutput.totalEmployeeDeductions);
        runNet = runNet.plus(calcOutput.netSalary);
        runEmployerCost = runEmployerCost.plus(calcOutput.totalEmployerContributions);

        const isSnapshotException = calcOutput.isException || workSummary.isException;
        const exceptionReasonText = calcOutput.exceptionReason || workSummary.exceptionReason;

        if (isSnapshotException) {
          exceptionCount++;
          exceptionsList.push({
            employeeId: emp.id,
            employeeCode: emp.employeeCode,
            displayName: emp.displayName,
            reason: exceptionReasonText,
          });
        }

        // Persist reproducible snapshot with line items and canonical work summary
        await this.prisma.employeePayrollSnapshot.create({
          data: {
            organizationId,
            payrollRunId: runId,
            employeeId: emp.id,
            payslipNumber: calcOutput.payslipNumber,
            payslipStatus: 'GENERATED',
            employeeCode: calcOutput.employeeCode,
            employeeName: calcOutput.employeeName,
            departmentName: emp.employment?.department?.name || null,
            designationTitle: emp.employment?.designation?.title || null,
            branchName: emp.employment?.branch?.name || null,
            calendarDays: calcOutput.calendarDays,
            workingDays: calcOutput.workingDays,
            paidDays: calcOutput.paidDays,
            lopDays: calcOutput.lopDays,
            baseMonthlyGross: calcOutput.baseMonthlyGross,
            earnedGross: calcOutput.earnedGross,
            totalDeductions: calcOutput.totalEmployeeDeductions,
            netSalary: calcOutput.netSalary,
            roundingAdjustment: calcOutput.roundingAdjustment,
            currency: calcOutput.currency,
            calculationInputSnapshot: {
              ...(calcOutput.calculationInputSnapshot as any),
              totalEmployerContributions: Number(calcOutput.totalEmployerContributions),
              workSummary,
            },
            isException: isSnapshotException,
            exceptionReason: exceptionReasonText,
            items: {
              create: calcOutput.items.map((it) => ({
                componentId: it.componentId || null,
                componentCode: it.componentCode,
                componentName: it.componentName,
                type: it.type,
                standardAmount: it.standardAmount,
                earnedAmount: it.earnedAmount,
                displayOrder: it.displayOrder,
              })),
            },
          },
        });

        // Link adjustments to this run
        if (adjustments.length > 0) {
          await this.prisma.payrollAdjustment.updateMany({
            where: { id: { in: adjustments.map((a) => a.id) } },
            data: { payrollRunId: runId },
          });
        }
      }

      // Run deterministic Phase 11.7 payroll validation and exception detection
      const validationSummary = await this.validationService.validateRun(organizationId, runId);

      // Transition to REVIEW_PENDING and update totals
      const updatedRun = await this.prisma.$transaction(async (tx) => {
        const r = await tx.payrollRun.update({
          where: { id: runId },
          data: {
            status: 'REVIEW_PENDING',
            totalEmployees: eligibleEmployees.length,
            totalGross: runGross,
            totalDeductions: runDeductions,
            totalNet: runNet,
            totalEmployerCost: runEmployerCost,
            calculatedAt: new Date(),
            exceptionCount: Math.max(validationSummary?.total ?? 0, exceptionCount),
            exceptions: exceptionsList.length > 0 ? (exceptionsList as any) : undefined,
          },
        });

        await tx.payrollApprovalHistory.create({
          data: {
            payrollRunId: runId,
            actorId,
            action: isRecalculation ? 'RECALCULATED' : 'CALCULATED',
            comments: `Calculated ${eligibleEmployees.length} employees with ${validationSummary.total} exception(s) (${validationSummary.blockingErrors} blocking, ${validationSummary.warnings} warnings)`,
            previousStatus: 'CALCULATING',
            newStatus: 'REVIEW_PENDING',
          },
        });

        return r;
      });

      this.logger.log(`Calculation finished for run ${runId} (status: REVIEW_PENDING)`);
      return updatedRun;
    } catch (err: any) {
      this.logger.error(`Calculation failed for run ${runId}: ${err.message}`, err.stack);

      // Safe Failure Recovery: Rollback status back to DRAFT with error log
      await this.prisma.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'DRAFT',
          calculationLog: {
            error: err.message,
            failedAt: new Date().toISOString(),
          },
        },
      });

      throw new BadRequestException(
        `Payroll calculation failed: ${err.message}. Run reset to DRAFT for safe retry.`,
      );
    }
  }

  /**
   * Safe retry calculation
   */
  async retry(organizationId: string, runId: string, actorId: string) {
    const run = await this.findById(organizationId, runId);
    if (run.status !== 'DRAFT') {
      throw new BadRequestException(
        `Can only retry calculation from DRAFT status. Current status is ${run.status}.`,
      );
    }
    return this.calculate(organizationId, runId, actorId);
  }

  /**
   * Recalculate pre-lock run
   */
  async recalculate(organizationId: string, runId: string, actorId: string) {
    const run = await this.findById(organizationId, runId);
    if (run.status !== 'REVIEW_PENDING') {
      throw new BadRequestException(
        `Can only recalculate from REVIEW_PENDING status. Current status is ${run.status}.`,
      );
    }
    return this.calculate(organizationId, runId, actorId);
  }

  /**
   * Re-run validation rules on a payroll run
   */
  async revalidate(organizationId: string, runId: string) {
    const run = await this.findById(organizationId, runId);
    if (run.status === 'LOCKED' || run.status === 'PUBLISHED' || run.status === 'PAID') {
      throw new BadRequestException(`Cannot revalidate run in finalized status '${run.status}'.`);
    }
    return this.validationService.validateRun(organizationId, runId);
  }

  /**
   * Approve run
   */
  async approve(
    organizationId: string,
    runId: string,
    dto: ApprovePayrollRunDto,
    actorId: string,
    userPermissions?: string[],
  ) {
    const run = await this.findById(organizationId, runId);

    // Permitted state transitions validation: must be REVIEW_PENDING
    if (run.status !== 'REVIEW_PENDING') {
      throw new BadRequestException(
        `Cannot approve run in status '${run.status}'. Must be in 'REVIEW_PENDING'.`,
      );
    }

    // Explicit approver permission validation
    if (userPermissions && !userPermissions.includes('PAYROLL_APPROVE')) {
      throw new ForbiddenException(
        'Unauthorized: Approving payroll runs strictly requires PAYROLL_APPROVE permission.',
      );
    }

    // Separation of Duties & Self-Approval Prevention
    if (run.createdById && run.createdById === actorId) {
      throw new BadRequestException(
        'Separation of duties violation: A user cannot approve a payroll run they created. Independent approval is required.',
      );
    }

    // Check if the actor was the calculator
    const lastCalc =
      typeof this.prisma.payrollApprovalHistory?.findFirst === 'function'
        ? await this.prisma.payrollApprovalHistory.findFirst({
            where: {
              payrollRunId: runId,
              action: { in: ['CALCULATED', 'RECALCULATED'] },
            },
            orderBy: { createdAt: 'desc' },
          })
        : null;
    if (lastCalc && lastCalc.actorId === actorId) {
      throw new BadRequestException(
        'Separation of duties violation: The user who calculated this payroll run cannot approve it. Independent approval is required.',
      );
    }

    // Required Behavior 2: Prevent approval when blocking errors remain
    const exceptionsSummary = await this.validationService.getExceptionsSummary(
      organizationId,
      runId,
    );
    if (exceptionsSummary.hasBlockingErrors) {
      throw new BadRequestException(
        `Cannot approve payroll run: ${exceptionsSummary.blockingErrors} unresolved blocking error(s) must be resolved first.`,
      );
    }

    // Requirement 6: Require recalculation and re-review when material payroll inputs change before finalization
    // 1. Check late attendance/leave changes
    const lateChanges = await this.payrollInputs.detectLateSourceChanges(organizationId, runId);
    if (lateChanges && lateChanges.totalLateChanges > 0) {
      throw new BadRequestException(
        `Cannot approve payroll run: Material attendance/leave changes (${lateChanges.totalLateChanges}) detected since last calculation. Recalculation and re-review required before approval.`,
      );
    }

    // 2. Check if new or modified approved adjustments exist after run.calculatedAt
    if (run.calculatedAt) {
      const lateAdjustments = await this.prisma.payrollAdjustment.count({
        where: {
          organizationId,
          periodId: run.periodId,
          status: 'APPROVED',
          updatedAt: { gt: run.calculatedAt },
        },
      });
      if (lateAdjustments > 0) {
        throw new BadRequestException(
          `Cannot approve payroll run: ${lateAdjustments} payroll adjustment(s) were added or modified since last calculation. Recalculation and re-review required before approval.`,
        );
      }

      // 3. Check if compensation revisions were approved after run.calculatedAt
      const lateComp = await this.prisma.employeeCompensation.count({
        where: {
          employee: { organizationId },
          status: 'APPROVED',
          updatedAt: { gt: run.calculatedAt },
        },
      });
      if (lateComp > 0) {
        throw new BadRequestException(
          'Cannot approve payroll run: Employee compensation master records were modified since last calculation. Recalculation and re-review required before approval.',
        );
      }
    }

    // Concurrency control: Atomic check & update within transaction
    const unresolvedWarningsNote =
      exceptionsSummary.warnings > 0
        ? `Preserved ${exceptionsSummary.warnings} unresolved review warning(s).`
        : '';
    const comments = dto.comments
      ? unresolvedWarningsNote
        ? `${dto.comments} | ${unresolvedWarningsNote}`
        : dto.comments
      : unresolvedWarningsNote || 'Payroll run approved';

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = (typeof tx.payrollRun.findUnique === 'function' &&
        (await tx.payrollRun.findUnique({
          where: { id: runId },
          select: { status: true },
        }))) ||
        (typeof tx.payrollRun.findFirst === 'function' &&
          (await tx.payrollRun.findFirst({
            where: { id: runId },
            select: { status: true },
          }))) || { status: run.status };
      if (!current || current.status !== 'REVIEW_PENDING') {
        throw new ConflictException(
          `Cannot approve payroll run: Current status is '${current?.status}'. Concurrently modified.`,
        );
      }

      const r = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: actorId,
        },
      });

      await tx.payrollApprovalHistory.create({
        data: {
          payrollRunId: runId,
          actorId,
          action: 'APPROVED',
          comments,
          previousStatus: 'REVIEW_PENDING',
          newStatus: 'APPROVED',
        },
      });

      return r;
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_RUN_APPROVED',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: {
        status: 'APPROVED',
        comments: dto.comments,
        unresolvedWarningsCount: exceptionsSummary.warnings,
        unresolvedInfoCount: exceptionsSummary.information,
        unresolvedExceptionsPreserved: exceptionsSummary.unresolvedWarnings || [],
      },
    });

    return updated;
  }

  /**
   * Reject run back to DRAFT
   */
  async reject(organizationId: string, runId: string, dto: RejectPayrollRunDto, actorId: string) {
    const run = await this.findById(organizationId, runId);

    if (run.status !== 'REVIEW_PENDING') {
      throw new BadRequestException(
        `Cannot reject run in status '${run.status}'. Must be in 'REVIEW_PENDING'.`,
      );
    }

    if (!dto.rejectionReason || dto.rejectionReason.trim().length === 0) {
      throw new BadRequestException('Rejection reason is required.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = (typeof tx.payrollRun.findUnique === 'function' &&
        (await tx.payrollRun.findUnique({
          where: { id: runId },
          select: { status: true },
        }))) ||
        (typeof tx.payrollRun.findFirst === 'function' &&
          (await tx.payrollRun.findFirst({
            where: { id: runId },
            select: { status: true },
          }))) || { status: run.status };
      if (!current || current.status !== 'REVIEW_PENDING') {
        throw new ConflictException(
          `Cannot reject payroll run: Current status is '${current?.status}'. Concurrently modified.`,
        );
      }

      const r = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'DRAFT',
        },
      });

      await tx.payrollApprovalHistory.create({
        data: {
          payrollRunId: runId,
          actorId,
          action: 'REJECTED',
          comments: dto.rejectionReason,
          previousStatus: 'REVIEW_PENDING',
          newStatus: 'DRAFT',
        },
      });

      return r;
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_RUN_REJECTED',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: { status: 'DRAFT', reason: dto.rejectionReason },
    });

    return updated;
  }

  /**
   * Return approved run for correction back to REVIEW_PENDING (pre-lock)
   */
  async returnForCorrection(
    organizationId: string,
    runId: string,
    dto: ReturnForCorrectionDto,
    actorId: string,
  ) {
    const run = await this.findById(organizationId, runId);

    if (run.status !== 'APPROVED') {
      throw new BadRequestException(
        `Cannot return run for correction: Only runs in 'APPROVED' status can be returned for correction. Current status is '${run.status}'.`,
      );
    }

    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException(
        'A reason must be provided when returning a payroll run for correction.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.payrollRun.findUnique({
        where: { id: runId },
        select: { status: true },
      });
      if (!current || current.status !== 'APPROVED') {
        throw new ConflictException(
          `Cannot return payroll run for correction: Current status is '${current?.status}'. Concurrently modified.`,
        );
      }

      const r = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'REVIEW_PENDING',
          approvedAt: null,
          approvedById: null,
        },
      });

      await tx.payrollApprovalHistory.create({
        data: {
          payrollRunId: runId,
          actorId,
          action: 'RETURNED_FOR_CORRECTION',
          comments: dto.notes ? `${dto.reason} (${dto.notes})` : dto.reason,
          previousStatus: 'APPROVED',
          newStatus: 'REVIEW_PENDING',
        },
      });

      return r;
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_RUN_RETURNED_FOR_CORRECTION',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: {
        status: 'REVIEW_PENDING',
        reason: dto.reason,
        notes: dto.notes,
      },
    });

    return updated;
  }

  /**
   * Lock run - finalized and immutable
   */
  async lock(organizationId: string, runId: string, dto: LockPayrollRunDto, actorId: string) {
    const run = await this.findById(organizationId, runId);

    if (run.status !== 'APPROVED') {
      throw new BadRequestException(
        `Cannot lock run in status '${run.status}'. Must be in 'APPROVED' status.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = (typeof tx.payrollRun.findUnique === 'function' &&
        (await tx.payrollRun.findUnique({
          where: { id: runId },
          select: { status: true },
        }))) ||
        (typeof tx.payrollRun.findFirst === 'function' &&
          (await tx.payrollRun.findFirst({
            where: { id: runId },
            select: { status: true },
          }))) || { status: run.status };
      if (!current || current.status !== 'APPROVED') {
        throw new ConflictException(
          `Cannot lock payroll run: Current status is '${current?.status}'. Concurrently modified.`,
        );
      }

      const r = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'LOCKED',
          lockedAt: new Date(),
          lockedById: actorId,
          notes: dto.notes ? `${run.notes || ''}\nLock note: ${dto.notes}` : run.notes,
        },
      });

      await tx.payrollApprovalHistory.create({
        data: {
          payrollRunId: runId,
          actorId,
          action: 'LOCKED',
          comments: dto.notes || 'Payroll run locked and finalized',
          previousStatus: 'APPROVED',
          newStatus: 'LOCKED',
        },
      });

      return r;
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_RUN_LOCKED',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: { status: 'LOCKED', lockedAt: updated.lockedAt },
    });

    return updated;
  }

  /**
   * Publish payslips to employee portal
   */
  async publish(organizationId: string, runId: string, actorId: string) {
    const run = await this.findById(organizationId, runId);

    if (run.status !== 'LOCKED') {
      throw new BadRequestException(
        `Cannot publish run in status '${run.status}'. Run must be 'LOCKED' before publishing payslips.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const r = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          publishedById: actorId,
        },
      });

      // Update all snapshot payslipStatus to PUBLISHED
      await tx.employeePayrollSnapshot.updateMany({
        where: { payrollRunId: runId },
        data: {
          payslipStatus: 'PUBLISHED',
          publishedAt: now,
        },
      });

      await tx.payrollApprovalHistory.create({
        data: {
          payrollRunId: runId,
          actorId,
          action: 'PUBLISHED',
          comments: 'Payslips published to employee portal',
          previousStatus: 'LOCKED',
          newStatus: 'PUBLISHED',
        },
      });

      return r;
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_RUN_PUBLISHED',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: { status: 'PUBLISHED', publishedAt: updated.publishedAt },
    });

    this.logger.log(`Published payslips for run ${runId}`);
    return updated;
  }

  /**
   * Cancel run
   */
  async cancel(organizationId: string, runId: string, reason: string, actorId: string) {
    const run = await this.findById(organizationId, runId);

    if (run.status === 'LOCKED' || run.status === 'PUBLISHED' || run.status === 'PAID') {
      throw new BadRequestException(
        `Cannot cancel run in finalized status '${run.status}'. Use correction workflow instead.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.payrollRun.update({
        where: { id: runId },
        data: { status: 'CANCELLED' },
      });

      await tx.payrollApprovalHistory.create({
        data: {
          payrollRunId: runId,
          actorId,
          action: 'CANCELLED',
          comments: reason || 'Payroll run cancelled',
          previousStatus: run.status,
          newStatus: 'CANCELLED',
        },
      });

      return r;
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_RUN_CANCELLED',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: { status: 'CANCELLED', reason },
    });

    return updated;
  }

  /**
   * Create an authorized correction run for a locked run
   */
  async createCorrectionRun(
    organizationId: string,
    parentRunId: string,
    dto: CorrectionPayrollRunDto,
    actorId: string,
  ) {
    const parentRun = await this.findById(organizationId, parentRunId);

    if (parentRun.status !== 'LOCKED' && parentRun.status !== 'PUBLISHED') {
      throw new BadRequestException(
        `Correction run can only be created for LOCKED or PUBLISHED runs. Current status: ${parentRun.status}.`,
      );
    }

    // Get max runNumber for this period
    const highestRun = await this.prisma.payrollRun.findFirst({
      where: { organizationId, periodId: parentRun.periodId },
      orderBy: { runNumber: 'desc' },
      select: { runNumber: true },
    });
    const runNumber = (highestRun?.runNumber || parentRun.runNumber) + 1;

    const correctionRun = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payrollRun.create({
        data: {
          organizationId,
          periodId: parentRun.periodId,
          parentRunId: parentRun.id,
          runNumber,
          scope: parentRun.scope,
          scopeConfig: parentRun.scopeConfig ? (parentRun.scopeConfig as any) : undefined,
          calculationVersion: 1,
          title: `Correction: ${parentRun.title} (Run #${runNumber})`,
          status: 'DRAFT',
          createdById: actorId,
          correctionReason: dto.correctionReason,
          notes: dto.notes,
          totalEmployees: parentRun.totalEmployees,
        },
      });

      await tx.payrollApprovalHistory.create({
        data: {
          payrollRunId: created.id,
          actorId,
          action: 'CORRECTION_CREATED',
          comments: `Correction run created for parent run ${parentRun.id}. Reason: ${dto.correctionReason}`,
          previousStatus: null,
          newStatus: 'DRAFT',
        },
      });

      return created;
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_CORRECTION_RUN_CREATED',
      entity: 'PayrollRun',
      entityId: correctionRun.id,
      metadata: {
        parentRunId: parentRun.id,
        runNumber: correctionRun.runNumber,
        correctionReason: dto.correctionReason,
      },
    });

    this.logger.log(`Created correction run ${correctionRun.id} for parent ${parentRun.id}`);
    return correctionRun;
  }

  /**
   * Get employee snapshots for a run
   */
  async getSnapshots(
    organizationId: string,
    runId: string,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      isException?: boolean;
    },
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeePayrollSnapshotWhereInput = {
      organizationId,
      payrollRunId: runId,
    };

    if (query.isException !== undefined) {
      where.isException = query.isException;
    }

    if (query.search) {
      where.OR = [
        { employeeCode: { contains: query.search, mode: 'insensitive' } },
        { employeeName: { contains: query.search, mode: 'insensitive' } },
        { payslipNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, snapshots] = await Promise.all([
      this.prisma.employeePayrollSnapshot.count({ where }),
      this.prisma.employeePayrollSnapshot.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isException: 'desc' }, { employeeCode: 'asc' }],
        include: {
          items: {
            orderBy: { displayOrder: 'asc' },
          },
        },
      }),
    ]);

    return {
      data: snapshots,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get calculation detail and breakdown for a single snapshot
   */
  async getSnapshotCalculationDetail(organizationId: string, runId: string, snapshotId: string) {
    const snapshot = await this.prisma.employeePayrollSnapshot.findFirst({
      where: { id: snapshotId, payrollRunId: runId, organizationId },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
        },
        payrollRun: {
          select: {
            id: true,
            title: true,
            status: true,
            runNumber: true,
            calculationVersion: true,
          },
        },
      },
    });

    if (!snapshot) {
      throw new NotFoundException(`Payroll snapshot ${snapshotId} not found.`);
    }

    return snapshot;
  }

  /**
   * Get period attendance & leave reconciliation report
   */
  async getAttendanceReconciliation(organizationId: string, runId: string) {
    return this.payrollInputs.getPayrollAttendanceReconciliation(organizationId, runId);
  }

  /**
   * Detect late-arriving changes to attendance, leave, WFH, or visits
   */
  async getLateSourceChanges(organizationId: string, runId: string) {
    return this.payrollInputs.detectLateSourceChanges(organizationId, runId);
  }

  /**
   * Asserts that a run is not locked or finalized. Any attempt to modify,
   * recalculate, or edit snapshots on a locked run is strictly prohibited.
   */
  assertRunNotLocked(run: { status: string }) {
    if (run.status === 'LOCKED' || run.status === 'PUBLISHED' || run.status === 'PAID') {
      throw new BadRequestException(
        `Payroll run is finalized and immutable (status: '${run.status}'). Post-lock edits and recalculations are strictly prohibited. Initiate an authorized correction run instead.`,
      );
    }
  }

  /**
   * Attempted post-lock edit prevention for individual snapshots
   */
  async updateSnapshot(organizationId: string, runId: string, snapshotId: string, data: any) {
    const run = await this.findById(organizationId, runId);
    this.assertRunNotLocked(run);
    return this.prisma.employeePayrollSnapshot.update({
      where: { id: snapshotId, payrollRunId: runId, organizationId },
      data,
    });
  }

  /**
   * Get comprehensive payroll review summary and audit statistics
   */
  async getReviewSummary(
    organizationId: string,
    runId: string,
    currentUserId?: string,
  ): Promise<PayrollRunReviewSummaryDto> {
    const run = await this.findById(organizationId, runId);

    // Fetch snapshots with items and employee department
    const snapshots = await this.prisma.employeePayrollSnapshot.findMany({
      where: { organizationId, payrollRunId: runId },
      include: {
        items: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            displayName: true,
            employment: {
              select: {
                department: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    // Department-level breakdown & employer cost
    const deptMap = new Map<string, DepartmentPayrollSummaryDto>();
    let totalEmployerCostDec = new Prisma.Decimal(0);

    for (const snap of snapshots) {
      const deptName =
        snap.departmentName || snap.employee?.employment?.department?.name || 'General';
      let dept = deptMap.get(deptName);
      if (!dept) {
        dept = {
          departmentId: snap.employee?.employment?.department?.id || null,
          departmentName: deptName,
          employeeCount: 0,
          totalGross: 0,
          totalDeductions: 0,
          totalNet: 0,
          totalEmployerCost: 0,
        };
        deptMap.set(deptName, dept);
      }
      dept.employeeCount += 1;
      dept.totalGross = Math.round((dept.totalGross + Number(snap.earnedGross)) * 100) / 100;
      dept.totalDeductions =
        Math.round((dept.totalDeductions + Number(snap.totalDeductions)) * 100) / 100;
      dept.totalNet = Math.round((dept.totalNet + Number(snap.netSalary)) * 100) / 100;

      const snapEmployerCost = Number(
        (snap.calculationInputSnapshot as any)?.totalEmployerContributions || 0,
      );

      dept.totalEmployerCost = Math.round((dept.totalEmployerCost + snapEmployerCost) * 100) / 100;
      totalEmployerCostDec = totalEmployerCostDec.plus(new Prisma.Decimal(snapEmployerCost));
    }

    const departments = Array.from(deptMap.values()).sort((a, b) =>
      a.departmentName.localeCompare(b.departmentName),
    );

    const runEmployerCost =
      Number(run.totalEmployerCost) > 0
        ? Number(run.totalEmployerCost)
        : Number(totalEmployerCostDec);

    // Comparison with previous comparable period
    const previousRun = await this.prisma.payrollRun.findFirst({
      where: {
        organizationId,
        id: { not: runId },
        period: {
          endDate: { lte: run.period.startDate },
        },
        status: { in: ['APPROVED', 'LOCKED', 'PUBLISHED'] },
      },
      orderBy: { period: { startDate: 'desc' } },
      include: { period: true },
    });

    let comparison: PeriodComparisonVarianceDto | null = null;
    if (previousRun) {
      const prevGross = Number(previousRun.totalGross);
      const curGross = Number(run.totalGross);
      const prevNet = Number(previousRun.totalNet);
      const curNet = Number(run.totalNet);
      const prevEmpCost = Number(previousRun.totalEmployerCost);
      const curEmpCost = runEmployerCost;

      const grossDelta = curGross - prevGross;
      const grossDeltaPct = prevGross > 0 ? (grossDelta / prevGross) * 100 : 0;
      const netDelta = curNet - prevNet;
      const netDeltaPct = prevNet > 0 ? (netDelta / prevNet) * 100 : 0;
      const empCostDelta = curEmpCost - prevEmpCost;
      const empCostDeltaPct = prevEmpCost > 0 ? (empCostDelta / prevEmpCost) * 100 : 0;

      comparison = {
        previousRunId: previousRun.id,
        previousPeriodTitle: previousRun.title,
        previousHeadcount: previousRun.totalEmployees,
        currentHeadcount: run.totalEmployees,
        headcountDelta: run.totalEmployees - previousRun.totalEmployees,
        previousTotalGross: prevGross,
        currentTotalGross: curGross,
        grossDelta: Math.round(grossDelta * 100) / 100,
        grossDeltaPercentage: Math.round(grossDeltaPct * 100) / 100,
        previousTotalDeductions: Number(previousRun.totalDeductions),
        currentTotalDeductions: Number(run.totalDeductions),
        deductionsDelta:
          Math.round((Number(run.totalDeductions) - Number(previousRun.totalDeductions)) * 100) /
          100,
        previousTotalNet: prevNet,
        currentTotalNet: curNet,
        netDelta: Math.round(netDelta * 100) / 100,
        netDeltaPercentage: Math.round(netDeltaPct * 100) / 100,
        previousTotalEmployerCost: prevEmpCost,
        currentTotalEmployerCost: curEmpCost,
        employerCostDelta: Math.round(empCostDelta * 100) / 100,
        employerCostDeltaPercentage: Math.round(empCostDeltaPct * 100) / 100,
      };
    }

    // Material movements in period: joiners, exits, comp changes, manual adjustments
    const [newJoiners, exits, compChanges, adjustments] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          organizationId,
          joiningDate: {
            gte: run.period.startDate,
            lte: run.period.endDate,
          },
        },
        select: {
          id: true,
          employeeCode: true,
          displayName: true,
          joiningDate: true,
          employment: { select: { department: { select: { name: true } } } },
        },
      }),
      this.prisma.employee.findMany({
        where: {
          organizationId,
          exitDate: {
            gte: run.period.startDate,
            lte: run.period.endDate,
          },
        },
        select: {
          id: true,
          employeeCode: true,
          displayName: true,
          exitDate: true,
          employment: { select: { department: { select: { name: true } } } },
        },
      }),
      this.prisma.employeeCompensation.findMany({
        where: {
          employee: { organizationId },
          status: 'APPROVED',
          effectiveFrom: {
            gte: run.period.startDate,
            lte: run.period.endDate,
          },
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
              employment: { select: { department: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.payrollAdjustment.findMany({
        where: {
          organizationId,
          OR: [{ payrollRunId: runId }, { periodId: run.periodId, status: 'APPROVED' }],
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
            },
          },
        },
      }),
    ]);

    // Exceptions summary
    const exceptionsSummary = await this.validationService.getExceptionsSummary(
      organizationId,
      runId,
    );

    // Separation of duties status
    let canCurrentUserApprove = true;
    let selfApprovalBlocked = false;
    let sodReason: string | null = null;

    if (currentUserId) {
      if (run.createdById && run.createdById === currentUserId) {
        canCurrentUserApprove = false;
        selfApprovalBlocked = true;
        sodReason =
          'Separation of duties violation: You created this payroll run and cannot approve it. An independent approver is required.';
      } else {
        const lastCalc = await this.prisma.payrollApprovalHistory.findFirst({
          where: {
            payrollRunId: runId,
            action: { in: ['CALCULATED', 'RECALCULATED'] },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (lastCalc && lastCalc.actorId === currentUserId) {
          canCurrentUserApprove = false;
          selfApprovalBlocked = true;
          sodReason =
            'Separation of duties violation: You initiated the calculation for this payroll run and cannot approve it. An independent approver is required.';
        }
      }
    }

    return {
      runId: run.id,
      periodId: run.periodId,
      periodTitle: run.title,
      periodStartDate: run.period.startDate.toISOString(),
      periodEndDate: run.period.endDate.toISOString(),
      cutoffDate: run.period.cutoffDate ? run.period.cutoffDate.toISOString() : null,
      scope: run.scope,
      status: run.status as any,
      calculationVersion: run.calculationVersion,
      calculatedAt: run.calculatedAt ? run.calculatedAt.toISOString() : null,
      employeeCount: run.totalEmployees,
      processingStatus:
        run.status === 'PUBLISHED'
          ? 'Published to Employees'
          : run.status === 'LOCKED'
            ? 'Locked & Finalized'
            : run.status === 'APPROVED'
              ? 'Approved (Pending Lock)'
              : run.status === 'REVIEW_PENDING'
                ? 'Under Review'
                : run.status === 'CALCULATING'
                  ? 'Calculating'
                  : 'Draft',
      totals: {
        totalGross: Number(run.totalGross),
        totalDeductions: Number(run.totalDeductions),
        totalNet: Number(run.totalNet),
        totalEmployerCost: runEmployerCost,
      },
      validationStatus: {
        blockingErrorCount: exceptionsSummary.blockingErrors,
        warningCount: exceptionsSummary.warnings,
        hasBlockingErrors: exceptionsSummary.hasBlockingErrors,
      },
      separationOfDuties: {
        createdById: run.createdById,
        createdByName: run.createdBy
          ? `${run.createdBy.firstName} ${run.createdBy.lastName}`
          : null,
        canCurrentUserApprove,
        selfApprovalBlocked,
        reason: sodReason,
      },
      departments,
      comparison,
      movements: {
        newJoiners: newJoiners.map((j) => ({
          id: j.id,
          employeeCode: j.employeeCode,
          name: j.displayName,
          department: j.employment?.department?.name || null,
          joiningDate: j.joiningDate ? j.joiningDate.toISOString() : '',
        })),
        exits: exits.map((e) => ({
          id: e.id,
          employeeCode: e.employeeCode,
          name: e.displayName,
          department: e.employment?.department?.name || null,
          leavingDate: e.exitDate ? e.exitDate.toISOString() : '',
        })),
        compensationChanges: compChanges.map((c) => ({
          id: c.id,
          employeeCode: c.employee?.employeeCode || '',
          name: c.employee?.displayName || '',
          department: c.employee?.employment?.department?.name || null,
          effectiveDate: c.effectiveFrom.toISOString(),
          newMonthlyGross: Number(c.grossMonthly),
        })),
        manualAdjustments: adjustments.map((a) => ({
          id: a.id,
          employeeCode: a.employee?.employeeCode || '',
          name: a.employee?.displayName || '',
          type: a.type as any,
          title: a.title,
          amount: Number(a.amount),
        })),
      },
    };
  }
}
