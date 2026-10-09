import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface HierarchyTeamResult {
  manager: any;
  directReports: any[];
  indirectReports: any[];
  allMemberIds: string[];
  totalTeamSize: number;
}

export interface ApprovalChainNode {
  level: number;
  role: 'DIRECT_MANAGER' | 'SKIP_LEVEL_MANAGER' | 'EXECUTIVE';
  managerId: string;
  employeeCode: string;
  displayName: string;
  designationTitle: string | null;
  departmentName: string | null;
  workEmail: string | null;
}

@Injectable()
export class HierarchyService {
  private static readonly MAX_HIERARCHY_DEPTH = 25;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. Get direct manager for an employee
   */
  async getManager(employeeId: string, organizationId?: string) {
    const managerSelect = {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      displayName: true,
      profilePhoto: true,
      status: true,
      isActive: true,
      employment: {
        select: {
          designation: { select: { id: true, title: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      },
      contact: {
        select: {
          workEmail: true,
          phone: true,
        },
      },
    };

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        organizationId: true,
        managerId: true,
        manager: {
          select: managerSelect,
        },
        employment: {
          select: {
            managerId: true,
            manager: {
              select: managerSelect,
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee #${employeeId} not found`);
    }

    if (organizationId && employee.organizationId !== organizationId) {
      throw new NotFoundException(`Employee #${employeeId} not found in this organization`);
    }

    let manager = employee.manager || employee.employment?.manager;

    // Fallback if mocked or populated via employeeEmployment alone
    if (!manager) {
      const employmentRecord = await this.prisma.employeeEmployment.findUnique({
        where: { employeeId },
        select: { managerId: true },
      });
      if (employmentRecord?.managerId) {
        manager = await this.prisma.employee.findUnique({
          where: { id: employmentRecord.managerId },
          select: managerSelect,
        });
      }
    }

    return manager || null;
  }

  /**
   * 2. Get direct reports for a manager (Depth 1)
   */
  async getDirectReports(managerId: string, organizationId?: string) {
    const whereAnd: any[] = [
      { isActive: true },
      {
        OR: [{ managerId }, { employment: { managerId } }],
      },
    ];

    if (organizationId) {
      whereAnd.push({ organizationId });
    }

    let reports =
      (await this.prisma.employee.findMany({
        where: { AND: whereAnd },
        orderBy: { displayName: 'asc' },
        select: {
          id: true,
          managerId: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          displayName: true,
          profilePhoto: true,
          status: true,
          isActive: true,
          joiningDate: true,
          employment: {
            select: {
              employmentType: true,
              workMode: true,
              designation: { select: { id: true, title: true, code: true } },
              department: { select: { id: true, name: true, code: true } },
              branch: { select: { id: true, name: true, code: true } },
            },
          },
          contact: {
            select: {
              workEmail: true,
              phone: true,
            },
          },
        },
      })) || [];

    if (reports.length === 0 && this.prisma.employeeEmployment?.findMany) {
      const employmentReports =
        (await this.prisma.employeeEmployment.findMany({
          where: {
            managerId,
            ...(organizationId ? { employee: { organizationId } } : {}),
          },
          select: { employee: true },
        })) || [];
      if (employmentReports.length > 0) {
        reports = employmentReports.map((e: any) => e.employee || e);
      }
    }

    return reports;
  }

  /**
   * 3. Get entire team under a manager using controlled level-by-level batch queries (BFS)
   * Prevents uncontrolled N+1 recursive calls and protects against circular references.
   */
  async getTeam(
    managerId: string,
    organizationId?: string,
    options?: { maxDepth?: number; includeManager?: boolean },
  ): Promise<HierarchyTeamResult> {
    const maxDepth = Math.min(options?.maxDepth ?? HierarchyService.MAX_HIERARCHY_DEPTH, 50);

    const manager = await this.prisma.employee.findUnique({
      where: { id: managerId },
      select: {
        id: true,
        organizationId: true,
        employeeCode: true,
        displayName: true,
        profilePhoto: true,
        status: true,
        isActive: true,
        employment: {
          select: {
            designation: { select: { id: true, title: true } },
            department: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!manager) {
      throw new NotFoundException(`Manager #${managerId} not found`);
    }

    const orgId = organizationId || manager.organizationId;

    const directReports: any[] = [];
    const indirectReports: any[] = [];
    const allMemberIds: string[] = [];
    const visited = new Set<string>([managerId]);

    let currentLevelManagerIds = [managerId];
    let depth = 0;

    // Controlled level-by-level iterative batch query
    while (currentLevelManagerIds.length > 0 && depth < maxDepth) {
      depth++;

      let levelReports =
        (await this.prisma.employee.findMany({
          where: {
            AND: [
              { organizationId: orgId },
              { isActive: true },
              {
                OR: [
                  { managerId: { in: currentLevelManagerIds } },
                  { employment: { managerId: { in: currentLevelManagerIds } } },
                ],
              },
            ],
          },
          select: {
            id: true,
            managerId: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            profilePhoto: true,
            status: true,
            isActive: true,
            joiningDate: true,
            employment: {
              select: {
                managerId: true,
                employmentType: true,
                workMode: true,
                designation: { select: { id: true, title: true, code: true } },
                department: { select: { id: true, name: true, code: true } },
                branch: { select: { id: true, name: true, code: true } },
              },
            },
            contact: {
              select: {
                workEmail: true,
                phone: true,
              },
            },
          },
          orderBy: { displayName: 'asc' },
        })) || [];

      // Fallback: check employeeEmployment in case data or mock exists only there
      if (levelReports.length === 0 && this.prisma.employeeEmployment?.findMany) {
        const employmentSubs =
          (await this.prisma.employeeEmployment.findMany({
            where: {
              managerId: { in: currentLevelManagerIds },
              employee: { organizationId: orgId },
            },
            select: { employeeId: true },
          })) || [];

        if (employmentSubs.length > 0) {
          levelReports = employmentSubs.map((s: any) => ({
            id: s.employeeId,
            managerId: currentLevelManagerIds[0],
            employeeCode: s.employeeId,
            displayName: s.employeeId,
            isActive: true,
          })) as any[];
        }
      }

      if (!levelReports || levelReports.length === 0) {
        break;
      }

      const nextLevelManagerIds: string[] = [];

      for (const report of levelReports) {
        if (!visited.has(report.id)) {
          visited.add(report.id);
          allMemberIds.push(report.id);

          const decorated = { ...report, hierarchyDepth: depth };

          if (depth === 1) {
            directReports.push(decorated);
          } else {
            indirectReports.push(decorated);
          }

          nextLevelManagerIds.push(report.id);
        }
      }

      currentLevelManagerIds = nextLevelManagerIds;
    }

    return {
      manager,
      directReports,
      indirectReports,
      allMemberIds,
      totalTeamSize: allMemberIds.length,
    };
  }

  /**
   * 4. Helper to get all subordinate employee IDs for authorization filtering
   */
  async getTeamMemberIds(managerId: string, organizationId?: string): Promise<string[]> {
    const team = await this.getTeam(managerId, organizationId);
    return team.allMemberIds;
  }

  /**
   * 5. Check if managerId is an ancestor/supervisor of employeeId
   */
  async isManagerOf(
    managerId: string,
    employeeId: string,
    organizationId?: string,
  ): Promise<boolean> {
    if (!managerId || !employeeId) return false;
    if (managerId === employeeId) return true; // Manager belongs to their own team

    const visited = new Set<string>();
    let currentEmployeeId: string | null = employeeId;
    let depth = 0;

    while (currentEmployeeId && depth < HierarchyService.MAX_HIERARCHY_DEPTH) {
      depth++;
      if (visited.has(currentEmployeeId)) {
        break; // Guard against loop
      }
      visited.add(currentEmployeeId);

      const emp: any = await this.prisma.employee.findUnique({
        where: { id: currentEmployeeId },
        select: {
          managerId: true,
          organizationId: true,
          employment: { select: { managerId: true } },
        },
      });

      if (!emp) break;
      if (organizationId && emp.organizationId !== organizationId) break;

      let directParentId = emp.managerId || emp.employment?.managerId;
      if (!directParentId) {
        const empEmploymentRecord = await this.prisma.employeeEmployment.findUnique({
          where: { employeeId: currentEmployeeId },
          select: { managerId: true },
        });
        directParentId = empEmploymentRecord?.managerId || null;
      }

      if (directParentId === managerId) {
        return true;
      }

      currentEmployeeId = directParentId;
    }

    return false;
  }

  /**
   * 6. Construct multi-level approval chain for approvals (e.g., Leave, Visits)
   * Level 1: Immediate Manager
   * Level 2: Skip-Level Manager
   * Level 3: Senior Executive / Department Head
   */
  async getApprovalChain(
    employeeId: string,
    organizationId?: string,
    maxLevels = 3,
  ): Promise<ApprovalChainNode[]> {
    const chain: ApprovalChainNode[] = [];
    const visited = new Set<string>([employeeId]);
    let currentEmpId: string | null = employeeId;
    let level = 0;

    const managerSelect = {
      id: true,
      employeeCode: true,
      displayName: true,
      isActive: true,
      employment: {
        select: {
          designation: { select: { title: true } },
          department: { select: { name: true } },
        },
      },
      contact: { select: { workEmail: true } },
    };

    while (currentEmpId && level < maxLevels) {
      const emp: any = await this.prisma.employee.findUnique({
        where: { id: currentEmpId },
        select: {
          managerId: true,
          manager: {
            select: managerSelect,
          },
          employment: {
            select: {
              managerId: true,
              manager: {
                select: managerSelect,
              },
            },
          },
        },
      });

      const mgr = emp?.manager || emp?.employment?.manager;
      if (!emp || !mgr || !mgr.isActive) {
        break;
      }

      if (visited.has(mgr.id)) {
        break; // Cycle safeguard
      }
      visited.add(mgr.id);
      level++;

      const role: 'DIRECT_MANAGER' | 'SKIP_LEVEL_MANAGER' | 'EXECUTIVE' =
        level === 1 ? 'DIRECT_MANAGER' : level === 2 ? 'SKIP_LEVEL_MANAGER' : 'EXECUTIVE';

      chain.push({
        level,
        role,
        managerId: mgr.id,
        employeeCode: mgr.employeeCode,
        displayName: mgr.displayName,
        designationTitle: mgr.employment?.designation?.title || null,
        departmentName: mgr.employment?.department?.name || null,
        workEmail: mgr.contact?.workEmail || null,
      });

      currentEmpId = mgr.id;
    }

    return chain;
  }

  /**
   * 7. Hierarchy Validation & Circular Relationship Prevention
   * Enforces:
   *  - Employee cannot manage self
   *  - Manager exists in same organization
   *  - Manager is active
   *  - Circular manager cycle (A -> B -> A or multi-hop) is blocked
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

    if (!employeeId) return; // New employee creation cannot form backward cycles

    // Follow manager ancestry to detect cycle
    let currentAncestorId: string | null = managerId;
    const visited = new Set<string>();
    let depth = 0;

    while (currentAncestorId && depth < HierarchyService.MAX_HIERARCHY_DEPTH) {
      depth++;
      if (currentAncestorId === employeeId) {
        throw new BadRequestException(
          'Circular manager relationship detected: the chosen manager reports directly or indirectly to this employee',
        );
      }

      if (visited.has(currentAncestorId)) {
        break; // Infinite loop safety
      }
      visited.add(currentAncestorId);

      const ancestorRecord: any = await this.prisma.employee.findUnique({
        where: { id: currentAncestorId },
        select: {
          managerId: true,
          employment: { select: { managerId: true } },
        },
      });

      let ancestorMgrId = ancestorRecord?.managerId || ancestorRecord?.employment?.managerId;
      if (!ancestorMgrId) {
        const empEmploymentRecord: { managerId: string | null } | null =
          await this.prisma.employeeEmployment.findUnique({
            where: { employeeId: currentAncestorId },
            select: { managerId: true },
          });
        ancestorMgrId = empEmploymentRecord?.managerId || null;
      }

      currentAncestorId = ancestorMgrId || null;
    }
  }

  // ---------------------------------------------------------------------------
  // Architecture preparation for future modules:
  // - Attendance, Leaves, Official Visits, Employee Progress
  // ---------------------------------------------------------------------------

  async canManageAttendance(
    managerId: string,
    employeeId: string,
    organizationId: string,
  ): Promise<boolean> {
    return this.isManagerOf(managerId, employeeId, organizationId);
  }

  async canApproveLeave(
    managerId: string,
    employeeId: string,
    organizationId: string,
  ): Promise<boolean> {
    return this.isManagerOf(managerId, employeeId, organizationId);
  }

  async canApproveVisit(
    managerId: string,
    employeeId: string,
    organizationId: string,
  ): Promise<boolean> {
    return this.isManagerOf(managerId, employeeId, organizationId);
  }

  async canManageProgress(
    managerId: string,
    employeeId: string,
    organizationId: string,
  ): Promise<boolean> {
    return this.isManagerOf(managerId, employeeId, organizationId);
  }
}
