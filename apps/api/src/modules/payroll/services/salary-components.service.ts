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
  CreateSalaryComponentDto,
  UpdateSalaryComponentDto,
  QuerySalaryComponentDto,
} from '../dto/salary-component.dto';
import { FormulaParserUtil } from '../utils/formula-parser.util';

@Injectable()
export class SalaryComponentsService {
  private readonly logger = new Logger(SalaryComponentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * List salary components with search, type filter, status filter and pagination.
   */
  async findAll(user: AuthenticatedUser, query: QuerySalaryComponentDto) {
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

    if (query.type && query.type !== 'ALL') {
      where.type = query.type;
    }

    if (query.status && query.status !== 'ALL') {
      where.isActive = query.status === 'ACTIVE';
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.salaryComponent.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ type: 'asc' }, { displayOrder: 'asc' }, { code: 'asc' }],
        include: {
          _count: {
            select: {
              structureItems: true,
              compensationItems: true,
            },
          },
        },
      }),
      this.prisma.salaryComponent.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        usageCount: item._count.structureItems + item._count.compensationItems,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find single component by ID with structure usage details.
   */
  async findById(user: AuthenticatedUser, id: string) {
    const component = await this.prisma.salaryComponent.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        structureItems: {
          include: {
            structure: {
              select: {
                id: true,
                code: true,
                name: true,
                version: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!component) {
      throw new NotFoundException(`Salary component with ID '${id}' not found`);
    }

    return component;
  }

  /**
   * Create a new salary component definition.
   */
  async create(user: AuthenticatedUser, dto: CreateSalaryComponentDto) {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Check code uniqueness
    const existing = await this.prisma.salaryComponent.findUnique({
      where: {
        organizationId_code: {
          organizationId: user.organizationId,
          code: normalizedCode,
        },
      },
    });

    if (existing) {
      if (existing.deletedAt) {
        // Revive soft-deleted component
        return this.update(user, existing.id, {
          ...dto,
          isActive: true,
        });
      }
      throw new ConflictException(
        `Salary component with code '${normalizedCode}' already exists in your organization`,
      );
    }

    // Formula validation if calculationType is FORMULA
    if (dto.calculationType === 'FORMULA') {
      if (!dto.formula || !dto.formula.trim()) {
        throw new BadRequestException(
          'Formula expression is required when calculationType is FORMULA',
        );
      }
      FormulaParserUtil.validateAndExtractDependencies(dto.formula);
    }

    const component = await this.prisma.salaryComponent.create({
      data: {
        organizationId: user.organizationId,
        code: normalizedCode,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        type: dto.type,
        calculationType: dto.calculationType,
        formula: dto.formula?.trim() || null,
        isTaxable: dto.isTaxable ?? true,
        isStatutory: dto.isStatutory ?? false,
        isProRataApplicable: dto.isProRataApplicable ?? true,
        affectsNetSalary: dto.affectsNetSalary ?? true,
        displayOrder: dto.displayOrder ?? 0,
        isActive: true,
      },
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'SALARY_COMPONENT_CREATE',
      entity: 'SalaryComponent',
      entityId: component.id,
      metadata: component as any,
    });

    this.logger.log(`Created salary component '${component.code}' by user ${user.id}`);
    return component;
  }

  /**
   * Update an existing salary component definition.
   */
  async update(user: AuthenticatedUser, id: string, dto: UpdateSalaryComponentDto) {
    const existing = await this.findById(user, id);

    const calculationType = dto.calculationType || existing.calculationType;
    const formula = dto.formula !== undefined ? dto.formula : existing.formula;

    if (calculationType === 'FORMULA') {
      if (!formula || !formula.trim()) {
        throw new BadRequestException(
          'Formula expression is required when calculationType is FORMULA',
        );
      }
      FormulaParserUtil.validateAndExtractDependencies(formula);
    }

    const updated = await this.prisma.salaryComponent.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        description: dto.description !== undefined ? dto.description?.trim() : undefined,
        calculationType: dto.calculationType,
        formula: dto.formula !== undefined ? dto.formula?.trim() || null : undefined,
        isTaxable: dto.isTaxable,
        isStatutory: dto.isStatutory,
        isProRataApplicable: dto.isProRataApplicable,
        affectsNetSalary: dto.affectsNetSalary,
        displayOrder: dto.displayOrder,
        isActive: dto.isActive,
        deletedAt: null,
      },
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'SALARY_COMPONENT_UPDATE',
      entity: 'SalaryComponent',
      entityId: id,
      metadata: { old: existing, new: updated } as any,
    });

    return updated;
  }

  /**
   * Retire / Deactivate a salary component safely.
   */
  async retire(user: AuthenticatedUser, id: string) {
    const existing = await this.findById(user, id);

    // Check if referenced in any active structures
    const activeStructureUsage = await this.prisma.salaryStructureItem.count({
      where: {
        componentId: id,
        structure: {
          organizationId: user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      },
    });

    if (activeStructureUsage > 0) {
      throw new BadRequestException(
        `Cannot retire component '${existing.code}' because it is in use by ${activeStructureUsage} active salary structure(s). Remove it from structures or retire the structures first.`,
      );
    }

    const retired = await this.prisma.salaryComponent.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    await this.auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'SALARY_COMPONENT_RETIRE',
      entity: 'SalaryComponent',
      entityId: id,
      metadata: { retiredCode: existing.code } as any,
    });

    return {
      message: `Salary component '${existing.code}' retired successfully`,
      component: retired,
    };
  }
}
