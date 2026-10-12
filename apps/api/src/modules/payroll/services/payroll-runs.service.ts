import {
  BadRequestException,
  ConflictException,
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
} from '../dto/payroll-run.dto';

@Injectable()
export class PayrollRunsService {
  private readonly logger = new Logger(PayrollRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

    // Inspect if employees have active approved compensation
    const sampleEmployees = await Promise.all(
      employees.slice(0, 15).map(async (emp) => {
        const compensation = await this.prisma.employeeCompensation.findFirst({
          where: {
            employeeId: emp.id,
            status: 'APPROVED',
            effectiveFrom: { lte: periodEndDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStartDate } }],
          },
        });

        return {
          id: emp.id,
          employeeCode: emp.employeeCode,
          displayName: emp.displayName,
          branch: emp.employment?.branch?.name || null,
          department: emp.employment?.department?.name || null,
          designation: emp.employment?.designation?.title || null,
          hasActiveCompensation: Boolean(compensation),
        };
      }),
    );

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

      let runGross = 0;
      let runDeductions = 0;
      let runNet = 0;
      let exceptionCount = 0;
      const exceptionsList: any[] = [];

      // Process eligible employees
      for (const emp of eligibleEmployees) {
        // Find applicable approved compensation
        const compensation = await this.prisma.employeeCompensation.findFirst({
          where: {
            employeeId: emp.id,
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
          orderBy: { effectiveFrom: 'desc' },
        });

        const payslipNumber = `PAY-${period.year}${String(period.month).padStart(2, '0')}-${emp.employeeCode}-R${run.runNumber}V${nextCalcVersion}`;

        let earnedGross = 0;
        let totalEmpDeductions = 0;
        let netSalary = 0;
        let isException = false;
        let exceptionReason: string | null = null;
        let baseMonthlyGross = 0;

        if (!compensation) {
          isException = true;
          exceptionReason = 'No approved compensation assignment active for this period';
          exceptionCount++;
          exceptionsList.push({
            employeeId: emp.id,
            employeeCode: emp.employeeCode,
            displayName: emp.displayName,
            reason: exceptionReason,
          });
        } else {
          baseMonthlyGross = Number(compensation.grossMonthly);

          // Phase 11.4 Baseline calculation (full deterministic engine in 11.5)
          // Sum up components
          let calcEarnings = 0;
          let calcDeductions = 0;

          const snapshotItemsData: any[] = [];

          if (compensation.items && compensation.items.length > 0) {
            for (const item of compensation.items) {
              const comp = item.component;
              const stdAmount = Number(item.monthlyAmount);
              // Baseline standard amounts
              if (comp.type === 'EARNING') {
                calcEarnings += stdAmount;
              } else if (comp.type === 'DEDUCTION') {
                calcDeductions += stdAmount;
              }

              snapshotItemsData.push({
                componentId: comp.id,
                componentCode: comp.code,
                componentName: comp.name,
                type: comp.type,
                standardAmount: new Prisma.Decimal(stdAmount),
                earnedAmount: new Prisma.Decimal(stdAmount),
                displayOrder: comp.displayOrder,
              });
            }
          } else {
            // Default flat allocation if items not explicitly segmented
            calcEarnings = baseMonthlyGross;
          }

          earnedGross = calcEarnings;
          totalEmpDeductions = calcDeductions;
          netSalary = Math.max(0, earnedGross - totalEmpDeductions);

          runGross += earnedGross;
          runDeductions += totalEmpDeductions;
          runNet += netSalary;

          // Create snapshot with items
          await this.prisma.employeePayrollSnapshot.create({
            data: {
              organizationId,
              payrollRunId: runId,
              employeeId: emp.id,
              payslipNumber,
              payslipStatus: 'GENERATED',
              employeeCode: emp.employeeCode,
              employeeName: emp.displayName,
              departmentName: emp.employment?.department?.name || null,
              designationTitle: emp.employment?.designation?.title || null,
              branchName: emp.employment?.branch?.name || null,
              calendarDays: new Prisma.Decimal(totalCalendarDays),
              workingDays: new Prisma.Decimal(totalCalendarDays),
              paidDays: new Prisma.Decimal(totalCalendarDays),
              lopDays: new Prisma.Decimal(0),
              baseMonthlyGross: new Prisma.Decimal(baseMonthlyGross),
              earnedGross: new Prisma.Decimal(earnedGross),
              totalDeductions: new Prisma.Decimal(totalEmpDeductions),
              netSalary: new Prisma.Decimal(netSalary),
              roundingAdjustment: new Prisma.Decimal(0),
              currency: compensation.structure?.currency || 'INR',
              isException: false,
              exceptionReason: null,
              items: {
                create: snapshotItemsData,
              },
            },
          });
          continue;
        }

        // Create exception snapshot without compensation
        await this.prisma.employeePayrollSnapshot.create({
          data: {
            organizationId,
            payrollRunId: runId,
            employeeId: emp.id,
            payslipNumber,
            payslipStatus: 'GENERATED',
            employeeCode: emp.employeeCode,
            employeeName: emp.displayName,
            departmentName: emp.employment?.department?.name || null,
            designationTitle: emp.employment?.designation?.title || null,
            branchName: emp.employment?.branch?.name || null,
            calendarDays: new Prisma.Decimal(totalCalendarDays),
            workingDays: new Prisma.Decimal(totalCalendarDays),
            paidDays: new Prisma.Decimal(0),
            lopDays: new Prisma.Decimal(totalCalendarDays),
            baseMonthlyGross: new Prisma.Decimal(0),
            earnedGross: new Prisma.Decimal(0),
            totalDeductions: new Prisma.Decimal(0),
            netSalary: new Prisma.Decimal(0),
            roundingAdjustment: new Prisma.Decimal(0),
            currency: 'INR',
            isException: true,
            exceptionReason,
          },
        });
      }

      // Transition to REVIEW_PENDING and update totals
      const updatedRun = await this.prisma.$transaction(async (tx) => {
        const r = await tx.payrollRun.update({
          where: { id: runId },
          data: {
            status: 'REVIEW_PENDING',
            totalEmployees: eligibleEmployees.length,
            totalGross: new Prisma.Decimal(runGross),
            totalDeductions: new Prisma.Decimal(runDeductions),
            totalNet: new Prisma.Decimal(runNet),
            calculatedAt: new Date(),
            exceptionCount,
            exceptions: exceptionsList.length > 0 ? (exceptionsList as any) : undefined,
          },
        });

        await tx.payrollApprovalHistory.create({
          data: {
            payrollRunId: runId,
            actorId,
            action: isRecalculation ? 'RECALCULATED' : 'CALCULATED',
            comments: `Calculated ${eligibleEmployees.length} employees with ${exceptionCount} exception(s)`,
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
   * Approve run
   */
  async approve(organizationId: string, runId: string, dto: ApprovePayrollRunDto, actorId: string) {
    const run = await this.findById(organizationId, runId);

    if (run.status !== 'REVIEW_PENDING') {
      throw new BadRequestException(
        `Cannot approve run in status '${run.status}'. Must be in 'REVIEW_PENDING'.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
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
          comments: dto.comments || 'Payroll run approved',
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
      metadata: { status: 'APPROVED', comments: dto.comments },
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

    const updated = await this.prisma.$transaction(async (tx) => {
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
}
