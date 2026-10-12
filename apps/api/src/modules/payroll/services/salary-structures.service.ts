import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import {
  CreateSalaryStructureDto,
  UpdateSalaryStructureDto,
  CloneSalaryStructureDto,
  PreviewSalaryStructureDto,
  QuerySalaryStructureDto,
} from '../dto/salary-structure.dto';
import { FormulaParserUtil } from '../utils/formula-parser.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class SalaryStructuresService {
  private readonly logger = new Logger(SalaryStructuresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * List salary structures with versions, usage counts, and search filters.
   */
  async findAll(user: AuthenticatedUser, query: QuerySalaryStructureDto) {
    const where: any = {
      organizationId: user.organizationId,
      deletedAt: null,
    };

    if (query.search) {
      where.OR = [
        { code: { contains: query.search.toUpperCase() } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status && query.status !== 'ALL') {
      where.isActive = query.status === 'ACTIVE';
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.salaryStructure.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ code: 'asc' }, { version: 'desc' }],
        include: {
          items: {
            include: {
              component: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  type: true,
                  calculationType: true,
                  displayOrder: true,
                },
              },
            },
            orderBy: { displayOrder: 'asc' },
          },
          _count: {
            select: {
              compensations: true,
            },
          },
        },
      }),
      this.prisma.salaryStructure.count({ where }),
    ]);

    return {
      items: items.map((structure) => {
        const earningsCount = structure.items.filter((i) => i.component.type === 'EARNING').length;
        const deductionsCount = structure.items.filter(
          (i) => i.component.type === 'DEDUCTION',
        ).length;
        return {
          ...structure,
          assignedEmployeesCount: structure._count.compensations,
          earningsCount,
          deductionsCount,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get single salary structure by ID with complete component breakdown.
   */
  async findById(user: AuthenticatedUser, id: string) {
    const structure = await this.prisma.salaryStructure.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        items: {
          include: {
            component: true,
          },
          orderBy: [{ displayOrder: 'asc' }],
        },
        _count: {
          select: {
            compensations: true,
          },
        },
      },
    });

    if (!structure) {
      throw new NotFoundException(`Salary structure with ID '${id}' not found`);
    }

    return {
      ...structure,
      assignedEmployeesCount: structure._count.compensations,
      earnings: structure.items.filter((i) => i.component.type === 'EARNING'),
      deductions: structure.items.filter((i) => i.component.type === 'DEDUCTION'),
    };
  }

  /**
   * Create a new versioned salary structure with validated component formulas.
   */
  async create(user: AuthenticatedUser, dto: CreateSalaryStructureDto) {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Check code/version uniqueness
    const existing = await this.prisma.salaryStructure.findUnique({
      where: {
        organizationId_code_version: {
          organizationId: user.organizationId,
          code: normalizedCode,
          version: 1,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Salary structure with code '${normalizedCode}' (v1) already exists. Use clone to create a new version.`,
      );
    }

    // Validate effective date range
    if (dto.effectiveFrom && dto.effectiveTo) {
      const from = new Date(dto.effectiveFrom);
      const to = new Date(dto.effectiveTo);
      if (to <= from) {
        throw new BadRequestException('effectiveTo date must be after effectiveFrom date');
      }
    }

    // Validate items and formulas
    await this.validateStructureItems(user.organizationId, dto.items);

    const structure = await this.prisma.$transaction(async (tx) => {
      const created = await tx.salaryStructure.create({
        data: {
          organizationId: user.organizationId,
          code: normalizedCode,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          version: 1,
          currency: dto.currency || 'INR',
          isActive: true,
        },
      });

      if (dto.items.length > 0) {
        await tx.salaryStructureItem.createMany({
          data: dto.items.map((item, index) => ({
            structureId: created.id,
            componentId: item.componentId,
            calculationType: item.calculationType,
            amountOrPercentage: new Prisma.Decimal(item.amountOrPercentage),
            formula: item.formula?.trim() || null,
            displayOrder: item.displayOrder ?? index,
          })),
        });
      }

      return created;
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'SALARY_STRUCTURE_CREATE',
      entity: 'SalaryStructure',
      entityId: structure.id,
      metadata: structure as any,
    });

    return this.findById(user, structure.id);
  }

  /**
   * Update an existing salary structure.
   * If assigned to employees, blocks in-place mutation to protect historical integrity.
   */
  async update(user: AuthenticatedUser, id: string, dto: UpdateSalaryStructureDto) {
    const existing = await this.findById(user, id);

    // If structure is referenced by employee compensations, disallow in-place formula/item mutation
    if (dto.items && existing.assignedEmployeesCount > 0) {
      throw new BadRequestException(
        `Salary structure '${existing.code} (v${existing.version})' is assigned to ${existing.assignedEmployeesCount} active employee(s). Modifying components directly is prohibited to maintain historical integrity. Please create a new version via clone.`,
      );
    }

    if (dto.items) {
      await this.validateStructureItems(user.organizationId, dto.items);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.salaryStructure.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description?.trim(),
          isActive: dto.isActive,
        },
      });

      if (dto.items) {
        // Rebuild items
        await tx.salaryStructureItem.deleteMany({ where: { structureId: id } });
        await tx.salaryStructureItem.createMany({
          data: dto.items.map((item, index) => ({
            structureId: id,
            componentId: item.componentId,
            calculationType: item.calculationType,
            amountOrPercentage: new Prisma.Decimal(item.amountOrPercentage),
            formula: item.formula?.trim() || null,
            displayOrder: item.displayOrder ?? index,
          })),
        });
      }
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'SALARY_STRUCTURE_UPDATE',
      entity: 'SalaryStructure',
      entityId: id,
      metadata: dto as any,
    });

    return this.findById(user, id);
  }

  /**
   * Clone a structure: creates either a new version (v+1) under same code, or a new structure.
   */
  async clone(user: AuthenticatedUser, id: string, dto: CloneSalaryStructureDto) {
    const source = await this.findById(user, id);
    const targetCode = dto.newCode ? dto.newCode.trim().toUpperCase() : source.code;

    // Determine target version
    let targetVersion = 1;
    if (targetCode === source.code) {
      const highestVersion = await this.prisma.salaryStructure.findFirst({
        where: { organizationId: user.organizationId, code: targetCode },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      targetVersion = (highestVersion?.version || source.version) + 1;
    } else {
      // Check if new code already exists
      const existing = await this.prisma.salaryStructure.findFirst({
        where: { organizationId: user.organizationId, code: targetCode },
      });
      if (existing) {
        throw new ConflictException(
          `Target structure code '${targetCode}' already exists. Choose a unique code.`,
        );
      }
    }

    const cloned = await this.prisma.$transaction(async (tx) => {
      const newStructure = await tx.salaryStructure.create({
        data: {
          organizationId: user.organizationId,
          code: targetCode,
          name: dto.newName?.trim() || `${source.name} (v${targetVersion})`,
          description: dto.description?.trim() || source.description,
          version: targetVersion,
          currency: source.currency,
          isActive: true,
        },
      });

      if (source.items.length > 0) {
        await tx.salaryStructureItem.createMany({
          data: source.items.map((item) => ({
            structureId: newStructure.id,
            componentId: item.componentId,
            calculationType: item.calculationType,
            amountOrPercentage: item.amountOrPercentage,
            formula: item.formula,
            displayOrder: item.displayOrder,
          })),
        });
      }

      return newStructure;
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'SALARY_STRUCTURE_CLONE',
      entity: 'SalaryStructure',
      entityId: cloned.id,
      metadata: {
        sourceId: id,
        sourceCode: source.code,
        sourceVersion: source.version,
        targetCode,
        targetVersion,
      } as any,
    });

    this.logger.log(`Cloned salary structure ${source.code} to ${targetCode} v${targetVersion}`);
    return this.findById(user, cloned.id);
  }

  /**
   * Activate a salary structure after validating completeness.
   */
  async activate(user: AuthenticatedUser, id: string) {
    const structure = await this.findById(user, id);

    if (structure.earnings.length === 0) {
      throw new BadRequestException(
        'Cannot activate structure without at least one earning component',
      );
    }

    const updated = await this.prisma.salaryStructure.update({
      where: { id },
      data: { isActive: true },
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'SALARY_STRUCTURE_ACTIVATE',
      entity: 'SalaryStructure',
      entityId: id,
      metadata: { isActive: true } as any,
    });

    return updated;
  }

  /**
   * Retire / Deactivate a salary structure.
   */
  async retire(user: AuthenticatedUser, id: string) {
    const structure = await this.findById(user, id);

    const updated = await this.prisma.salaryStructure.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'SALARY_STRUCTURE_RETIRE',
      entity: 'SalaryStructure',
      entityId: id,
      metadata: { isActive: false } as any,
    });

    return {
      message: `Salary structure '${structure.code} (v${structure.version})' retired successfully`,
      structure: updated,
    };
  }

  /**
   * Simulate and preview salary structure breakdown for a sample annual CTC.
   */
  async preview(user: AuthenticatedUser, id: string, dto: PreviewSalaryStructureDto) {
    const structure = await this.findById(user, id);

    if (structure.items.length === 0) {
      throw new BadRequestException('Structure has no components configured for preview');
    }

    const annualCtc = new Prisma.Decimal(dto.annualCtc);
    const monthlyGross = annualCtc.dividedBy(12).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    // Context for formula evaluation
    const evalContext: Record<string, Prisma.Decimal> = {
      CTC: annualCtc,
      GROSS: monthlyGross,
    };

    const calculatedItems: Array<{
      componentId: string;
      code: string;
      name: string;
      type: string;
      calculationType: string;
      monthlyAmount: string;
      annualAmount: string;
      percentageOfGross: string;
    }> = [];

    let totalEarningsMonthly = new Prisma.Decimal(0);
    let totalDeductionsMonthly = new Prisma.Decimal(0);

    // Evaluate in display order
    for (const item of structure.items) {
      let monthlyAmount = new Prisma.Decimal(0);
      const rateOrPercent = new Prisma.Decimal(item.amountOrPercentage);

      switch (item.calculationType) {
        case 'FLAT_AMOUNT':
          monthlyAmount = rateOrPercent;
          break;
        case 'PERCENTAGE_OF_GROSS':
          monthlyAmount = monthlyGross.times(rateOrPercent).dividedBy(100);
          break;
        case 'PERCENTAGE_OF_BASIC': {
          const basic = evalContext['BASIC'] || new Prisma.Decimal(0);
          monthlyAmount = basic.times(rateOrPercent).dividedBy(100);
          break;
        }
        case 'FORMULA':
          if (item.formula) {
            monthlyAmount = FormulaParserUtil.evaluate(item.formula, evalContext);
          }
          break;
      }

      monthlyAmount = monthlyAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      evalContext[item.component.code] = monthlyAmount;

      const annualAmount = monthlyAmount.times(12).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const percentShare = monthlyGross.isZero()
        ? '0.00'
        : monthlyAmount.times(100).dividedBy(monthlyGross).toFixed(2);

      if (item.component.type === 'EARNING') {
        totalEarningsMonthly = totalEarningsMonthly.plus(monthlyAmount);
      } else {
        totalDeductionsMonthly = totalDeductionsMonthly.plus(monthlyAmount);
      }

      calculatedItems.push({
        componentId: item.componentId,
        code: item.component.code,
        name: item.component.name,
        type: item.component.type,
        calculationType: item.calculationType,
        monthlyAmount: monthlyAmount.toFixed(2),
        annualAmount: annualAmount.toFixed(2),
        percentageOfGross: percentShare,
      });
    }

    const netMonthly = totalEarningsMonthly
      .minus(totalDeductionsMonthly)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

    const netAnnual = netMonthly.times(12);

    return {
      structureId: structure.id,
      structureCode: structure.code,
      structureName: structure.name,
      version: structure.version,
      currency: structure.currency,
      annualCtc: annualCtc.toFixed(2),
      monthlyGross: monthlyGross.toFixed(2),
      summary: {
        totalEarningsMonthly: totalEarningsMonthly.toFixed(2),
        totalEarningsAnnual: totalEarningsMonthly.times(12).toFixed(2),
        totalDeductionsMonthly: totalDeductionsMonthly.toFixed(2),
        totalDeductionsAnnual: totalDeductionsMonthly.times(12).toFixed(2),
        estimatedNetTakeHomeMonthly: netMonthly.toFixed(2),
        estimatedNetTakeHomeAnnual: netAnnual.toFixed(2),
      },
      breakdown: {
        earnings: calculatedItems.filter((i) => i.type === 'EARNING'),
        deductions: calculatedItems.filter((i) => i.type === 'DEDUCTION'),
      },
    };
  }

  /**
   * Helper: validates component existence, types, and formula acyclicity.
   */
  private async validateStructureItems(organizationId: string, items: any[]) {
    if (!items || items.length === 0) {
      throw new BadRequestException('Salary structure must have at least one component');
    }

    const componentIds = items.map((i) => i.componentId);
    const uniqueIds = new Set(componentIds);
    if (uniqueIds.size !== componentIds.length) {
      throw new BadRequestException(
        'Duplicate components are not permitted within the same structure',
      );
    }

    const components = await this.prisma.salaryComponent.findMany({
      where: {
        id: { in: componentIds },
        organizationId,
        deletedAt: null,
      },
    });

    if (components.length !== componentIds.length) {
      throw new BadRequestException(
        'One or more referenced components do not exist or are inactive',
      );
    }

    const hasEarning = components.some((c) => c.type === 'EARNING');
    if (!hasEarning) {
      throw new BadRequestException('Salary structure must include at least one EARNING component');
    }

    const compMap = new Map(components.map((c) => [c.id, c]));

    // Build dependency graph and test for circular dependencies
    const dependencyMap = new Map<string, string[]>();

    for (const item of items) {
      const comp = compMap.get(item.componentId)!;
      const deps: string[] = [];

      if (item.calculationType === 'PERCENTAGE_OF_BASIC') {
        deps.push('BASIC');
      } else if (item.calculationType === 'FORMULA' && item.formula) {
        const extracted = FormulaParserUtil.validateAndExtractDependencies(item.formula);
        deps.push(...extracted);
      }

      dependencyMap.set(comp.code, deps);
    }

    FormulaParserUtil.detectCircularDependencies(dependencyMap);
  }
}
