import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  UpdateOrganizationDto,
  CreateBranchDto,
  UpdateBranchDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateDesignationDto,
  UpdateDesignationDto,
} from './dto/organization.dto';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Organization Operations
  // ---------------------------------------------------------------------------

  async getOrganization(organizationId?: string) {
    const org = organizationId
      ? await this.prisma.organization.findUnique({ where: { id: organizationId } })
      : await this.prisma.organization.findFirst();

    if (!org) {
      throw new NotFoundException('Organization details not found');
    }

    const [branchesCount, departmentsCount, designationsCount, employeesCount] = await Promise.all([
      this.prisma.branch.count({ where: { organizationId: org.id, isActive: true } }),
      this.prisma.department.count({ where: { organizationId: org.id, isActive: true } }),
      this.prisma.designation.count({ where: { organizationId: org.id, isActive: true } }),
      this.prisma.employee.count({ where: { organizationId: org.id, isActive: true } }),
    ]);

    return {
      ...org,
      stats: {
        branchesCount,
        departmentsCount,
        designationsCount,
        employeesCount,
      },
    };
  }

  async getOverview(organizationId?: string) {
    const orgData = await this.getOrganization(organizationId);

    const branches = await this.prisma.branch.findMany({
      where: { organizationId: orgData.id },
      include: {
        _count: {
          select: { employments: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const departments = await this.prisma.department.findMany({
      where: { organizationId: orgData.id },
      include: {
        departmentHead: {
          select: {
            id: true,
            displayName: true,
            employeeCode: true,
          },
        },
        _count: {
          select: { employments: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      organization: orgData,
      branches: branches.map((b) => ({
        ...b,
        employeeCount: b._count.employments,
      })),
      departments: departments.map((d) => ({
        ...d,
        employeeCount: d._count.employments,
      })),
    };
  }

  async updateOrganization(id: string, dto: UpdateOrganizationDto, performedByUserId?: string) {
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Organization #${id} not found`);
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: dto,
    });

    await this.auditService.record({
      action: 'ORGANIZATION_UPDATED',
      entity: 'Organization',
      entityId: id,
      userId: performedByUserId,
      organizationId: id,
      metadata: { changes: dto },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Branch Operations
  // ---------------------------------------------------------------------------

  async findAllBranches(params: {
    organizationId?: string;
    search?: string;
    status?: 'all' | 'active' | 'inactive';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: any = {};
    if (params.organizationId) {
      where.organizationId = params.organizationId;
    }
    if (params.status === 'active') {
      where.isActive = true;
    } else if (params.status === 'inactive') {
      where.isActive = false;
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
        { city: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const page = params.page ? Math.max(1, Number(params.page)) : undefined;
    const limit = params.limit ? Math.max(1, Number(params.limit)) : undefined;
    const skip = page && limit ? (page - 1) * limit : undefined;

    const allowedSortFields = ['name', 'code', 'city', 'createdAt', 'isActive'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy! : 'name';
    const sortOrder = params.sortOrder === 'desc' ? 'desc' : 'asc';

    const [total, branches] = await Promise.all([
      this.prisma.branch.count({ where }),
      this.prisma.branch.findMany({
        where,
        include: {
          _count: { select: { employments: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        ...(skip !== undefined && { skip }),
        ...(limit !== undefined && { take: limit }),
      }),
    ]);

    const items = branches.map((b: any) => ({
      ...b,
      employeeCount: b._count?.employments ?? 0,
    }));

    return {
      items,
      meta: {
        total,
        page: page || 1,
        limit: limit || total,
        totalPages: limit ? Math.ceil(total / limit) || 1 : 1,
      },
    };
  }

  async findBranchById(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        _count: { select: { employments: true } },
      },
    });
    if (!branch) {
      throw new NotFoundException(`Branch #${id} not found`);
    }
    return {
      ...branch,
      employeeCount: branch._count.employments,
    };
  }

  async createBranch(dto: CreateBranchDto, organizationId: string, performedByUserId?: string) {
    const existing = await this.prisma.branch.findUnique({
      where: {
        organizationId_code: {
          organizationId,
          code: dto.code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Branch code '${dto.code}' already exists`);
    }

    const branch = await this.prisma.branch.create({
      data: {
        ...dto,
        organizationId,
        geofenceLat: dto.latitude ?? null,
        geofenceLng: dto.longitude ?? null,
      },
    });

    await this.auditService.record({
      action: 'BRANCH_CREATED',
      entity: 'Branch',
      entityId: branch.id,
      userId: performedByUserId,
      organizationId,
      metadata: { code: branch.code, name: branch.name },
    });

    return branch;
  }

  async updateBranch(id: string, dto: UpdateBranchDto, performedByUserId?: string) {
    const branch = await this.findBranchById(id);

    if (dto.code && dto.code !== branch.code) {
      const duplicate = await this.prisma.branch.findUnique({
        where: {
          organizationId_code: {
            organizationId: branch.organizationId,
            code: dto.code,
          },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Branch with code '${dto.code}' already exists`);
      }
    }

    const updated = await this.prisma.branch.update({
      where: { id },
      data: {
        ...dto,
        geofenceLat: dto.latitude !== undefined ? dto.latitude : branch.geofenceLat,
        geofenceLng: dto.longitude !== undefined ? dto.longitude : branch.geofenceLng,
      },
    });

    await this.auditService.record({
      action: 'BRANCH_UPDATED',
      entity: 'Branch',
      entityId: id,
      userId: performedByUserId,
      organizationId: branch.organizationId,
      metadata: { changes: dto },
    });

    return updated;
  }

  async deactivateBranch(id: string, performedByUserId?: string) {
    const branch = await this.findBranchById(id);

    // Prevent physical deletion if referenced by historical or active employments
    if (branch.employeeCount > 0) {
      // Toggle to inactive instead of hard delete
      const updated = await this.prisma.branch.update({
        where: { id },
        data: { isActive: false },
      });

      await this.auditService.record({
        action: 'BRANCH_DEACTIVATED',
        entity: 'Branch',
        entityId: id,
        userId: performedByUserId,
        organizationId: branch.organizationId,
        metadata: {
          reason: 'Deactivated while referenced by employees',
          employeeCount: branch.employeeCount,
        },
      });

      return updated;
    }

    const deleted = await this.prisma.branch.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.record({
      action: 'BRANCH_DEACTIVATED',
      entity: 'Branch',
      entityId: id,
      userId: performedByUserId,
      organizationId: branch.organizationId,
    });

    return deleted;
  }

  // ---------------------------------------------------------------------------
  // Department Operations
  // ---------------------------------------------------------------------------

  async findAllDepartments(params: {
    organizationId?: string;
    search?: string;
    status?: 'all' | 'active' | 'inactive';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: any = {};
    if (params.organizationId) {
      where.organizationId = params.organizationId;
    }
    if (params.status === 'active') {
      where.isActive = true;
    } else if (params.status === 'inactive') {
      where.isActive = false;
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const page = params.page ? Math.max(1, Number(params.page)) : undefined;
    const limit = params.limit ? Math.max(1, Number(params.limit)) : undefined;
    const skip = page && limit ? (page - 1) * limit : undefined;

    const allowedSortFields = ['name', 'code', 'createdAt', 'isActive'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy! : 'name';
    const sortOrder = params.sortOrder === 'desc' ? 'desc' : 'asc';

    const [total, departments] = await Promise.all([
      this.prisma.department.count({ where }),
      this.prisma.department.findMany({
        where,
        include: {
          departmentHead: {
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
            },
          },
          parentDepartment: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          _count: { select: { employments: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        ...(skip !== undefined && { skip }),
        ...(limit !== undefined && { take: limit }),
      }),
    ]);

    const items = departments.map((d: any) => ({
      ...d,
      employeeCount: d._count?.employments ?? 0,
    }));

    return {
      items,
      meta: {
        total,
        page: page || 1,
        limit: limit || total,
        totalPages: limit ? Math.ceil(total / limit) || 1 : 1,
      },
    };
  }

  async findDepartmentById(id: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: {
        departmentHead: {
          select: {
            id: true,
            displayName: true,
            employeeCode: true,
          },
        },
        parentDepartment: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        subDepartments: true,
        _count: { select: { employments: true } },
      },
    });

    if (!dept) {
      throw new NotFoundException(`Department #${id} not found`);
    }

    return {
      ...dept,
      employeeCount: dept._count.employments,
    };
  }

  async createDepartment(
    dto: CreateDepartmentDto,
    organizationId: string,
    performedByUserId?: string,
  ) {
    const existing = await this.prisma.department.findUnique({
      where: {
        organizationId_code: {
          organizationId,
          code: dto.code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Department code '${dto.code}' already exists`);
    }

    const department = await this.prisma.department.create({
      data: {
        ...dto,
        organizationId,
      },
    });

    await this.auditService.record({
      action: 'DEPARTMENT_CREATED',
      entity: 'Department',
      entityId: department.id,
      userId: performedByUserId,
      organizationId,
      metadata: { code: department.code, name: department.name },
    });

    return department;
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, performedByUserId?: string) {
    const dept = await this.findDepartmentById(id);

    if (dto.code && dto.code !== dept.code) {
      const duplicate = await this.prisma.department.findUnique({
        where: {
          organizationId_code: {
            organizationId: dept.organizationId,
            code: dto.code,
          },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Department code '${dto.code}' already exists`);
      }
    }

    // Prevent direct self-parenting
    if (dto.parentDepartmentId && dto.parentDepartmentId === id) {
      throw new BadRequestException('A department cannot be its own parent');
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: dto,
    });

    await this.auditService.record({
      action: 'DEPARTMENT_UPDATED',
      entity: 'Department',
      entityId: id,
      userId: performedByUserId,
      organizationId: dept.organizationId,
      metadata: { changes: dto },
    });

    return updated;
  }

  async deactivateDepartment(id: string, performedByUserId?: string) {
    const dept = await this.findDepartmentById(id);

    const updated = await this.prisma.department.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.record({
      action: 'DEPARTMENT_DEACTIVATED',
      entity: 'Department',
      entityId: id,
      userId: performedByUserId,
      organizationId: dept.organizationId,
      metadata: { employeeCount: dept.employeeCount },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Designation Operations
  // ---------------------------------------------------------------------------

  async findAllDesignations(params: {
    organizationId?: string;
    departmentId?: string;
    search?: string;
    status?: 'all' | 'active' | 'inactive';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: any = {};
    if (params.organizationId) {
      where.organizationId = params.organizationId;
    }
    if (params.departmentId) {
      where.departmentId = params.departmentId;
    }
    if (params.status === 'active') {
      where.isActive = true;
    } else if (params.status === 'inactive') {
      where.isActive = false;
    }
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const page = params.page ? Math.max(1, Number(params.page)) : undefined;
    const limit = params.limit ? Math.max(1, Number(params.limit)) : undefined;
    const skip = page && limit ? (page - 1) * limit : undefined;

    const allowedSortFields = ['level', 'title', 'code', 'createdAt', 'isActive'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy! : 'level';
    const sortOrder = params.sortOrder === 'desc' ? 'desc' : 'asc';

    const [total, designations] = await Promise.all([
      this.prisma.designation.count({ where }),
      this.prisma.designation.findMany({
        where,
        include: {
          department: {
            select: { id: true, name: true, code: true },
          },
          _count: { select: { employments: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        ...(skip !== undefined && { skip }),
        ...(limit !== undefined && { take: limit }),
      }),
    ]);

    const items = designations.map((d: any) => ({
      ...d,
      employeeCount: d._count?.employments ?? 0,
    }));

    return {
      items,
      meta: {
        total,
        page: page || 1,
        limit: limit || total,
        totalPages: limit ? Math.ceil(total / limit) || 1 : 1,
      },
    };
  }

  async findDesignationById(id: string) {
    const desig = await this.prisma.designation.findUnique({
      where: { id },
      include: {
        department: true,
        _count: { select: { employments: true } },
      },
    });

    if (!desig) {
      throw new NotFoundException(`Designation #${id} not found`);
    }

    return {
      ...desig,
      employeeCount: desig._count.employments,
    };
  }

  async createDesignation(
    dto: CreateDesignationDto,
    organizationId: string,
    performedByUserId?: string,
  ) {
    const existing = await this.prisma.designation.findUnique({
      where: {
        organizationId_code: {
          organizationId,
          code: dto.code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Designation code '${dto.code}' already exists`);
    }

    const designation = await this.prisma.designation.create({
      data: {
        ...dto,
        name: dto.name || dto.title,
        organizationId,
      },
    });

    await this.auditService.record({
      action: 'DESIGNATION_CREATED',
      entity: 'Designation',
      entityId: designation.id,
      userId: performedByUserId,
      organizationId,
      metadata: { code: designation.code, title: designation.title },
    });

    return designation;
  }

  async updateDesignation(id: string, dto: UpdateDesignationDto, performedByUserId?: string) {
    const desig = await this.findDesignationById(id);

    if (dto.code && dto.code !== desig.code) {
      const duplicate = await this.prisma.designation.findUnique({
        where: {
          organizationId_code: {
            organizationId: desig.organizationId,
            code: dto.code,
          },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Designation code '${dto.code}' already exists`);
      }
    }

    const updated = await this.prisma.designation.update({
      where: { id },
      data: {
        ...dto,
        name: dto.name || dto.title || desig.name,
      },
    });

    await this.auditService.record({
      action: 'DESIGNATION_UPDATED',
      entity: 'Designation',
      entityId: id,
      userId: performedByUserId,
      organizationId: desig.organizationId,
      metadata: { changes: dto },
    });

    return updated;
  }

  async deactivateDesignation(id: string, performedByUserId?: string) {
    const desig = await this.findDesignationById(id);

    const updated = await this.prisma.designation.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.record({
      action: 'DESIGNATION_DEACTIVATED',
      entity: 'Designation',
      entityId: id,
      userId: performedByUserId,
      organizationId: desig.organizationId,
      metadata: { employeeCount: desig.employeeCount },
    });

    return updated;
  }
}
