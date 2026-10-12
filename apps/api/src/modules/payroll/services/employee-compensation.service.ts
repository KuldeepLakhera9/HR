import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { FormulaParserUtil } from '../utils/formula-parser.util';
import {
  CreateEmployeeCompensationDto,
  ApproveCompensationDto,
  RejectCompensationDto,
  ApplicableCompensationQueryDto,
  CompensationStatus,
} from '../dto/employee-compensation.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class EmployeeCompensationService {
  private readonly logger = new Logger(EmployeeCompensationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Enforce payroll permission check. Managers cannot view salary details
   * solely through team management rights.
   */
  private checkViewPermission(user: AuthenticatedUser, targetEmployeeId?: string) {
    const isAdmin = user.roles.includes('ADMIN');
    const hasPayrollView =
      user.permissions.includes('PAYROLL_VIEW') ||
      user.permissions.includes('PAYROLL_COMPENSATION') ||
      user.permissions.includes('PAYROLL_MANAGE');

    if (isAdmin || hasPayrollView) {
      return;
    }

    throw new ForbiddenException(
      'Unauthorized: Salary and compensation details require explicit PAYROLL_VIEW or PAYROLL_COMPENSATION permission.',
    );
  }

  /**
   * Retrieve full chronological compensation history and current applicable assignment.
   */
  async getEmployeeCompensationHistory(user: AuthenticatedUser, employeeId: string) {
    this.checkViewPermission(user, employeeId);

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeCode: true,
        displayName: true,
        joiningDate: true,
        status: true,
        employment: {
          select: {
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, title: true } },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID '${employeeId}' not found`);
    }

    const history = await this.prisma.employeeCompensation.findMany({
      where: {
        employeeId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        structure: {
          select: {
            id: true,
            code: true,
            name: true,
            version: true,
            currency: true,
            isActive: true,
          },
        },
        items: {
          include: {
            component: {
              select: {
                id: true,
                code: true,
                name: true,
                type: true,
                calculationType: true,
                isTaxable: true,
                isStatutory: true,
                displayOrder: true,
              },
            },
          },
          orderBy: {
            component: {
              displayOrder: 'asc',
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    const now = new Date();
    // Locate the current active assignment (Approved, effectiveFrom <= now, effectiveTo >= now or null)
    const currentCompensation =
      history.find(
        (c: any) =>
          c.status === 'APPROVED' &&
          new Date(c.effectiveFrom) <= now &&
          (!c.effectiveTo || new Date(c.effectiveTo) >= now),
      ) ||
      history.find((c: any) => c.status === 'APPROVED') ||
      null;

    return {
      employee,
      currentCompensation,
      history,
      totalCount: history.length,
    };
  }

  /**
   * Create a new versioned compensation assignment without overwriting history.
   */
  async createAssignment(
    user: AuthenticatedUser,
    employeeId: string,
    dto: CreateEmployeeCompensationDto,
  ) {
    const isAdmin = user.roles.includes('ADMIN');
    const canManage =
      user.permissions.includes('PAYROLL_COMPENSATION') ||
      user.permissions.includes('PAYROLL_MANAGE');

    if (!isAdmin && !canManage) {
      throw new ForbiddenException(
        'Unauthorized: Creating compensation assignments requires PAYROLL_COMPENSATION or PAYROLL_MANAGE permission.',
      );
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID '${employeeId}' not found`);
    }

    // Verify approved salary structure
    const structure = await this.prisma.salaryStructure.findFirst({
      where: {
        id: dto.structureId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        items: {
          include: {
            component: true,
          },
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
    });

    if (!structure) {
      throw new NotFoundException(`Salary structure '${dto.structureId}' not found`);
    }

    if (!structure.isActive) {
      throw new BadRequestException(
        `Cannot assign inactive or retired salary structure '${structure.code} (v${structure.version})'.`,
      );
    }

    if (structure.items.length === 0) {
      throw new BadRequestException('Selected salary structure has no configured components');
    }

    const newEffectiveFrom = new Date(dto.effectiveFrom);
    if (isNaN(newEffectiveFrom.getTime())) {
      throw new BadRequestException('Invalid effectiveFrom date');
    }

    let newEffectiveTo: Date | null = null;
    if (dto.effectiveTo) {
      newEffectiveTo = new Date(dto.effectiveTo);
      if (isNaN(newEffectiveTo.getTime()) || newEffectiveTo <= newEffectiveFrom) {
        throw new BadRequestException('effectiveTo date must be strictly after effectiveFrom date');
      }
    }

    // Check for conflicting approved assignments with the exact same effectiveFrom
    const exactConflict = await this.prisma.employeeCompensation.findFirst({
      where: {
        employeeId,
        organizationId: user.organizationId,
        effectiveFrom: newEffectiveFrom,
        status: { in: ['APPROVED', 'PENDING_APPROVAL'] },
        deletedAt: null,
      },
    });

    if (exactConflict) {
      throw new ConflictException(
        `A compensation assignment starting on ${newEffectiveFrom.toISOString().split('T')[0]} already exists (${exactConflict.status}).`,
      );
    }

    // Compute itemized breakdown using structure configuration and formula engine
    const breakdown = this.calculateCompensationItems(structure, new Prisma.Decimal(dto.ctcAnnual));

    const initialStatus = dto.submitForApproval ? 'PENDING_APPROVAL' : 'APPROVED';

    const compensation = await this.prisma.$transaction(async (tx: any) => {
      // If auto-approved, cap predecessor active assignment to prevent overlapping intervals
      if (initialStatus === 'APPROVED') {
        const activePredecessor = await tx.employeeCompensation.findFirst({
          where: {
            employeeId,
            organizationId: user.organizationId,
            status: 'APPROVED',
            effectiveFrom: { lt: newEffectiveFrom },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: newEffectiveFrom } }],
            deletedAt: null,
          },
          orderBy: { effectiveFrom: 'desc' },
        });

        if (activePredecessor) {
          // Cap predecessor to 1 millisecond before newEffectiveFrom (or midnight before)
          const cappedDate = new Date(newEffectiveFrom.getTime() - 1000);
          await tx.employeeCompensation.update({
            where: { id: activePredecessor.id },
            data: {
              effectiveTo: cappedDate,
            },
          });
          this.logger.log(
            `Capped prior compensation ${activePredecessor.id} effectiveTo to ${cappedDate.toISOString()}`,
          );
        }
      }

      // Create new compensation header
      const created = await tx.employeeCompensation.create({
        data: {
          organizationId: user.organizationId,
          employeeId,
          structureId: dto.structureId,
          ctcAnnual: new Prisma.Decimal(dto.ctcAnnual),
          grossMonthly: breakdown.monthlyGross,
          effectiveFrom: newEffectiveFrom,
          effectiveTo: newEffectiveTo,
          status: initialStatus as any,
          changeReason: dto.changeReason as any,
          reason: dto.reason?.trim(),
          notes: dto.notes?.trim(),
          createdById: user.id,
          approvedById: initialStatus === 'APPROVED' ? user.id : null,
          approvedAt: initialStatus === 'APPROVED' ? new Date() : null,
        },
      });

      // Insert itemized snapshot rows
      if (breakdown.items.length > 0) {
        await tx.employeeCompensationItem.createMany({
          data: breakdown.items.map((item) => ({
            compensationId: created.id,
            componentId: item.componentId,
            monthlyAmount: item.monthlyAmount,
            annualAmount: item.annualAmount,
          })),
        });
      }

      return created;
    });

    // Audit record preserving original and revised values
    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'COMPENSATION_ASSIGN_CREATED',
      entity: 'EmployeeCompensation',
      entityId: compensation.id,
      metadata: {
        employeeId,
        structureId: dto.structureId,
        ctcAnnual: dto.ctcAnnual,
        effectiveFrom: dto.effectiveFrom,
        status: initialStatus,
        changeReason: dto.changeReason,
      } as any,
    });

    this.logger.log(
      `Created compensation assignment ${compensation.id} for employee ${employeeId} (${initialStatus})`,
    );

    return this.getEmployeeCompensationHistory(user, employeeId);
  }

  /**
   * Approve a pending compensation assignment and safely sequence historical intervals.
   */
  async approve(user: AuthenticatedUser, compensationId: string, dto: ApproveCompensationDto) {
    const isAdmin = user.roles.includes('ADMIN');
    const canApprove =
      user.permissions.includes('PAYROLL_APPROVE') || user.permissions.includes('PAYROLL_MANAGE');

    if (!isAdmin && !canApprove) {
      throw new ForbiddenException(
        'Unauthorized: Approving compensation changes requires PAYROLL_APPROVE or PAYROLL_MANAGE permission.',
      );
    }

    const compensation = await this.prisma.employeeCompensation.findFirst({
      where: {
        id: compensationId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!compensation) {
      throw new NotFoundException(`Compensation record '${compensationId}' not found`);
    }

    if (compensation.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Cannot approve compensation with current status '${compensation.status}'. Only PENDING_APPROVAL can be approved.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      // Cap prior active compensation interval
      const activePredecessor = await tx.employeeCompensation.findFirst({
        where: {
          employeeId: compensation.employeeId,
          organizationId: user.organizationId,
          status: 'APPROVED',
          effectiveFrom: { lt: compensation.effectiveFrom },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: compensation.effectiveFrom } }],
          deletedAt: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      if (activePredecessor) {
        const cappedDate = new Date(compensation.effectiveFrom.getTime() - 1000);
        await tx.employeeCompensation.update({
          where: { id: activePredecessor.id },
          data: { effectiveTo: cappedDate },
        });
      }

      return tx.employeeCompensation.update({
        where: { id: compensationId },
        data: {
          status: 'APPROVED' as any,
          approvedById: user.id,
          approvedAt: new Date(),
          notes: dto.comments
            ? `${compensation.notes ? `${compensation.notes}\n` : ''}Approval comments: ${dto.comments}`
            : compensation.notes,
        },
      });
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'COMPENSATION_ASSIGN_APPROVED',
      entity: 'EmployeeCompensation',
      entityId: compensationId,
      metadata: {
        employeeId: compensation.employeeId,
        approvedAt: new Date().toISOString(),
      } as any,
    });

    return updated;
  }

  /**
   * Reject a pending compensation change with mandatory justification.
   */
  async reject(user: AuthenticatedUser, compensationId: string, dto: RejectCompensationDto) {
    const isAdmin = user.roles.includes('ADMIN');
    const canApprove =
      user.permissions.includes('PAYROLL_APPROVE') || user.permissions.includes('PAYROLL_MANAGE');

    if (!isAdmin && !canApprove) {
      throw new ForbiddenException(
        'Unauthorized: Rejecting compensation changes requires PAYROLL_APPROVE or PAYROLL_MANAGE permission.',
      );
    }

    const compensation = await this.prisma.employeeCompensation.findFirst({
      where: {
        id: compensationId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!compensation) {
      throw new NotFoundException(`Compensation record '${compensationId}' not found`);
    }

    if (compensation.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Cannot reject compensation with current status '${compensation.status}'. Only PENDING_APPROVAL can be rejected.`,
      );
    }

    const updated = await this.prisma.employeeCompensation.update({
      where: { id: compensationId },
      data: {
        status: 'REJECTED' as any,
        approvedById: user.id,
        rejectionReason: dto.rejectionReason.trim(),
      },
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'COMPENSATION_ASSIGN_REJECTED',
      entity: 'EmployeeCompensation',
      entityId: compensationId,
      metadata: {
        employeeId: compensation.employeeId,
        rejectionReason: dto.rejectionReason,
      } as any,
    });

    return updated;
  }

  /**
   * Cancel a draft or pending compensation assignment.
   */
  async cancel(user: AuthenticatedUser, compensationId: string) {
    const compensation = await this.prisma.employeeCompensation.findFirst({
      where: {
        id: compensationId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!compensation) {
      throw new NotFoundException(`Compensation record '${compensationId}' not found`);
    }

    if (compensation.status !== 'DRAFT' && compensation.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Cannot cancel compensation with status '${compensation.status}'. Only DRAFT or PENDING_APPROVAL can be cancelled.`,
      );
    }

    const updated = await this.prisma.employeeCompensation.update({
      where: { id: compensationId },
      data: {
        status: 'CANCELLED' as any,
      },
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'COMPENSATION_ASSIGN_CANCELLED',
      entity: 'EmployeeCompensation',
      entityId: compensationId,
      metadata: { employeeId: compensation.employeeId } as any,
    });

    return updated;
  }

  /**
   * Determine compensation applicable to a payroll period using an explicit
   * effective-date policy. Handles mid-period salary revisions cleanly.
   */
  async getApplicableForPeriod(
    user: AuthenticatedUser,
    employeeId: string,
    query: ApplicableCompensationQueryDto,
  ) {
    this.checkViewPermission(user, employeeId);

    let periodStart: Date;
    let periodEnd: Date;

    if (query.date) {
      periodStart = new Date(query.date);
      periodEnd = new Date(query.date);
    } else if (query.startDate && query.endDate) {
      periodStart = new Date(query.startDate);
      periodEnd = new Date(query.endDate);
    } else {
      // Default to current month boundaries
      const now = new Date();
      periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));
    }

    // Find all APPROVED compensations overlapping the interval
    const candidates = await this.prisma.employeeCompensation.findMany({
      where: {
        employeeId,
        organizationId: user.organizationId,
        status: 'APPROVED',
        effectiveFrom: { lte: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
        deletedAt: null,
      },
      include: {
        structure: true,
        items: {
          include: {
            component: true,
          },
        },
      },
      orderBy: { effectiveFrom: 'asc' },
    });

    if (candidates.length === 0) {
      return {
        hasApplicableCompensation: false,
        isMidPeriodRevision: false,
        message: 'No approved compensation found for the requested period',
        segments: [],
      };
    }

    const normalizeUtcDate = (d: Date) =>
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

    const normPeriodStart = normalizeUtcDate(periodStart);
    const normPeriodEnd = normalizeUtcDate(periodEnd);

    const totalDaysInPeriod =
      Math.round((normPeriodEnd.getTime() - normPeriodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (candidates.length === 1) {
      const single = candidates[0];
      return {
        hasApplicableCompensation: true,
        isMidPeriodRevision: false,
        primaryCompensation: single,
        totalPeriodDays: totalDaysInPeriod,
        segments: [
          {
            compensationId: single.id,
            structureCode: single.structure.code,
            ctcAnnual: single.ctcAnnual,
            grossMonthly: single.grossMonthly,
            segmentStartDate: normPeriodStart.toISOString().split('T')[0],
            segmentEndDate: normPeriodEnd.toISOString().split('T')[0],
            activeDays: totalDaysInPeriod,
            weight: 1.0,
            items: single.items,
          },
        ],
      };
    }

    // Mid-period revision detected! Segment calculation for downstream proration in Phase 11.4
    const segments = candidates.map((cand: any, idx: number) => {
      const rawStart = cand.effectiveFrom > periodStart ? cand.effectiveFrom : periodStart;
      const rawEnd =
        cand.effectiveTo && cand.effectiveTo < periodEnd ? cand.effectiveTo : periodEnd;

      const normStart = normalizeUtcDate(rawStart);
      const normEnd = normalizeUtcDate(rawEnd);

      const activeDays = Math.max(
        0,
        Math.round((normEnd.getTime() - normStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      );

      const weight = Number((activeDays / totalDaysInPeriod).toFixed(6));

      return {
        segmentIndex: idx + 1,
        compensationId: cand.id,
        structureCode: cand.structure.code,
        ctcAnnual: cand.ctcAnnual,
        grossMonthly: cand.grossMonthly,
        segmentStartDate: normStart.toISOString().split('T')[0],
        segmentEndDate: normEnd.toISOString().split('T')[0],
        activeDays,
        weight,
        items: cand.items,
      };
    });

    return {
      hasApplicableCompensation: true,
      isMidPeriodRevision: true,
      totalPeriodDays: totalDaysInPeriod,
      segments,
      note: 'Mid-period salary revision detected. Two or more compensation segments apply to this payroll period.',
    };
  }

  /**
   * Export compensation history to CSV with spreadsheet formula injection protection.
   */
  async exportCompensationHistory(user: AuthenticatedUser, employeeId: string): Promise<string> {
    const isAdmin = user.roles.includes('ADMIN');
    const canExport =
      user.permissions.includes('PAYROLL_EXPORT') ||
      user.permissions.includes('PAYROLL_COMPENSATION');

    if (!isAdmin && !canExport) {
      throw new ForbiddenException(
        'Unauthorized: Exporting compensation history requires PAYROLL_EXPORT permission.',
      );
    }

    const { employee, history } = await this.getEmployeeCompensationHistory(user, employeeId);

    const headers = [
      'Employee Code',
      'Employee Name',
      'Structure Code',
      'Version',
      'Effective From',
      'Effective To',
      'Status',
      'Change Reason',
      'Annual CTC',
      'Monthly Gross',
      'Created By',
      'Approved By',
    ];

    const sanitize = (val: any) => {
      if (val === null || val === undefined) return '""';
      let str = String(val).replace(/"/g, '""');
      // Protect against CSV formula injection
      if (/^[=+@-]$/.test(str.charAt(0))) {
        str = `'${str}`;
      }
      return `"${str}"`;
    };

    const rows = history.map((c: any) => [
      sanitize(employee.employeeCode),
      sanitize(employee.displayName),
      sanitize(c.structure.code),
      sanitize(`v${c.structure.version}`),
      sanitize(c.effectiveFrom ? new Date(c.effectiveFrom).toISOString().split('T')[0] : ''),
      sanitize(c.effectiveTo ? new Date(c.effectiveTo).toISOString().split('T')[0] : 'Present'),
      sanitize(c.status),
      sanitize(c.changeReason),
      sanitize(Number(c.ctcAnnual).toFixed(2)),
      sanitize(Number(c.grossMonthly).toFixed(2)),
      sanitize(c.createdBy ? `${c.createdBy.firstName} ${c.createdBy.lastName}` : 'System'),
      sanitize(c.approvedBy ? `${c.approvedBy.firstName} ${c.approvedBy.lastName}` : '—'),
    ]);

    return [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\r\n');
  }

  /**
   * Internal deterministic calculation of component item amounts.
   */
  private calculateCompensationItems(structure: any, annualCtc: Prisma.Decimal) {
    const context: Record<string, Prisma.Decimal> = {
      CTC: annualCtc,
      GROSS: annualCtc.dividedBy(12),
      BASIC: new Prisma.Decimal('0.00'),
    };

    const results: Array<{
      componentId: string;
      code: string;
      type: string;
      monthlyAmount: Prisma.Decimal;
      annualAmount: Prisma.Decimal;
    }> = [];

    let totalMonthlyGross = new Prisma.Decimal('0.00');

    for (const item of structure.items) {
      const code = item.component.code;
      let calculatedMonthly = new Prisma.Decimal('0.00');

      switch (item.calculationType) {
        case 'FLAT_AMOUNT':
          calculatedMonthly = item.amountOrPercentage;
          break;
        case 'PERCENTAGE_OF_BASIC': {
          const basic = context['BASIC'] || new Prisma.Decimal('0.00');
          calculatedMonthly = basic.times(item.amountOrPercentage).dividedBy(100);
          break;
        }
        case 'PERCENTAGE_OF_GROSS': {
          const gross = context['GROSS'] || annualCtc.dividedBy(12);
          calculatedMonthly = gross.times(item.amountOrPercentage).dividedBy(100);
          break;
        }
        case 'FORMULA':
          if (item.formula) {
            calculatedMonthly = FormulaParserUtil.evaluate(item.formula, context);
          }
          break;
        default:
          calculatedMonthly = item.amountOrPercentage;
      }

      calculatedMonthly = FormulaParserUtil.round(calculatedMonthly, 'HALF_UP', 2);
      const calculatedAnnual = calculatedMonthly.times(12);

      context[code] = calculatedMonthly;
      if (code === 'BASIC') {
        context['BASIC'] = calculatedMonthly;
      }

      if (item.component.type === 'EARNING' && item.component.affectsNetSalary) {
        totalMonthlyGross = totalMonthlyGross.plus(calculatedMonthly);
      }

      results.push({
        componentId: item.componentId,
        code,
        type: item.component.type,
        monthlyAmount: calculatedMonthly,
        annualAmount: calculatedAnnual,
      });
    }

    return {
      monthlyGross: totalMonthlyGross,
      items: results,
    };
  }
}
