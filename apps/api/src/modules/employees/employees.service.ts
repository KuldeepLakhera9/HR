import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  TransitionStatusDto,
  EmployeeFilterDto,
} from './dto/employee.dto';
import {
  EmploymentStatus,
  EmployeeHistoryEventType,
  UserStatus,
  RoleCode,
  Prisma,
  Gender,
  EmploymentType,
  WorkMode,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import * as argon2 from 'argon2';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  // Allowed status lifecycle state transitions
  private static readonly VALID_STATUS_TRANSITIONS: Record<EmploymentStatus, EmploymentStatus[]> = {
    PROBATION: [EmploymentStatus.ACTIVE, EmploymentStatus.TERMINATED, EmploymentStatus.RESIGNED],
    ACTIVE: [EmploymentStatus.ON_NOTICE, EmploymentStatus.RESIGNED, EmploymentStatus.TERMINATED],
    ON_NOTICE: [EmploymentStatus.EXITED, EmploymentStatus.ACTIVE],
    RESIGNED: [EmploymentStatus.EXITED, EmploymentStatus.ACTIVE],
    TERMINATED: [EmploymentStatus.EXITED],
    EXITED: [], // Terminal state
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Data Scope Resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves permitted employee IDs based on user's role and data access scope:
   * - ADMIN / HR: Entire organization
   * - MANAGER: Self + direct & indirect reporting hierarchy
   * - EMPLOYEE: Self profile only
   */
  async getScopedEmployeeFilter(user: AuthenticatedUser): Promise<Prisma.EmployeeWhereInput> {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');

    if (isAdminOrHr) {
      return { organizationId: user.organizationId };
    }

    // Resolve user's employee record
    const userEmployee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ userId: user.id }, { employeeCode: user.employeeCode }],
      },
      select: { id: true },
    });

    if (!userEmployee) {
      // If user has no employee link, restrict to empty set
      return { id: '00000000-0000-0000-0000-000000000000' };
    }

    if (user.roles.includes('MANAGER')) {
      // Manager scope: Self + all recursive subordinates
      const subordinateIds = await this.getAllSubordinateEmployeeIds(
        userEmployee.id,
        user.organizationId,
      );
      const allowedIds = [userEmployee.id, ...subordinateIds];
      return {
        organizationId: user.organizationId,
        id: { in: allowedIds },
      };
    }

    // Default EMPLOYEE scope: Self only
    return {
      organizationId: user.organizationId,
      id: userEmployee.id,
    };
  }

  /**
   * Recursively finds all subordinate employee IDs reporting to manager
   */
  async getAllSubordinateEmployeeIds(
    managerEmployeeId: string,
    organizationId: string,
  ): Promise<string[]> {
    const subordinates = await this.prisma.employeeEmployment.findMany({
      where: {
        managerId: managerEmployeeId,
        employee: { organizationId },
      },
      select: { employeeId: true },
    });

    let allIds: string[] = subordinates.map((s) => s.employeeId);

    for (const sub of subordinates) {
      const childIds = await this.getAllSubordinateEmployeeIds(sub.employeeId, organizationId);
      allIds = allIds.concat(childIds);
    }

    return Array.from(new Set(allIds));
  }

  /**
   * Validates manager relationship:
   * 1. Employee cannot be their own manager
   * 2. Circular relationship detection (A -> B -> A)
   */
  async validateManagerHierarchy(
    employeeId: string | null,
    managerId: string | null | undefined,
    organizationId: string,
  ): Promise<void> {
    if (!managerId) return;

    if (employeeId && employeeId === managerId) {
      throw new BadRequestException('An employee cannot be their own manager');
    }

    // Verify manager exists in same organization
    const manager = await this.prisma.employee.findUnique({
      where: { id: managerId },
      select: { id: true, organizationId: true, isActive: true },
    });

    if (!manager || manager.organizationId !== organizationId) {
      throw new BadRequestException('Assigned manager does not exist in this organization');
    }

    if (!manager.isActive) {
      throw new BadRequestException('Cannot assign an inactive employee as manager');
    }

    if (!employeeId) return; // New employee creation cannot form a backward cycle yet

    // Follow manager ancestry up to detect cycles
    let currentAncestorId: string | null = managerId;
    const visited = new Set<string>();

    while (currentAncestorId) {
      if (currentAncestorId === employeeId) {
        throw new BadRequestException(
          'Circular manager relationship detected: the chosen manager reports directly or indirectly to this employee',
        );
      }
      if (visited.has(currentAncestorId)) {
        break; // Infinite loop safeguard
      }
      visited.add(currentAncestorId);

      const employmentRecord: { managerId: string | null } | null =
        await this.prisma.employeeEmployment.findUnique({
          where: { employeeId: currentAncestorId },
          select: { managerId: true },
        });

      currentAncestorId = employmentRecord?.managerId || null;
    }
  }

  // ---------------------------------------------------------------------------
  // Employee Directory & Retrieval
  // ---------------------------------------------------------------------------

  async findAll(user: AuthenticatedUser, query: EmployeeFilterDto) {
    const scopeFilter = await this.getScopedEmployeeFilter(user);

    const where: Prisma.EmployeeWhereInput = {
      AND: [scopeFilter],
    };

    const andConditions: Prisma.EmployeeWhereInput[] = [];

    if (query.search) {
      const term = query.search.trim();
      andConditions.push({
        OR: [
          { employeeCode: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { displayName: { contains: term, mode: 'insensitive' } },
          { contact: { workEmail: { contains: term, mode: 'insensitive' } } },
          { contact: { phone: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    if (query.status) {
      andConditions.push({ status: query.status });
    }

    // Employment sub-filters
    const employmentConditions: Prisma.EmployeeEmploymentWhereInput = {};
    if (query.departmentId) employmentConditions.departmentId = query.departmentId;
    if (query.designationId) employmentConditions.designationId = query.designationId;
    if (query.branchId) employmentConditions.branchId = query.branchId;
    if (query.managerId) employmentConditions.managerId = query.managerId;
    if (query.employmentType) employmentConditions.employmentType = query.employmentType;
    if (query.workMode) employmentConditions.workMode = query.workMode;

    if (Object.keys(employmentConditions).length > 0) {
      andConditions.push({ employment: employmentConditions });
    }

    if (andConditions.length > 0) {
      where.AND = [scopeFilter, ...andConditions];
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const allowedSortFields = ['displayName', 'employeeCode', 'joiningDate', 'createdAt', 'status'];
    const sortField =
      query.sortBy && allowedSortFields.includes(query.sortBy) ? query.sortBy : 'displayName';
    const sortDirection = query.sortOrder === 'desc' ? 'desc' : 'asc';

    const [total, records] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDirection },
        include: {
          employment: {
            include: {
              branch: { select: { id: true, name: true, code: true } },
              department: { select: { id: true, name: true, code: true } },
              designation: { select: { id: true, title: true, code: true } },
              manager: { select: { id: true, displayName: true, employeeCode: true } },
            },
          },
          contact: {
            select: { workEmail: true, phone: true },
          },
        },
      }),
    ]);

    const items = records.map((e) => ({
      id: e.id,
      userId: e.userId,
      employeeCode: e.employeeCode,
      firstName: e.firstName,
      middleName: e.middleName,
      lastName: e.lastName,
      displayName: e.displayName,
      profilePhoto: e.profilePhoto,
      status: e.status,
      joiningDate: e.joiningDate.toISOString(),
      workEmail: e.contact?.workEmail || null,
      phone: e.contact?.phone || null,
      branchName: e.employment?.branch?.name || null,
      branchId: e.employment?.branchId || null,
      departmentName: e.employment?.department?.name || null,
      departmentId: e.employment?.departmentId || null,
      designationTitle: e.employment?.designation?.title || null,
      designationId: e.employment?.designationId || null,
      managerName: e.employment?.manager?.displayName || null,
      managerId: e.employment?.managerId || null,
      employmentType: e.employment?.employmentType || null,
      workMode: e.employment?.workMode || null,
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findMe(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
      },
      include: {
        employment: {
          include: {
            branch: true,
            department: true,
            designation: true,
            manager: {
              select: {
                id: true,
                displayName: true,
                employeeCode: true,
                profilePhoto: true,
              },
            },
          },
        },
        contact: true,
        emergencyContacts: true,
        documents: true,
        history: {
          orderBy: { timestamp: 'desc' },
          include: {
            performedBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('No employee record linked to current user');
    }

    return employee;
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const existsInOrg = await this.prisma.employee.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });

    if (!existsInOrg || existsInOrg.organizationId !== user.organizationId) {
      throw new NotFoundException(`Employee #${id} not found`);
    }

    const scopeFilter = await this.getScopedEmployeeFilter(user);

    const employee = await this.prisma.employee.findFirst({
      where: {
        AND: [{ id }, scopeFilter],
      },
      include: {
        employment: {
          include: {
            branch: true,
            department: true,
            designation: true,
            manager: {
              select: {
                id: true,
                displayName: true,
                employeeCode: true,
                profilePhoto: true,
              },
            },
          },
        },
        contact: true,
        emergencyContacts: true,
        documents: true,
        history: {
          orderBy: { timestamp: 'desc' },
          include: {
            performedBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new ForbiddenException(
        `Access denied: You do not have permission to view employee #${id} outside your authorized scope`,
      );
    }

    return employee;
  }

  // ---------------------------------------------------------------------------
  // Create Employee Flow (Transactional)
  // ---------------------------------------------------------------------------

  async create(dto: CreateEmployeeDto, user: AuthenticatedUser) {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      throw new ForbiddenException('Only Admin and HR roles are authorized to create employees');
    }

    const orgId = user.organizationId;

    // 1. Check duplicate employee code
    const existingCode = await this.prisma.employee.findUnique({
      where: {
        organizationId_employeeCode: {
          organizationId: orgId,
          employeeCode: dto.employeeCode,
        },
      },
    });
    if (existingCode) {
      throw new ConflictException(`Employee code '${dto.employeeCode}' already exists`);
    }

    // 2. Check duplicate work email
    const existingEmail = await this.prisma.employeeContact.findFirst({
      where: {
        workEmail: dto.workEmail,
        employee: { organizationId: orgId },
      },
    });
    if (existingEmail) {
      throw new ConflictException(`Work email '${dto.workEmail}' is already registered`);
    }

    // 3. Verify Branch, Dept, Designation
    const [branch, dept, desig] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: dto.branchId } }),
      this.prisma.department.findUnique({ where: { id: dto.departmentId } }),
      this.prisma.designation.findUnique({ where: { id: dto.designationId } }),
    ]);

    if (!branch || branch.organizationId !== orgId) {
      throw new BadRequestException('Invalid or unauthorized branch specified');
    }
    if (!dept || dept.organizationId !== orgId) {
      throw new BadRequestException('Invalid or unauthorized department specified');
    }
    if (!desig || desig.organizationId !== orgId) {
      throw new BadRequestException('Invalid or unauthorized designation specified');
    }

    // 4. Validate manager hierarchy
    await this.validateManagerHierarchy(null, dto.managerId, orgId);

    const displayName =
      dto.displayName ||
      `${dto.firstName} ${dto.middleName ? dto.middleName + ' ' : ''}${dto.lastName}`.trim();

    // 5. Execute transactional creation
    const createdEmployee = await this.prisma.$transaction(async (tx) => {
      let createdUserId: string | null = null;

      // Provision User login account if requested
      if (dto.createLoginAccount !== false) {
        const initialPassword = dto.initialPassword || 'Welcome@123';
        const passwordHash = await argon2.hash(initialPassword);

        const existingUser = await tx.user.findFirst({
          where: { organizationId: orgId, email: dto.workEmail },
        });

        if (!existingUser) {
          const newUser = await tx.user.create({
            data: {
              organizationId: orgId,
              branchId: dto.branchId,
              departmentId: dto.departmentId,
              designationId: dto.designationId,
              employeeCode: dto.employeeCode,
              email: dto.workEmail,
              passwordHash,
              firstName: dto.firstName,
              lastName: dto.lastName,
              phone: dto.phone || null,
              status: UserStatus.ACTIVE,
            },
          });
          createdUserId = newUser.id;

          // Default role assignment: EMPLOYEE
          const empRole = await tx.role.findFirst({
            where: { organizationId: orgId, code: RoleCode.EMPLOYEE },
          });
          if (empRole) {
            await tx.userRole.create({
              data: {
                userId: newUser.id,
                roleId: empRole.id,
                assignedBy: user.id,
              },
            });
          }
        } else {
          createdUserId = existingUser.id;
        }
      }

      // Create Employee Record
      const emp = await tx.employee.create({
        data: {
          userId: createdUserId,
          organizationId: orgId,
          employeeCode: dto.employeeCode,
          firstName: dto.firstName,
          middleName: dto.middleName || null,
          lastName: dto.lastName,
          displayName,
          profilePhoto: dto.profilePhoto || null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender || Gender.PREFER_NOT_TO_SAY,
          status: dto.employmentStatus || EmploymentStatus.PROBATION,
          joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : new Date(),
        },
      });

      // Create Employment
      await tx.employeeEmployment.create({
        data: {
          employeeId: emp.id,
          branchId: dto.branchId,
          departmentId: dto.departmentId,
          designationId: dto.designationId,
          managerId: dto.managerId || null,
          employmentType: dto.employmentType || EmploymentType.FULL_TIME,
          employmentStatus: dto.employmentStatus || EmploymentStatus.PROBATION,
          workMode: dto.workMode || WorkMode.OFFICE,
          joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : new Date(),
          probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : null,
          noticePeriodDays: dto.noticePeriodDays ?? 30,
        },
      });

      // Create Contact
      await tx.employeeContact.create({
        data: {
          employeeId: emp.id,
          workEmail: dto.workEmail,
          personalEmail: dto.personalEmail || null,
          phone: dto.phone || null,
          alternatePhone: dto.alternatePhone || null,
          address: dto.address || null,
          city: dto.city || null,
          state: dto.state || null,
          postalCode: dto.postalCode || null,
          country: dto.country || 'India',
        },
      });

      // Create Emergency Contacts
      if (dto.emergencyContacts && dto.emergencyContacts.length > 0) {
        for (const ec of dto.emergencyContacts) {
          await tx.emergencyContact.create({
            data: {
              employeeId: emp.id,
              name: ec.name,
              relationship: ec.relationship,
              phone: ec.phone,
              alternatePhone: ec.alternatePhone || null,
              address: ec.address || null,
              isPrimary: ec.isPrimary ?? false,
            },
          });
        }
      }

      // Create initial JOINED history
      await tx.employeeHistory.create({
        data: {
          employeeId: emp.id,
          eventType: EmployeeHistoryEventType.JOINED,
          previousValue: null,
          newValue: emp.status,
          performedById: user.id,
          metadata: {
            employeeCode: emp.employeeCode,
            department: dept.name,
            designation: desig.title,
            branch: branch.name,
          },
        },
      });

      return emp;
    });

    await this.auditService.record({
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      entityId: createdEmployee.id,
      userId: user.id,
      organizationId: orgId,
      metadata: {
        employeeCode: createdEmployee.employeeCode,
        name: createdEmployee.displayName,
      },
    });

    return this.findOne(createdEmployee.id, user);
  }

  // ---------------------------------------------------------------------------
  // Update Employee (Tracks History on Changes)
  // ---------------------------------------------------------------------------

  async update(id: string, dto: UpdateEmployeeDto, user: AuthenticatedUser) {
    const existing = await this.findOne(id, user);

    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      const isSelf = existing.userId === user.id || existing.employeeCode === user.employeeCode;
      if (!isSelf && !user.roles.includes('MANAGER')) {
        throw new ForbiddenException('You are not authorized to update this employee profile');
      }

      // Prohibit non-Admin/HR from modifying organizational assignments
      if (
        dto.branchId ||
        dto.departmentId ||
        dto.designationId ||
        dto.managerId !== undefined ||
        dto.employmentType ||
        dto.workMode
      ) {
        throw new ForbiddenException(
          'Only Admin and HR roles can modify organizational assignments (branch, department, designation, manager, or employment terms)',
        );
      }
    }

    // Verify manager hierarchy if managerId is being modified
    if (dto.managerId !== undefined && dto.managerId !== existing.employment?.managerId) {
      await this.validateManagerHierarchy(id, dto.managerId, user.organizationId);
    }

    const historiesToCreate: Array<{
      eventType: EmployeeHistoryEventType;
      previousValue: string | null;
      newValue: string | null;
    }> = [];

    // Track department change
    if (dto.departmentId && dto.departmentId !== existing.employment?.departmentId) {
      const newDept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.DEPARTMENT_CHANGED,
        previousValue: existing.employment?.department?.name || null,
        newValue: newDept?.name || dto.departmentId,
      });
    }

    // Track designation change
    if (dto.designationId && dto.designationId !== existing.employment?.designationId) {
      const newDesig = await this.prisma.designation.findUnique({
        where: { id: dto.designationId },
      });
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.DESIGNATION_CHANGED,
        previousValue: existing.employment?.designation?.title || null,
        newValue: newDesig?.title || dto.designationId,
      });
    }

    // Track manager change
    if (dto.managerId !== undefined && dto.managerId !== existing.employment?.managerId) {
      const newMgr = dto.managerId
        ? await this.prisma.employee.findUnique({ where: { id: dto.managerId } })
        : null;
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.MANAGER_CHANGED,
        previousValue: existing.employment?.manager?.displayName || null,
        newValue: newMgr ? newMgr.displayName : 'None',
      });
    }

    // Track branch change
    if (dto.branchId && dto.branchId !== existing.employment?.branchId) {
      const newBranch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.BRANCH_CHANGED,
        previousValue: existing.employment?.branch?.name || null,
        newValue: newBranch?.name || dto.branchId,
      });
    }

    // Track work mode change
    if (dto.workMode && dto.workMode !== existing.employment?.workMode) {
      historiesToCreate.push({
        eventType: EmployeeHistoryEventType.WORK_MODE_CHANGED,
        previousValue: existing.employment?.workMode || null,
        newValue: dto.workMode,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Update Core Employee
      await tx.employee.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          displayName: dto.displayName,
          profilePhoto: dto.profilePhoto,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
        },
      });

      // 2. Update Employment
      if (existing.employment) {
        await tx.employeeEmployment.update({
          where: { employeeId: id },
          data: {
            branchId: dto.branchId,
            departmentId: dto.departmentId,
            designationId: dto.designationId,
            managerId: dto.managerId,
            employmentType: dto.employmentType,
            workMode: dto.workMode,
            noticePeriodDays: dto.noticePeriodDays,
            probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : undefined,
            confirmationDate: dto.confirmationDate ? new Date(dto.confirmationDate) : undefined,
          },
        });
      }

      // 3. Update Contact
      if (existing.contact) {
        await tx.employeeContact.update({
          where: { employeeId: id },
          data: {
            personalEmail: dto.personalEmail,
            phone: dto.phone,
            alternatePhone: dto.alternatePhone,
            address: dto.address,
            city: dto.city,
            state: dto.state,
            postalCode: dto.postalCode,
            country: dto.country,
          },
        });
      }

      // 4. Update Emergency Contacts if provided
      if (dto.emergencyContacts) {
        await tx.emergencyContact.deleteMany({ where: { employeeId: id } });
        for (const ec of dto.emergencyContacts) {
          await tx.emergencyContact.create({
            data: {
              employeeId: id,
              name: ec.name,
              relationship: ec.relationship,
              phone: ec.phone,
              alternatePhone: ec.alternatePhone || null,
              address: ec.address || null,
              isPrimary: ec.isPrimary ?? false,
            },
          });
        }
      }

      // 5. Record History Entries
      for (const h of historiesToCreate) {
        await tx.employeeHistory.create({
          data: {
            employeeId: id,
            eventType: h.eventType,
            previousValue: h.previousValue,
            newValue: h.newValue,
            performedById: user.id,
          },
        });
      }
    });

    await this.auditService.record({
      action: 'EMPLOYEE_UPDATED',
      entity: 'Employee',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { changes: historiesToCreate },
    });

    return this.findOne(id, user);
  }

  // ---------------------------------------------------------------------------
  // Controlled Status Lifecycle Transition
  // ---------------------------------------------------------------------------

  async transitionStatus(id: string, dto: TransitionStatusDto, user: AuthenticatedUser) {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      throw new ForbiddenException(
        'Only Admin and HR roles are authorized to transition employee status',
      );
    }

    const employee = await this.findOne(id, user);
    const currentStatus = employee.status;
    const nextStatus = dto.status;

    if (currentStatus === nextStatus) {
      return employee;
    }

    const allowedNextStatuses = EmployeesService.VALID_STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid status transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: [${allowedNextStatuses.join(
          ', ',
        )}]`,
      );
    }

    const exitDate =
      nextStatus === EmploymentStatus.EXITED || nextStatus === EmploymentStatus.TERMINATED
        ? dto.effectiveDate
          ? new Date(dto.effectiveDate)
          : new Date()
        : null;

    const isActive = nextStatus !== EmploymentStatus.EXITED;

    await this.prisma.$transaction(async (tx) => {
      // 1. Update Employee table
      await tx.employee.update({
        where: { id },
        data: {
          status: nextStatus,
          exitDate,
          isActive,
        },
      });

      // 2. Update EmployeeEmployment table
      await tx.employeeEmployment.update({
        where: { employeeId: id },
        data: {
          employmentStatus: nextStatus,
        },
      });

      // 3. If employee exited or terminated, lock or deactivate user account
      if (employee.userId && !isActive) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { status: UserStatus.INACTIVE, isActive: false },
        });
      }

      // 4. Record Employee History
      await tx.employeeHistory.create({
        data: {
          employeeId: id,
          eventType: EmployeeHistoryEventType.STATUS_CHANGED,
          previousValue: currentStatus,
          newValue: nextStatus,
          performedById: user.id,
          metadata: {
            reason: dto.reason || null,
            effectiveDate: dto.effectiveDate || null,
          },
        },
      });
    });

    await this.auditService.record({
      action: 'EMPLOYEE_STATUS_CHANGED',
      entity: 'Employee',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        from: currentStatus,
        to: nextStatus,
        reason: dto.reason,
      },
    });

    return this.findOne(id, user);
  }

  // ---------------------------------------------------------------------------
  // Deactivate Employee (Soft Deletion)
  // ---------------------------------------------------------------------------

  async deactivate(id: string, user: AuthenticatedUser) {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    if (!isAdminOrHr) {
      throw new ForbiddenException(
        'Only Admin and HR roles are authorized to deactivate employees',
      );
    }

    const employee = await this.findOne(id, user);

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { isActive: false, status: EmploymentStatus.EXITED },
      });

      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: false, status: UserStatus.INACTIVE },
        });
      }

      await tx.employeeHistory.create({
        data: {
          employeeId: id,
          eventType: EmployeeHistoryEventType.EXITED,
          previousValue: employee.status,
          newValue: EmploymentStatus.EXITED,
          performedById: user.id,
        },
      });
    });

    await this.auditService.record({
      action: 'EMPLOYEE_DEACTIVATED',
      entity: 'Employee',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
    });

    return { success: true, message: `Employee #${id} deactivated successfully` };
  }

  // ---------------------------------------------------------------------------
  // History Retrieval
  // ---------------------------------------------------------------------------

  async getHistory(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user); // Verify existence & scope

    const history = await this.prisma.employeeHistory.findMany({
      where: { employeeId: id },
      orderBy: { timestamp: 'desc' },
      include: {
        performedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return history;
  }

  // ---------------------------------------------------------------------------
  // Interactive Org Chart Hierarchy
  // ---------------------------------------------------------------------------

  async getOrgChart(params: { organizationId: string; departmentId?: string; branchId?: string }) {
    const where: Prisma.EmployeeWhereInput = {
      organizationId: params.organizationId,
      isActive: true,
    };

    if (params.departmentId || params.branchId) {
      const empWhere: Prisma.EmployeeEmploymentWhereInput = {};
      if (params.departmentId) empWhere.departmentId = params.departmentId;
      if (params.branchId) empWhere.branchId = params.branchId;
      where.employment = empWhere;
    }

    const employees = await this.prisma.employee.findMany({
      where,
      include: {
        employment: {
          include: {
            department: { select: { name: true } },
            designation: { select: { title: true } },
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: { displayName: 'asc' },
    });

    // Build node lookup map
    const nodeMap = new Map<
      string,
      {
        id: string;
        employeeCode: string;
        name: string;
        designation: string;
        department: string;
        branch: string;
        avatarUrl: string | null;
        status: EmploymentStatus;
        workMode: string;
        managerId: string | null;
        directReportsCount: number;
        subordinates: any[];
      }
    >();

    for (const e of employees) {
      nodeMap.set(e.id, {
        id: e.id,
        employeeCode: e.employeeCode,
        name: e.displayName,
        designation: e.employment?.designation?.title || 'Team Member',
        department: e.employment?.department?.name || 'General',
        branch: e.employment?.branch?.name || 'Main',
        avatarUrl: e.profilePhoto,
        status: e.status,
        workMode: e.employment?.workMode || 'OFFICE',
        managerId: e.employment?.managerId || null,
        directReportsCount: 0,
        subordinates: [],
      });
    }

    // Assemble hierarchical tree
    const rootNodes: any[] = [];

    for (const node of nodeMap.values()) {
      if (node.managerId && nodeMap.has(node.managerId)) {
        const parent = nodeMap.get(node.managerId)!;
        parent.subordinates.push(node);
        parent.directReportsCount += 1;
      } else {
        rootNodes.push(node);
      }
    }

    return rootNodes;
  }

  // ---------------------------------------------------------------------------
  // Bulk Employee Import (CSV & Excel)
  // ---------------------------------------------------------------------------

  async previewImport(fileBuffer: Buffer, organizationId: string) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    if (!rawRows || rawRows.length === 0) {
      throw new BadRequestException('Uploaded file is empty or contains no valid rows');
    }

    // Fetch existing lookup caches
    const [existingEmployees, branches, departments, designations] = await Promise.all([
      this.prisma.employee.findMany({
        where: { organizationId },
        select: { id: true, employeeCode: true, contact: { select: { workEmail: true } } },
      }),
      this.prisma.branch.findMany({
        where: { organizationId },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.department.findMany({
        where: { organizationId },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.designation.findMany({
        where: { organizationId },
        select: { id: true, code: true, title: true },
      }),
    ]);

    const existingCodes = new Set(existingEmployees.map((e) => e.employeeCode.toUpperCase()));
    const existingEmails = new Set(
      existingEmployees.map((e) => e.contact?.workEmail?.toLowerCase()).filter(Boolean),
    );

    const branchMap = new Map(branches.map((b) => [b.code.toUpperCase(), b.id]));
    const deptMap = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));
    const desigMap = new Map(designations.map((d) => [d.code.toUpperCase(), d.id]));

    const errors: Array<{ row: number; field: string; value: unknown; message: string }> = [];
    const validRows: any[] = [];
    const seenCodesInBatch = new Set<string>();
    const seenEmailsInBatch = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // Accounting for 1-indexed Excel + header row

      const code = String(row['employeeCode'] || row['Employee Code'] || row['code'] || '').trim();
      const firstName = String(row['firstName'] || row['First Name'] || '').trim();
      const lastName = String(row['lastName'] || row['Last Name'] || '').trim();
      const email = String(row['workEmail'] || row['Work Email'] || row['email'] || '')
        .trim()
        .toLowerCase();
      const deptCode = String(row['departmentCode'] || row['Department Code'] || '')
        .trim()
        .toUpperCase();
      const desigCode = String(row['designationCode'] || row['Designation Code'] || '')
        .trim()
        .toUpperCase();
      const branchCode = String(row['branchCode'] || row['Branch Code'] || '')
        .trim()
        .toUpperCase();
      const managerCode = String(row['managerEmployeeCode'] || row['Manager Code'] || '')
        .trim()
        .toUpperCase();

      let rowHasError = false;

      if (!code) {
        errors.push({
          row: rowNum,
          field: 'employeeCode',
          value: code,
          message: 'Employee Code is required',
        });
        rowHasError = true;
      } else if (existingCodes.has(code.toUpperCase())) {
        errors.push({
          row: rowNum,
          field: 'employeeCode',
          value: code,
          message: `Employee Code '${code}' already exists in database`,
        });
        rowHasError = true;
      } else if (seenCodesInBatch.has(code.toUpperCase())) {
        errors.push({
          row: rowNum,
          field: 'employeeCode',
          value: code,
          message: `Duplicate Employee Code '${code}' in upload batch`,
        });
        rowHasError = true;
      }

      if (!firstName) {
        errors.push({
          row: rowNum,
          field: 'firstName',
          value: firstName,
          message: 'First Name is required',
        });
        rowHasError = true;
      }

      if (!lastName) {
        errors.push({
          row: rowNum,
          field: 'lastName',
          value: lastName,
          message: 'Last Name is required',
        });
        rowHasError = true;
      }

      if (!email) {
        errors.push({
          row: rowNum,
          field: 'workEmail',
          value: email,
          message: 'Work Email is required',
        });
        rowHasError = true;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({
          row: rowNum,
          field: 'workEmail',
          value: email,
          message: 'Invalid email address format',
        });
        rowHasError = true;
      } else if (existingEmails.has(email)) {
        errors.push({
          row: rowNum,
          field: 'workEmail',
          value: email,
          message: `Email '${email}' already registered`,
        });
        rowHasError = true;
      } else if (seenEmailsInBatch.has(email)) {
        errors.push({
          row: rowNum,
          field: 'workEmail',
          value: email,
          message: `Duplicate email '${email}' in upload batch`,
        });
        rowHasError = true;
      }

      if (!deptCode || !deptMap.has(deptCode)) {
        errors.push({
          row: rowNum,
          field: 'departmentCode',
          value: deptCode,
          message: `Department '${deptCode}' not found`,
        });
        rowHasError = true;
      }

      if (!desigCode || !desigMap.has(desigCode)) {
        errors.push({
          row: rowNum,
          field: 'designationCode',
          value: desigCode,
          message: `Designation '${desigCode}' not found`,
        });
        rowHasError = true;
      }

      if (!branchCode || !branchMap.has(branchCode)) {
        errors.push({
          row: rowNum,
          field: 'branchCode',
          value: branchCode,
          message: `Branch '${branchCode}' not found`,
        });
        rowHasError = true;
      }

      if (code) seenCodesInBatch.add(code.toUpperCase());
      if (email) seenEmailsInBatch.add(email);

      if (!rowHasError) {
        validRows.push({
          rowNumber: rowNum,
          employeeCode: code,
          firstName,
          lastName,
          workEmail: email,
          phone: row['phone'] || row['Phone'] || null,
          departmentId: deptMap.get(deptCode)!,
          designationId: desigMap.get(desigCode)!,
          branchId: branchMap.get(branchCode)!,
          managerEmployeeCode: managerCode || null,
          employmentType: row['employmentType'] || EmploymentType.FULL_TIME,
          employmentStatus: row['employmentStatus'] || EmploymentStatus.PROBATION,
          workMode: row['workMode'] || WorkMode.OFFICE,
          joiningDate: row['joiningDate'] || new Date().toISOString(),
        });
      }
    }

    return {
      totalRows: rawRows.length,
      validRowsCount: validRows.length,
      errorRowsCount: errors.length,
      errors,
      previewData: validRows.slice(0, 10), // First 10 valid preview rows
      validatedRows: validRows, // Full payload passed to confirm step
    };
  }

  async confirmImport(rows: any[], user: AuthenticatedUser) {
    if (!rows || rows.length === 0) {
      throw new BadRequestException('No validated rows provided for import');
    }

    const orgId = user.organizationId;
    let importedCount = 0;

    // Password for imported accounts
    const passwordHash = await argon2.hash('Welcome@123');

    // Fetch existing employee lookup for manager resolution
    const existingEmployees = await this.prisma.employee.findMany({
      where: { organizationId: orgId },
      select: { id: true, employeeCode: true },
    });
    const managerLookup = new Map(
      existingEmployees.map((e) => [e.employeeCode.toUpperCase(), e.id]),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        // Resolve manager ID if provided
        let managerId: string | null = null;
        if (row.managerEmployeeCode && managerLookup.has(row.managerEmployeeCode.toUpperCase())) {
          managerId = managerLookup.get(row.managerEmployeeCode.toUpperCase())!;
        }

        // 1. Create user account
        const userAccount = await tx.user.create({
          data: {
            organizationId: orgId,
            branchId: row.branchId,
            departmentId: row.departmentId,
            designationId: row.designationId,
            employeeCode: row.employeeCode,
            email: row.workEmail,
            passwordHash,
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone,
            status: UserStatus.ACTIVE,
          },
        });

        const empRole = await tx.role.findFirst({
          where: { organizationId: orgId, code: RoleCode.EMPLOYEE },
        });
        if (empRole) {
          await tx.userRole.create({
            data: {
              userId: userAccount.id,
              roleId: empRole.id,
              assignedBy: user.id,
            },
          });
        }

        // 2. Create Employee
        const emp = await tx.employee.create({
          data: {
            userId: userAccount.id,
            organizationId: orgId,
            employeeCode: row.employeeCode,
            firstName: row.firstName,
            lastName: row.lastName,
            displayName: `${row.firstName} ${row.lastName}`.trim(),
            status: row.employmentStatus || EmploymentStatus.PROBATION,
            joiningDate: row.joiningDate ? new Date(row.joiningDate) : new Date(),
          },
        });

        // 3. Create Employment
        await tx.employeeEmployment.create({
          data: {
            employeeId: emp.id,
            branchId: row.branchId,
            departmentId: row.departmentId,
            designationId: row.designationId,
            managerId,
            employmentType: row.employmentType || EmploymentType.FULL_TIME,
            employmentStatus: row.employmentStatus || EmploymentStatus.PROBATION,
            workMode: row.workMode || WorkMode.OFFICE,
            joiningDate: row.joiningDate ? new Date(row.joiningDate) : new Date(),
          },
        });

        // 4. Create Contact
        await tx.employeeContact.create({
          data: {
            employeeId: emp.id,
            workEmail: row.workEmail,
            phone: row.phone,
          },
        });

        // 5. Create History Record
        await tx.employeeHistory.create({
          data: {
            employeeId: emp.id,
            eventType: EmployeeHistoryEventType.JOINED,
            previousValue: null,
            newValue: emp.status,
            performedById: user.id,
            metadata: { importBatch: true },
          },
        });

        managerLookup.set(row.employeeCode.toUpperCase(), emp.id);
        importedCount++;
      }
    });

    await this.auditService.record({
      action: 'EMPLOYEE_IMPORTED',
      entity: 'Employee',
      userId: user.id,
      organizationId: orgId,
      metadata: { count: importedCount },
    });

    return {
      success: true,
      message: `Successfully imported ${importedCount} employee records`,
      count: importedCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Export Employees (CSV / Excel)
  // ---------------------------------------------------------------------------

  async exportEmployees(
    user: AuthenticatedUser,
    format: 'csv' | 'xlsx' = 'csv',
    query: EmployeeFilterDto,
  ) {
    const listResult = await this.findAll(user, { ...query, limit: 10000 });

    const exportRows = listResult.items.map((e) => ({
      'Employee Code': e.employeeCode,
      'Full Name': e.displayName,
      'Work Email': e.workEmail || '',
      Phone: e.phone || '',
      Department: e.departmentName || '',
      Designation: e.designationTitle || '',
      Branch: e.branchName || '',
      Manager: e.managerName || '',
      Status: e.status,
      'Work Mode': e.workMode || '',
      'Employment Type': e.employmentType || '',
      'Joining Date': e.joiningDate.split('T')[0],
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');

    if (format === 'xlsx') {
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `employees_export_${new Date().toISOString().split('T')[0]}.xlsx`,
      };
    } else {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      return {
        buffer: Buffer.from(csv, 'utf-8'),
        contentType: 'text/csv',
        filename: `employees_export_${new Date().toISOString().split('T')[0]}.csv`,
      };
    }
  }
}
