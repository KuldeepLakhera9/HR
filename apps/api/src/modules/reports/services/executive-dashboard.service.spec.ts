import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ExecutiveDashboardService } from './executive-dashboard.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

describe('ExecutiveDashboardService (Executive Workforce Dashboard)', () => {
  let service: ExecutiveDashboardService;
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
      attendanceDailySummary: {
        findMany: jest.fn(),
      },
      leaveBalanceAccount: {
        findMany: jest.fn(),
      },
      leaveRequest: {
        findMany: jest.fn(),
      },
      wfhRequest: {
        findMany: jest.fn(),
      },
      reviewCycle: {
        findFirst: jest.fn(),
      },
    };

    hierarchyService = {
      getTeamMemberIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutiveDashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
      ],
    }).compile();

    service = module.get<ExecutiveDashboardService>(ExecutiveDashboardService);
  });

  describe('Authorization and Scope Enforcement', () => {
    it('strictly forbids regular employees from viewing the executive dashboard', async () => {
      await expect(service.getDashboardSummary(mockEmployeeUser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows ADMIN to query organization-wide data without manager restrictions', async () => {
      prisma.employee.count.mockResolvedValue(100);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.leaveBalanceAccount.findMany.mockResolvedValue([]);
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.wfhRequest.findMany.mockResolvedValue([]);
      prisma.reviewCycle.findFirst.mockResolvedValue(null);
      prisma.employee.findMany.mockResolvedValue([]);

      const result = await service.getDashboardSummary(mockAdminUser, {});

      expect(result.metadata.scopeType).toBe('ORGANIZATION');
      expect(hierarchyService.getTeamMemberIds).not.toHaveBeenCalled();
      expect(result.summary.activeHeadcount.value).toBe(100);
    });

    it('scopes MANAGER view strictly to their reporting hierarchy subordinates', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-mgr-1' });
      hierarchyService.getTeamMemberIds.mockResolvedValue(['emp-sub-1', 'emp-sub-2']);
      prisma.employee.count.mockResolvedValue(2);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.leaveBalanceAccount.findMany.mockResolvedValue([]);
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.wfhRequest.findMany.mockResolvedValue([]);
      prisma.reviewCycle.findFirst.mockResolvedValue(null);
      prisma.employee.findMany.mockResolvedValue([]);

      const result = await service.getDashboardSummary(mockManagerUser, {});

      expect(result.metadata.scopeType).toBe('TEAM');
      expect(hierarchyService.getTeamMemberIds).toHaveBeenCalledWith('emp-mgr-1', 'org-test-1');
    });
  });

  describe('Metric Calculations & Aggregations', () => {
    it('accurately calculates attendance rate, punctuality, and working day denominators', async () => {
      prisma.employee.count.mockResolvedValue(50);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([
        {
          date: new Date('2026-10-01'),
          status: 'PRESENT',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: new Date('2026-10-01T09:00:00Z'),
          lateMinutes: 0,
          totalWorkMinutes: 510,
        },
        {
          date: new Date('2026-10-01'),
          status: 'HALF_DAY',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: new Date('2026-10-01T09:00:00Z'),
          lateMinutes: 0,
          totalWorkMinutes: 240,
        },
        {
          date: new Date('2026-10-01'),
          status: 'ABSENT',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: null,
          lateMinutes: 0,
          totalWorkMinutes: 0,
        },
        {
          date: new Date('2026-10-01'),
          status: 'ON_LEAVE',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: null,
          lateMinutes: 0,
          totalWorkMinutes: 0,
        },
        {
          date: new Date('2026-10-01'),
          status: 'WEEK_OFF',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: null,
          lateMinutes: 0,
          totalWorkMinutes: 0,
        },
      ]);
      prisma.leaveBalanceAccount.findMany.mockResolvedValue([
        { allocatedBalance: 100, usedBalance: 25 },
      ]);
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.wfhRequest.findMany.mockResolvedValue([]);
      prisma.reviewCycle.findFirst.mockResolvedValue(null);
      prisma.employee.findMany.mockResolvedValue([]);

      const result = await service.getDashboardSummary(mockAdminUser, {});

      // 5 summaries: 1 leave, 1 weekoff -> expected = 3
      // present = 1 + (0.5 * 1) = 1.5 -> rate = 1.5 / 3 = 50.0%
      expect(result.summary.attendanceRate.value).toBe(50.0);
      expect(result.summary.attendanceRate.formattedValue).toBe('50.0%');
      expect(result.summary.leaveUtilizationRate.value).toBe(25.0);
    });

    it('accurately calculates active review cycle completion and overdue reviews', async () => {
      prisma.employee.count.mockResolvedValue(50);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.leaveBalanceAccount.findMany.mockResolvedValue([]);
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.wfhRequest.findMany.mockResolvedValue([]);
      prisma.employee.findMany.mockResolvedValue([]);

      const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000);
      prisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        name: 'H2 2026 Review',
        managerReviewDeadline: pastDeadline,
        participants: [
          { id: 'p1', employeeId: 'e1', status: 'ENROLLED' },
          { id: 'p2', employeeId: 'e2', status: 'ENROLLED' },
          { id: 'p3', employeeId: 'e3', status: 'EXEMPTED' }, // Deducted
        ],
        reviews: [
          { id: 'r1', employeeId: 'e1', status: 'FINALIZED' },
          { id: 'r2', employeeId: 'e2', status: 'MANAGER_REVIEW_SUBMITTED' },
        ],
      });

      const result = await service.getDashboardSummary(mockAdminUser, {});

      // Denominator: 2 eligible. Numerator: 1 finalized. Completion = 50%
      expect(result.summary.activeReviewCycleCompletionRate.value).toBe(50.0);
      // Overdue: 2 eligible - 1 finalized = 1
      expect(result.summary.overdueAppraisalsCount.value).toBe(1);
    });
  });

  describe('Empty and Partial Data Resilience', () => {
    it('safely handles zero data states with calculable false indicators and no NaN crashes', async () => {
      prisma.employee.count.mockResolvedValue(0);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.leaveBalanceAccount.findMany.mockResolvedValue([]);
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.wfhRequest.findMany.mockResolvedValue([]);
      prisma.reviewCycle.findFirst.mockResolvedValue(null);
      prisma.employee.findMany.mockResolvedValue([]);

      const result = await service.getDashboardSummary(mockAdminUser, {});

      expect(result.summary.activeHeadcount.value).toBe(0);
      expect(result.summary.attendanceRate.value).toBe(0.0);
      expect(result.summary.attendanceRate.isCalculable).toBe(false);
      expect(result.summary.activeReviewCycleCompletionRate.value).toBeNull();
      expect(result.summary.activeReviewCycleCompletionRate.formattedValue).toBe('No Active Cycle');
    });

    it('applies small-cell privacy suppression for manager views with department cohorts < 5', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-mgr-1' });
      hierarchyService.getTeamMemberIds.mockResolvedValue(['emp-sub-1']);
      prisma.employee.count.mockResolvedValue(3);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.leaveBalanceAccount.findMany.mockResolvedValue([]);
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.wfhRequest.findMany.mockResolvedValue([]);
      prisma.reviewCycle.findFirst.mockResolvedValue(null);

      // Return employee in small cohort
      prisma.employee.findMany.mockResolvedValue([
        {
          employment: {
            department: { id: 'dept-secret', name: 'Special Ops' },
            branch: { id: 'branch-1', name: 'HQ' },
          },
        },
      ]);

      const result = await service.getDashboardSummary(mockManagerUser, {});

      const dept = result.departmentBreakdown.find((d) => d.departmentId === 'dept-secret');
      expect(dept?.isSuppressed).toBe(true);
      expect(dept?.departmentName).toBe('Protected Cohort');
      expect(dept?.headcount).toBe(0);
    });
  });
});
