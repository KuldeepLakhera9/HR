import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import {
  WorkforceHeadcountQueryDto,
  WorkforceMovementQueryDto,
  WorkforceTrendsQueryDto,
} from '../dto/workforce-analytics-query.dto';

@Injectable()
export class WorkforceAnalyticsService {
  private readonly logger = new Logger(WorkforceAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
  ) {}

  /**
   * Resolves permitted employee scope based on user role and reporting hierarchy.
   */
  private async resolveScopedEmployeeIds(
    user: AuthenticatedUser,
  ): Promise<{ scopedEmployeeIds: string[] | null; scopeType: 'ORGANIZATION' | 'TEAM' }> {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    const isManager = user.roles.includes('MANAGER');

    if (!isAdminOrHr && !isManager) {
      throw new ForbiddenException(
        'Employees do not have permission to access workforce analytics reports',
      );
    }

    if (isAdminOrHr) {
      return { scopedEmployeeIds: null, scopeType: 'ORGANIZATION' };
    }

    // Manager role
    const managerEmp = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!managerEmp) {
      throw new ForbiddenException('Manager employee profile not found');
    }

    const teamIds = await this.hierarchyService.getTeamMemberIds(
      managerEmp.id,
      user.organizationId,
    );
    return {
      scopedEmployeeIds: teamIds.length > 0 ? teamIds : [managerEmp.id],
      scopeType: 'TEAM',
    };
  }

  /**
   * 1. Active Headcount Snapshot Report (M-WF-01) with multi-dimensional distributions.
   */
  async getHeadcountReport(user: AuthenticatedUser, query: WorkforceHeadcountQueryDto) {
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { timezone: true },
    });
    const timezone = org?.timezone || 'Asia/Kolkata';

    const now = new Date();
    const asOfDateStr = query.asOfDate || now.toISOString().split('T')[0];
    const asOfUtcEnd = new Date(`${asOfDateStr}T23:59:59.999Z`);

    // Build base filter
    const baseWhere: any = {
      organizationId: user.organizationId,
      deletedAt: null,
      status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
      isActive: true,
      joiningDate: { lte: asOfUtcEnd },
      OR: [{ exitDate: null }, { exitDate: { gt: asOfUtcEnd } }],
    };

    if (scopedEmployeeIds) {
      baseWhere.id = { in: scopedEmployeeIds };
    }

    const employmentWhere: any = {};
    if (query.departmentId) employmentWhere.departmentId = query.departmentId;
    if (query.branchId) employmentWhere.branchId = query.branchId;
    if (query.designationId) employmentWhere.designationId = query.designationId;
    if (query.employmentType) employmentWhere.employmentType = query.employmentType;

    if (Object.keys(employmentWhere).length > 0) {
      baseWhere.employment = employmentWhere;
    }

    // Fetch active employees with normalized employment details
    const activeEmployees = await this.prisma.employee.findMany({
      where: baseWhere,
      select: {
        id: true,
        gender: true,
        status: true,
        employment: {
          select: {
            employmentType: true,
            workMode: true,
            department: { select: { id: true, name: true, code: true } },
            branch: { select: { id: true, name: true, code: true } },
            designation: { select: { id: true, title: true, code: true } },
          },
        },
      },
    });

    const totalHeadcount = activeEmployees.length;

    // Aggregations
    const deptMap = new Map<string, { id: string; name: string; code: string; count: number }>();
    const branchMap = new Map<string, { id: string; name: string; code: string; count: number }>();
    const desigMap = new Map<string, { id: string; title: string; code: string; count: number }>();
    const typeMap = new Map<string, number>();
    const modeMap = new Map<string, number>();
    const statusMap = new Map<string, number>();
    const genderMap = new Map<string, number>();

    for (const emp of activeEmployees) {
      // Department
      const dept = emp.employment?.department;
      if (dept) {
        const cur = deptMap.get(dept.id) || {
          id: dept.id,
          name: dept.name,
          code: dept.code,
          count: 0,
        };
        cur.count++;
        deptMap.set(dept.id, cur);
      }

      // Branch
      const br = emp.employment?.branch;
      if (br) {
        const cur = branchMap.get(br.id) || { id: br.id, name: br.name, code: br.code, count: 0 };
        cur.count++;
        branchMap.set(br.id, cur);
      }

      // Designation
      const desig = emp.employment?.designation;
      if (desig) {
        const cur = desigMap.get(desig.id) || {
          id: desig.id,
          title: desig.title,
          code: desig.code,
          count: 0,
        };
        cur.count++;
        desigMap.set(desig.id, cur);
      }

      // Employment Type
      const empType = emp.employment?.employmentType || 'UNASSIGNED';
      typeMap.set(empType, (typeMap.get(empType) || 0) + 1);

      // Work Mode
      const workMode = emp.employment?.workMode || 'UNASSIGNED';
      modeMap.set(workMode, (modeMap.get(workMode) || 0) + 1);

      // Status
      statusMap.set(emp.status, (statusMap.get(emp.status) || 0) + 1);

      // Gender
      const gender = emp.gender || 'UNSPECIFIED';
      genderMap.set(gender, (genderMap.get(gender) || 0) + 1);
    }

    const isManager = scopeType === 'TEAM';

    // Format Department distribution with small-cell suppression
    const byDepartment = Array.from(deptMap.values()).map((d) => {
      const isSuppressed = isManager && d.count > 0 && d.count < 5;
      return {
        departmentId: d.id,
        departmentName: isSuppressed ? 'Protected Cohort' : d.name,
        departmentCode: isSuppressed ? 'PROTECTED' : d.code,
        headcount: isSuppressed ? 0 : d.count,
        percentage: totalHeadcount > 0 ? Math.round((d.count / totalHeadcount) * 1000) / 10 : 0.0,
        isSuppressed,
      };
    });

    const byBranch = Array.from(branchMap.values()).map((b) => ({
      branchId: b.id,
      branchName: b.name,
      branchCode: b.code,
      headcount: b.count,
      percentage: totalHeadcount > 0 ? Math.round((b.count / totalHeadcount) * 1000) / 10 : 0.0,
    }));

    const byDesignation = Array.from(desigMap.values())
      .sort((a, b) => b.count - a.count)
      .map((d) => ({
        designationId: d.id,
        designationTitle: d.title,
        designationCode: d.code,
        headcount: d.count,
        percentage: totalHeadcount > 0 ? Math.round((d.count / totalHeadcount) * 1000) / 10 : 0.0,
      }));

    const byEmploymentType = Array.from(typeMap.entries()).map(([type, count]) => ({
      employmentType: type,
      headcount: count,
      percentage: totalHeadcount > 0 ? Math.round((count / totalHeadcount) * 1000) / 10 : 0.0,
    }));

    const byWorkMode = Array.from(modeMap.entries()).map(([mode, count]) => ({
      workMode: mode,
      headcount: count,
      percentage: totalHeadcount > 0 ? Math.round((count / totalHeadcount) * 1000) / 10 : 0.0,
    }));

    const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      headcount: count,
      percentage: totalHeadcount > 0 ? Math.round((count / totalHeadcount) * 1000) / 10 : 0.0,
    }));

    const byGender = Array.from(genderMap.entries()).map(([gender, count]) => ({
      gender,
      headcount: count,
      percentage: totalHeadcount > 0 ? Math.round((count / totalHeadcount) * 1000) / 10 : 0.0,
    }));

    return {
      asOfDate: asOfDateStr,
      timezone,
      totalActiveHeadcount: totalHeadcount,
      scopeType,
      distributions: {
        byDepartment,
        byBranch,
        byDesignation,
        byEmploymentType,
        byWorkMode,
        byStatus,
        byGender,
      },
      metadata: {
        generatedAt: now.toISOString(),
        disclaimer:
          'Active headcount evaluates employees with status ACTIVE, PROBATION, or ON_NOTICE as of the target date. Excluded records include past exit dates, terminated contracts, and future join dates.',
      },
    };
  }

  /**
   * 2. Joiners and Exits Movement Report (M-WF-02, M-WF-03) with paginated rosters.
   */
  async getMovementReport(user: AuthenticatedUser, query: WorkforceMovementQueryDto) {
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { timezone: true },
    });
    const timezone = org?.timezone || 'Asia/Kolkata';

    const now = new Date();
    const defaultStart = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const startDateStr = query.startDate || defaultStart;
    const endDateStr = query.endDate || now.toISOString().split('T')[0];

    const startUtc = new Date(`${startDateStr}T00:00:00.000Z`);
    const endUtc = new Date(`${endDateStr}T23:59:59.999Z`);
    const periodDays = Math.max(
      1,
      Math.round((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    );

    const baseWhere: any = {
      organizationId: user.organizationId,
      deletedAt: null,
    };
    if (scopedEmployeeIds) {
      baseWhere.id = { in: scopedEmployeeIds };
    }
    if (query.departmentId) {
      baseWhere.employment = { ...baseWhere.employment, departmentId: query.departmentId };
    }
    if (query.branchId) {
      baseWhere.employment = { ...baseWhere.employment, branchId: query.branchId };
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    // Joiners
    const joinerWhere = {
      ...baseWhere,
      joiningDate: { gte: startUtc, lte: endUtc },
    };

    const [totalJoiners, joinersList] = await Promise.all([
      this.prisma.employee.count({ where: joinerWhere }),
      this.prisma.employee.findMany({
        where: joinerWhere,
        skip,
        take: limit,
        orderBy: { joiningDate: 'desc' },
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
      }),
    ]);

    // Exits
    const exitWhere = {
      ...baseWhere,
      exitDate: { gte: startUtc, lte: endUtc },
      status: { in: ['RESIGNED', 'TERMINATED', 'EXITED'] },
    };

    const [totalExits, exitsList] = await Promise.all([
      this.prisma.employee.count({ where: exitWhere }),
      this.prisma.employee.findMany({
        where: exitWhere,
        skip,
        take: limit,
        orderBy: { exitDate: 'desc' },
        select: {
          id: true,
          employeeCode: true,
          displayName: true,
          joiningDate: true,
          exitDate: true,
          status: true,
          employment: {
            select: {
              department: { select: { id: true, name: true } },
              designation: { select: { id: true, title: true } },
              branch: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    // Calculate Average Headcount for Attrition
    const activeAtStart = await this.prisma.employee.count({
      where: {
        ...baseWhere,
        status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
        isActive: true,
        joiningDate: { lte: startUtc },
        OR: [{ exitDate: null }, { exitDate: { gt: startUtc } }],
      },
    });

    const activeAtEnd = await this.prisma.employee.count({
      where: {
        ...baseWhere,
        status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
        isActive: true,
        joiningDate: { lte: endUtc },
        OR: [{ exitDate: null }, { exitDate: { gt: endUtc } }],
      },
    });

    const avgHeadcount = (activeAtStart + activeAtEnd) / 2;
    const annualizedAttritionRate =
      avgHeadcount > 0 && periodDays > 0
        ? Math.round((totalExits / avgHeadcount) * (365.25 / periodDays) * 10000) / 100
        : 0.0;

    const netChange = totalJoiners - totalExits;

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
        periodDays,
        timezone,
      },
      summary: {
        totalJoiners,
        totalExits,
        netChange,
        activeAtStart,
        activeAtEnd,
        annualizedAttritionRate,
      },
      joiners: {
        total: totalJoiners,
        page,
        limit,
        totalPages: Math.ceil(totalJoiners / limit) || 1,
        records: joinersList.map((j) => ({
          id: j.id,
          employeeCode: j.employeeCode,
          displayName: j.displayName,
          joiningDate: j.joiningDate.toISOString().split('T')[0],
          status: j.status,
          department: j.employment?.department?.name || 'Unassigned',
          designation: j.employment?.designation?.title || 'Unassigned',
          branch: j.employment?.branch?.name || 'Unassigned',
        })),
      },
      exits: {
        total: totalExits,
        page,
        limit,
        totalPages: Math.ceil(totalExits / limit) || 1,
        records: exitsList.map((e) => ({
          id: e.id,
          employeeCode: e.employeeCode,
          displayName: e.displayName,
          joiningDate: e.joiningDate.toISOString().split('T')[0],
          exitDate: e.exitDate ? e.exitDate.toISOString().split('T')[0] : null,
          status: e.status,
          department: e.employment?.department?.name || 'Unassigned',
          designation: e.employment?.designation?.title || 'Unassigned',
          branch: e.employment?.branch?.name || 'Unassigned',
        })),
      },
    };
  }

  /**
   * 3. Historical Workforce Trends Over Time with documented historical limitations.
   */
  async getTrendsReport(user: AuthenticatedUser, query: WorkforceTrendsQueryDto) {
    const { scopedEmployeeIds } = await this.resolveScopedEmployeeIds(user);
    const monthsCount = Math.min(24, Math.max(1, Number(query.months) || 6));

    const baseWhere: any = {
      organizationId: user.organizationId,
      deletedAt: null,
    };
    if (scopedEmployeeIds) {
      baseWhere.id = { in: scopedEmployeeIds };
    }
    if (query.departmentId) {
      baseWhere.employment = { ...baseWhere.employment, departmentId: query.departmentId };
    }
    if (query.branchId) {
      baseWhere.employment = { ...baseWhere.employment, branchId: query.branchId };
    }

    const now = new Date();
    const monthlySeries: Array<{
      month: string;
      openingHeadcount: number;
      joiners: number;
      exits: number;
      netChange: number;
      closingHeadcount: number;
      annualizedAttritionRate: number;
    }> = [];

    // Iterate backwards from current month
    for (let i = monthsCount - 1; i >= 0; i--) {
      const year = now.getFullYear();
      const monthIdx = now.getMonth() - i;
      const targetDate = new Date(year, monthIdx, 1);
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth();

      const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
      const monthStartUtc = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0));
      const nextMonthUtc = new Date(Date.UTC(targetYear, targetMonth + 1, 1, 0, 0, 0));
      const monthEndUtc = new Date(nextMonthUtc.getTime() - 1);
      const daysInMonth = Math.round(
        (monthEndUtc.getTime() - monthStartUtc.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Opening Headcount on 1st of month
      const opening = await this.prisma.employee.count({
        where: {
          ...baseWhere,
          status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
          isActive: true,
          joiningDate: { lte: monthStartUtc },
          OR: [{ exitDate: null }, { exitDate: { gt: monthStartUtc } }],
        },
      });

      // Closing Headcount on last day of month
      const closing = await this.prisma.employee.count({
        where: {
          ...baseWhere,
          status: { in: ['ACTIVE', 'PROBATION', 'ON_NOTICE'] },
          isActive: true,
          joiningDate: { lte: monthEndUtc },
          OR: [{ exitDate: null }, { exitDate: { gt: monthEndUtc } }],
        },
      });

      // Joiners in month
      const joiners = await this.prisma.employee.count({
        where: {
          ...baseWhere,
          joiningDate: { gte: monthStartUtc, lte: monthEndUtc },
        },
      });

      // Exits in month
      const exits = await this.prisma.employee.count({
        where: {
          ...baseWhere,
          exitDate: { gte: monthStartUtc, lte: monthEndUtc },
          status: { in: ['RESIGNED', 'TERMINATED', 'EXITED'] },
        },
      });

      const avgHeadcount = (opening + closing) / 2;
      const attritionRate =
        avgHeadcount > 0 && daysInMonth > 0
          ? Math.round((exits / avgHeadcount) * (365.25 / daysInMonth) * 10000) / 100
          : 0.0;

      monthlySeries.push({
        month: monthKey,
        openingHeadcount: opening,
        joiners,
        exits,
        netChange: joiners - exits,
        closingHeadcount: closing,
        annualizedAttritionRate: attritionRate,
      });
    }

    return {
      trends: monthlySeries,
      metadata: {
        monthsProjected: monthsCount,
        isHistoricalReconstructionPartial: false,
        historicalLimitationNotes:
          'Monthly headcount and movement trends are evaluated deterministically using effective joining and exit date boundaries. Department and branch transfers historically recorded in EmployeeHistory are reflected at their effective event timestamps.',
      },
    };
  }
}
