import { ForbiddenException } from '@nestjs/common';
import { PerformanceAnalyticsService } from './performance-analytics.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

describe('Phase 10 — Step 6: Performance Management Analytics Specification Tests', () => {
  let service: PerformanceAnalyticsService;
  let mockPrisma: any;
  let mockHierarchy: any;

  const adminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@company.com',
    roles: ['ADMIN'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW'],
    employeeCode: 'EMP-ADM',
    firstName: 'Admin',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-admin',
  };

  const managerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    email: 'manager@company.com',
    roles: ['MANAGER'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW'],
    employeeCode: 'EMP-MGR',
    firstName: 'Manager',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-mgr',
  };

  const employeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'emp@company.com',
    roles: ['EMPLOYEE'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW'],
    employeeCode: 'EMP-001',
    firstName: 'Employee',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-emp',
  };

  beforeEach(() => {
    mockPrisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-mgr-1' }),
      },
      reviewCycle: {
        findFirst: jest.fn(),
      },
      reviewCycleParticipant: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      performanceGoal: {
        findMany: jest.fn(),
      },
      developmentPlan: {
        findMany: jest.fn(),
      },
      department: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dept-1', name: 'Engineering' },
          { id: 'dept-2', name: 'Sales' },
        ]),
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: 'branch-1', name: 'HQ' }]),
      },
    };

    mockHierarchy = {
      getTeamMemberIds: jest.fn().mockResolvedValue(['emp-sub-1', 'emp-sub-2']),
    };

    service = new PerformanceAnalyticsService(mockPrisma, mockHierarchy);
  });

  describe('1. Access Control & Scope Isolation', () => {
    it('allows ADMIN organization-wide access with null scopedEmployeeIds', async () => {
      const scope = await service.resolveScopedEmployeeIds(adminUser);
      expect(scope.scopeType).toBe('ORGANIZATION');
      expect(scope.scopedEmployeeIds).toBeNull();
    });

    it('scopes MANAGER to authoritative downline team members via HierarchyService', async () => {
      const scope = await service.resolveScopedEmployeeIds(managerUser);
      expect(scope.scopeType).toBe('TEAM');
      expect(scope.scopedEmployeeIds).toEqual(['emp-sub-1', 'emp-sub-2']);
      expect(mockHierarchy.getTeamMemberIds).toHaveBeenCalledWith('emp-mgr-1', 'org-test-1');
    });

    it('rejects regular EMPLOYEE with ForbiddenException to prevent unauthorized metric harvesting', async () => {
      await expect(service.resolveScopedEmployeeIds(employeeUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('2. Eligible Participation & Completion Metrics (M-PM-01)', () => {
    it('strictly excludes EXEMPTED and WITHDRAWN participants from completion denominator', async () => {
      mockPrisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        name: 'Annual Review 2026',
        status: 'FINALIZED',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        goalsWeightPercentage: 70,
        competenciesWeightPercentage: 30,
        ratingScaleMax: 5,
        selfAssessmentDeadline: new Date('2026-03-01'),
        managerReviewDeadline: new Date('2026-04-01'),
      });

      // 10 total: 6 ENROLLED (4 FINALIZED, 2 in draft), 2 EXEMPTED, 2 WITHDRAWN
      const participants = [
        ...Array(4)
          .fill(null)
          .map((_, i) => ({
            id: `p-${i}`,
            status: 'ENROLLED',
            departmentId: 'dept-1',
            branchId: 'branch-1',
            reviews: [{ status: 'FINALIZED', overallScore: 4.2 }],
          })),
        {
          id: 'p-4',
          status: 'ENROLLED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [{ status: 'SELF_ASSESSMENT_DRAFT', overallScore: null }],
        },
        {
          id: 'p-5',
          status: 'ENROLLED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [{ status: 'MANAGER_REVIEW_DRAFT', overallScore: null }],
        },
        {
          id: 'p-6',
          status: 'EXEMPTED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [],
        },
        {
          id: 'p-7',
          status: 'EXEMPTED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [],
        },
        {
          id: 'p-8',
          status: 'WITHDRAWN',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [],
        },
        {
          id: 'p-9',
          status: 'WITHDRAWN',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [],
        },
      ];
      mockPrisma.reviewCycleParticipant.findMany.mockResolvedValue(participants);
      mockPrisma.reviewCycleParticipant.count.mockResolvedValue(1);

      const res = await service.getPerformanceOverviewReport(adminUser, {});

      expect(res.participation.totalEnrolled).toBe(10);
      expect(res.participation.exemptedCount).toBe(2);
      expect(res.participation.withdrawnCount).toBe(2);
      expect(res.participation.eligibleCount).toBe(6); // 10 - (2 + 2)
      expect(res.participation.finalizedCount).toBe(4);
      // Completion rate: 4 / 6 * 100 = 66.67%
      expect(res.participation.completionRate).toBe(66.67);
    });
  });

  describe('3. Finalized Scores & Missing Ratings Isolation', () => {
    it('never treats missing or incomplete ratings as 0 and calculates distribution ONLY on finalized reviews', async () => {
      mockPrisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        name: 'Annual Review 2026',
        status: 'FINALIZED',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        goalsWeightPercentage: 70,
        competenciesWeightPercentage: 30,
        ratingScaleMax: 5,
      });

      const participants = [
        {
          id: 'p-1',
          status: 'ENROLLED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [{ status: 'FINALIZED', overallScore: 4.5 }],
        },
        {
          id: 'p-2',
          status: 'ENROLLED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [{ status: 'FINALIZED', overallScore: 3.5 }],
        },
        {
          id: 'p-3',
          status: 'ENROLLED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [{ status: 'FINALIZED', overallScore: 2.5 }],
        },
        {
          id: 'p-4',
          status: 'ENROLLED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [{ status: 'FINALIZED', overallScore: null }], // Finalized narrative without numerical rating
        },
        {
          id: 'p-5',
          status: 'ENROLLED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [{ status: 'MANAGER_REVIEW_DRAFT', overallScore: 5.0 }], // Draft score MUST be ignored!
        },
      ];
      mockPrisma.reviewCycleParticipant.findMany.mockResolvedValue(participants);
      mockPrisma.reviewCycleParticipant.count.mockResolvedValue(0);

      const res = await service.getPerformanceOverviewReport(adminUser, {});

      expect(res.ratingDistribution.isNumericalApproved).toBe(true);
      expect(res.ratingDistribution.isSuppressed).toBe(false);
      expect(res.ratingDistribution.totalFinalizedScored).toBe(3); // p-1, p-2, p-3
      expect(res.ratingDistribution.missingOrExcludedCount).toBe(1); // p-4 (null overallScore)
      // Average of 4.5, 3.5, 2.5 is 3.50 (NOT skewed by 0 for missing rating!)
      expect(res.ratingDistribution.averageScore).toBe(3.5);
    });

    it('suppresses distribution buckets when scored cohort is below differential privacy threshold', async () => {
      mockPrisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        name: 'Annual Review 2026',
        status: 'FINALIZED',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        goalsWeightPercentage: 70,
        competenciesWeightPercentage: 30,
        ratingScaleMax: 5,
      });

      // Only 2 scored participants (< 3 minimum threshold for org scope)
      const participants = [
        {
          id: 'p-1',
          status: 'ENROLLED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [{ status: 'FINALIZED', overallScore: 4.0 }],
        },
        {
          id: 'p-2',
          status: 'ENROLLED',
          departmentId: 'dept-1',
          branchId: 'branch-1',
          reviews: [{ status: 'FINALIZED', overallScore: 3.0 }],
        },
      ];
      mockPrisma.reviewCycleParticipant.findMany.mockResolvedValue(participants);
      mockPrisma.reviewCycleParticipant.count.mockResolvedValue(0);

      const res = await service.getPerformanceOverviewReport(adminUser, {});

      expect(res.ratingDistribution.isSuppressed).toBe(true);
      expect(res.ratingDistribution.averageScore).toBeNull();
      expect(res.ratingDistribution.buckets).toEqual([]);
      expect(res.ratingDistribution.suppressionReason).toContain('suppressed');
    });

    it('defers numerical distribution when no approved numerical policy exists', async () => {
      mockPrisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        name: 'Narrative Review 2026',
        status: 'FINALIZED',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        goalsWeightPercentage: 0,
        competenciesWeightPercentage: 0, // Narrative only!
        ratingScaleMax: 5,
      });

      mockPrisma.reviewCycleParticipant.findMany.mockResolvedValue([]);
      mockPrisma.reviewCycleParticipant.count.mockResolvedValue(0);

      const res = await service.getPerformanceOverviewReport(adminUser, {});
      expect(res.ratingDistribution.isNumericalApproved).toBe(false);
      expect(res.ratingDistribution.averageScore).toBeNull();
    });
  });

  describe('4. Goal Progress Analytics', () => {
    it('aggregates goal categories and excludes cancelled goals from average progress calculation', async () => {
      const goals = [
        {
          id: 'g-1',
          title: 'Deliver Cloud Migration',
          category: 'QUANTITATIVE',
          status: 'COMPLETED',
          progressPercentage: 100,
          dueDate: new Date('2026-11-01'),
          employee: { displayName: 'John Doe', employeeCode: 'EMP001', employment: null },
        },
        {
          id: 'g-2',
          title: 'Improve Unit Test Coverage',
          category: 'QUANTITATIVE',
          status: 'IN_PROGRESS',
          progressPercentage: 60,
          dueDate: new Date('2026-12-01'),
          employee: { displayName: 'Jane Smith', employeeCode: 'EMP002', employment: null },
        },
        {
          id: 'g-3',
          title: 'Legacy Project Maintenance',
          category: 'DEVELOPMENT',
          status: 'CANCELLED',
          progressPercentage: 10,
          dueDate: new Date('2026-05-01'),
          employee: { displayName: 'Alice Brown', employeeCode: 'EMP003', employment: null },
        },
      ];
      mockPrisma.performanceGoal.findMany.mockResolvedValue(goals);

      const res = await service.getGoalProgressReport(adminUser, {});

      expect(res.overview.totalGoals).toBe(3);
      expect(res.overview.completedGoals).toBe(1);
      expect(res.overview.inProgressGoals).toBe(1);
      expect(res.overview.cancelledGoals).toBe(1);
      // Average progress should be (100 + 60) / 2 = 80.0% (cancelled g-3 excluded)
      expect(res.overview.averageProgressPercentage).toBe(80.0);
      expect(res.byCategory).toHaveLength(2); // QUANTITATIVE, DEVELOPMENT
    });
  });

  describe('5. Development Plan Progress Analytics', () => {
    it('calculates plan completion rate and identifies overdue actions', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const futureDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

      const plans = [
        {
          id: 'dp-1',
          objective: 'AWS Certified Developer',
          status: 'COMPLETED',
          targetDate: pastDate,
          employee: { displayName: 'John Doe', employeeCode: 'EMP001', employment: null },
        },
        {
          id: 'dp-2',
          objective: 'Public Speaking Workshop',
          status: 'IN_PROGRESS',
          targetDate: pastDate, // Overdue!
          employee: { displayName: 'Jane Smith', employeeCode: 'EMP002', employment: null },
        },
        {
          id: 'dp-3',
          objective: 'Advanced TypeScript',
          status: 'PLANNED',
          targetDate: futureDate,
          employee: { displayName: 'Bob Taylor', employeeCode: 'EMP004', employment: null },
        },
        {
          id: 'dp-4',
          objective: 'Archived Course',
          status: 'CANCELLED',
          targetDate: pastDate,
          employee: { displayName: 'Alice Brown', employeeCode: 'EMP003', employment: null },
        },
      ];
      mockPrisma.developmentPlan.findMany.mockResolvedValue(plans);

      const res = await service.getDevelopmentPlanReport(adminUser, {});

      expect(res.overview.totalPlans).toBe(4);
      expect(res.overview.completedCount).toBe(1);
      expect(res.overview.inProgressCount).toBe(1);
      expect(res.overview.cancelledCount).toBe(1);
      expect(res.overview.overduePlansCount).toBe(1); // dp-2
      // Completion rate: 1 completed / (4 - 1 cancelled) = 1/3 = 33.33%
      expect(res.overview.completionRate).toBe(33.33);
      expect(res.activePlans).toHaveLength(2); // dp-2, dp-3
    });
  });
});
