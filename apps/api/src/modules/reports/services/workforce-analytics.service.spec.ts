import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { WorkforceAnalyticsService } from './workforce-analytics.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

describe('WorkforceAnalyticsService (Workforce and Headcount Analytics)', () => {
  let service: WorkforceAnalyticsService;
  let prisma: any;
  let hierarchyService: any;

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@peopleos.local',
    roles: ['ADMIN'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW', 'REPORT_EXPORT'],
    employeeCode: 'EMP001',
    firstName: 'Admin',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-1',
  };

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    email: 'manager@peopleos.local',
    roles: ['MANAGER'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW'],
    employeeCode: 'EMP002',
    firstName: 'Manager',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-2',
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'employee@peopleos.local',
    roles: ['EMPLOYEE'],
    organizationId: 'org-test-1',
    permissions: [],
    employeeCode: 'EMP003',
    firstName: 'Regular',
    lastName: 'Employee',
    status: 'ACTIVE' as any,
    sessionId: 'sess-3',
  };

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'org-test-1',
          timezone: 'Asia/Kolkata',
          name: 'PeopleOS Test Org',
          code: 'PEOPLEOS',
        }),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    hierarchyService = {
      getTeamMemberIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkforceAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
      ],
    }).compile();

    service = module.get<WorkforceAnalyticsService>(WorkforceAnalyticsService);
  });

  describe('Authorization and Scope Enforcement', () => {
    it('rejects regular employees from viewing workforce analytics reports', async () => {
      await expect(service.getHeadcountReport(mockEmployeeUser, {})).rejects.toThrow(
        ForbiddenException,
      );

      await expect(service.getMovementReport(mockEmployeeUser, {})).rejects.toThrow(
        ForbiddenException,
      );

      await expect(service.getTrendsReport(mockEmployeeUser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows ADMIN to query organization-wide headcount without manager hierarchy constraints', async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      const result = await service.getHeadcountReport(mockAdminUser, { asOfDate: '2026-10-12' });

      expect(result.scopeType).toBe('ORGANIZATION');
      expect(hierarchyService.getTeamMemberIds).not.toHaveBeenCalled();
    });

    it('scopes MANAGER to reporting hierarchy team members', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-mgr-1' });
      hierarchyService.getTeamMemberIds.mockResolvedValue(['emp-sub-1', 'emp-sub-2']);
      prisma.employee.findMany.mockResolvedValue([]);

      const result = await service.getHeadcountReport(mockManagerUser, {});

      expect(result.scopeType).toBe('TEAM');
      expect(hierarchyService.getTeamMemberIds).toHaveBeenCalledWith('emp-mgr-1', 'org-test-1');
    });
  });

  describe('Headcount Multi-Dimensional Distributions & Status Boundaries', () => {
    it('correctly aggregates department, branch, designation, and employment categories', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          gender: 'FEMALE',
          status: 'ACTIVE',
          employment: {
            employmentType: 'FULL_TIME',
            workMode: 'HYBRID',
            department: { id: 'd-eng', name: 'Engineering', code: 'ENG' },
            branch: { id: 'b-blr', name: 'Bengaluru HQ', code: 'BLR-HQ' },
            designation: { id: 'des-swe', title: 'Senior Software Engineer', code: 'SR-SWE' },
          },
        },
        {
          id: 'emp-2',
          gender: 'MALE',
          status: 'PROBATION',
          employment: {
            employmentType: 'FULL_TIME',
            workMode: 'OFFICE',
            department: { id: 'd-eng', name: 'Engineering', code: 'ENG' },
            branch: { id: 'b-blr', name: 'Bengaluru HQ', code: 'BLR-HQ' },
            designation: { id: 'des-swe', title: 'Senior Software Engineer', code: 'SR-SWE' },
          },
        },
        {
          id: 'emp-3',
          gender: 'MALE',
          status: 'ON_NOTICE',
          employment: {
            employmentType: 'CONTRACT',
            workMode: 'REMOTE',
            department: { id: 'd-ops', name: 'Operations', code: 'OPS' },
            branch: { id: 'b-mum', name: 'Mumbai Office', code: 'MUM-01' },
            designation: { id: 'des-ops', title: 'Operations Specialist', code: 'OPS-SPEC' },
          },
        },
      ]);

      const result = await service.getHeadcountReport(mockAdminUser, {});

      expect(result.totalActiveHeadcount).toBe(3);

      // Department check
      const engDept = result.distributions.byDepartment.find((d) => d.departmentId === 'd-eng');
      expect(engDept?.headcount).toBe(2);
      expect(engDept?.percentage).toBe(66.7);

      // Branch check
      const blrBranch = result.distributions.byBranch.find((b) => b.branchId === 'b-blr');
      expect(blrBranch?.headcount).toBe(2);

      // Designation check
      const sweDesig = result.distributions.byDesignation.find(
        (d) => d.designationId === 'des-swe',
      );
      expect(sweDesig?.headcount).toBe(2);

      // Employment type check
      const ft = result.distributions.byEmploymentType.find(
        (t) => t.employmentType === 'FULL_TIME',
      );
      expect(ft?.headcount).toBe(2);

      // Work mode check
      const hybrid = result.distributions.byWorkMode.find((m) => m.workMode === 'HYBRID');
      expect(hybrid?.headcount).toBe(1);
    });

    it('enforces small-cell suppression (k < 5) for manager department views', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-mgr-1' });
      hierarchyService.getTeamMemberIds.mockResolvedValue(['emp-1']);
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          gender: 'MALE',
          status: 'ACTIVE',
          employment: {
            department: { id: 'd-secret', name: 'Special Projects', code: 'SP-OPS' },
            branch: { id: 'b-blr', name: 'Bengaluru HQ', code: 'BLR-HQ' },
            designation: { id: 'des-dev', title: 'Developer', code: 'DEV' },
          },
        },
      ]);

      const result = await service.getHeadcountReport(mockManagerUser, {});

      const spDept = result.distributions.byDepartment.find((d) => d.departmentId === 'd-secret');
      expect(spDept?.isSuppressed).toBe(true);
      expect(spDept?.departmentName).toBe('Protected Cohort');
      expect(spDept?.headcount).toBe(0);
    });
  });

  describe('Workforce Movement (Joiners, Exits, Net Change & Attrition)', () => {
    it('calculates net change, annualized attrition rate, and paginated rosters', async () => {
      // 10 joiners, 2 exits, active at start = 100, active at end = 108
      prisma.employee.count
        .mockResolvedValueOnce(10) // totalJoiners
        .mockResolvedValueOnce(2) // totalExits
        .mockResolvedValueOnce(100) // activeAtStart
        .mockResolvedValueOnce(108); // activeAtEnd

      prisma.employee.findMany
        .mockResolvedValueOnce([
          {
            id: 'j-1',
            employeeCode: 'EMP101',
            displayName: 'Aarav Patel',
            joiningDate: new Date('2026-09-01'),
            status: 'ACTIVE',
            employment: {
              department: { id: 'd-eng', name: 'Engineering' },
              designation: { id: 'des-swe', title: 'SWE' },
              branch: { id: 'b-blr', name: 'HQ' },
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'e-1',
            employeeCode: 'EMP050',
            displayName: 'Rohan Verma',
            joiningDate: new Date('2024-01-01'),
            exitDate: new Date('2026-09-15'),
            status: 'EXITED',
            employment: {
              department: { id: 'd-eng', name: 'Engineering' },
              designation: { id: 'des-swe', title: 'SWE' },
              branch: { id: 'b-blr', name: 'HQ' },
            },
          },
        ]);

      const result = await service.getMovementReport(mockAdminUser, {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(result.summary.totalJoiners).toBe(10);
      expect(result.summary.totalExits).toBe(2);
      expect(result.summary.netChange).toBe(8); // 10 - 2
      // Average headcount = (100 + 108) / 2 = 104. 30 days.
      // (2 / 104) * (365.25 / 30) * 100% = 23.41%
      expect(result.summary.annualizedAttritionRate).toBeGreaterThan(0);
      expect(result.joiners.records.length).toBe(1);
      expect(result.exits.records.length).toBe(1);
    });
  });

  describe('Workforce Monthly Trends & Historical Limitations', () => {
    it('projects monthly trend series and provides documented historical limitation statement', async () => {
      // Mock opening, closing, joiners, exits for 3 months (3 * 4 count calls)
      prisma.employee.count.mockResolvedValue(50);

      const result = await service.getTrendsReport(mockAdminUser, { months: 3 });

      expect(result.trends.length).toBe(3);
      expect(result.metadata.monthsProjected).toBe(3);
      expect(result.metadata.isHistoricalReconstructionPartial).toBe(false);
      expect(result.metadata.historicalLimitationNotes).toContain(
        'effective joining and exit date boundaries',
      );
    });
  });
});
