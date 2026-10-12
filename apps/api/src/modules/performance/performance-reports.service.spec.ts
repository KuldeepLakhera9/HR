import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceReportsService } from './performance-reports.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('PerformanceReportsService (Performance Dashboards & Reports)', () => {
  let service: PerformanceReportsService;
  let prisma: any;
  let hierarchy: any;

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@example.com',
    organizationId: 'org-1',
    firstName: 'System',
    lastName: 'Admin',
    employeeCode: 'ADM001',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: [],
    sessionId: 'sess-admin-1',
  };

  const mockHrUser: AuthenticatedUser = {
    id: 'user-hr-1',
    email: 'hr@example.com',
    organizationId: 'org-1',
    firstName: 'Ananya',
    lastName: 'Iyer',
    employeeCode: 'HR001',
    status: 'ACTIVE',
    roles: ['HR'],
    permissions: [],
    sessionId: 'sess-hr-1',
  };

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    email: 'vikram@example.com',
    organizationId: 'org-1',
    firstName: 'Vikram',
    lastName: 'Mehta',
    employeeCode: 'MGR001',
    status: 'ACTIVE',
    roles: ['MANAGER'],
    permissions: [],
    sessionId: 'sess-mgr-1',
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'priya@example.com',
    organizationId: 'org-1',
    firstName: 'Priya',
    lastName: 'Nair',
    employeeCode: 'EMP001',
    status: 'ACTIVE',
    roles: ['EMPLOYEE'],
    permissions: [],
    sessionId: 'sess-emp-1',
  };

  const mockCallerEmployee = {
    id: 'emp-1',
    userId: 'user-emp-1',
    organizationId: 'org-1',
    displayName: 'Priya Nair',
    employeeCode: 'EMP001',
  };

  const mockManagerEmployee = {
    id: 'emp-mgr-1',
    userId: 'user-mgr-1',
    organizationId: 'org-1',
    displayName: 'Vikram Mehta',
    employeeCode: 'MGR001',
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId === 'user-emp-1') return Promise.resolve(mockCallerEmployee);
          if (where.userId === 'user-mgr-1') return Promise.resolve(mockManagerEmployee);
          if (where.userId === 'user-hr-1' || where.userId === 'user-admin-1') {
            return Promise.resolve({
              id: 'emp-admin-1',
              userId: where.userId,
              organizationId: 'org-1',
              displayName: 'Admin User',
            });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      performanceGoal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      reviewCycleParticipant: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      performanceReview: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      developmentPlan: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      reviewCycle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      reviewCycleHistory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      department: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    hierarchy = {
      getTeamMemberIds: jest.fn().mockResolvedValue(['emp-sub-1', 'emp-sub-2']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchy },
      ],
    }).compile();

    service = module.get<PerformanceReportsService>(PerformanceReportsService);
  });

  describe('Employee Dashboard (getEmployeeDashboard)', () => {
    it('should throw NotFoundException if employee record is missing', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.getEmployeeDashboard({ ...mockEmployeeUser, id: 'user-unknown' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should aggregate employee goals, deadlines, and protect confidential feedback', async () => {
      prisma.performanceGoal.findMany.mockResolvedValue([
        {
          id: 'g-1',
          title: 'Deliver Core App Feature',
          category: 'QUANTITATIVE',
          status: 'IN_PROGRESS',
          baselineValue: 0,
          targetValue: 100,
          currentValue: 80,
          weight: 50,
          dueDate: new Date(Date.now() + 86400000 * 5),
        },
        {
          id: 'g-2',
          title: 'Code Quality Compliance',
          category: 'QUALITATIVE',
          status: 'COMPLETED',
          baselineValue: 0,
          targetValue: 10,
          currentValue: 10,
          weight: 50,
          dueDate: new Date(Date.now() - 86400000 * 2),
        },
      ]);

      prisma.reviewCycleParticipant.findFirst.mockResolvedValue({
        id: 'part-1',
        status: 'ENROLLED',
        cycle: {
          id: 'cyc-1',
          name: 'Annual Review 2026',
          status: 'SELF_ASSESSMENT',
          selfAssessmentDeadline: new Date(Date.now() + 86400000 * 3),
        },
        reviews: [
          {
            id: 'rev-1',
            status: 'NOT_STARTED',
            selfSubmittedAt: null,
          },
        ],
      });

      prisma.performanceReview.findMany.mockResolvedValue([
        {
          id: 'rev-old-1',
          overallScore: 4.5,
          scoreExplanation: 'Goals: 4.5 + Comps: 4.5',
          managerSummary: 'Excellent output',
          managerStrengths: 'Leadership',
          managerImprovements: 'Documentation',
          finalizedAt: new Date(),
          cycle: { name: 'Q1 Review 2026', ratingScaleMax: 5 },
          // Notice: strictly contains only EMPLOYEE_VISIBLE feedback because of Prisma query filter
          feedbackNotes: [
            {
              title: 'Great work',
              content: 'Demonstrated outstanding teamwork',
              createdAt: new Date(),
            },
          ],
        },
      ]);

      prisma.developmentPlan.findMany.mockResolvedValue([
        {
          id: 'dev-1',
          objective: 'Learn Cloud Native Architecture',
          actionSteps: 'Complete GCP architect certificate',
          targetDate: new Date(Date.now() + 86400000 * 30),
          status: 'IN_PROGRESS',
          responsiblePerson: 'Self & Mentor',
        },
      ]);

      const dashboard = await service.getEmployeeDashboard(mockEmployeeUser);

      // Goals summary
      expect(dashboard.goalsSummary.totalGoals).toBe(2);
      expect(dashboard.goalsSummary.completedGoals).toBe(1);
      expect(dashboard.goalsSummary.inProgressGoals).toBe(1);
      expect(dashboard.goalsSummary.averageProgressPercentage).toBe(90); // (80 + 100) / 2 = 90
      expect(dashboard.goalsSummary.activeGoalsList).toHaveLength(1);

      // Deadlines
      expect(dashboard.upcomingDeadlines.length).toBeGreaterThanOrEqual(1);

      // Review cycle
      expect(dashboard.currentCycleReview?.cycleName).toBe('Annual Review 2026');
      expect(dashboard.currentCycleReview?.reviewStatus).toBe('NOT_STARTED');

      // Feedback visibility protection
      expect(dashboard.recentFinalizedFeedback).toHaveLength(1);
      expect(dashboard.recentFinalizedFeedback[0].employeeVisibleFeedbacks).toHaveLength(1);

      // Development plans
      expect(dashboard.activeDevelopmentPlans).toHaveLength(1);
      expect(dashboard.activeDevelopmentPlans[0].objective).toBe('Learn Cloud Native Architecture');
    });
  });

  describe('Manager Dashboard (getManagerDashboard)', () => {
    it('should return empty summary if manager has no team reports', async () => {
      hierarchy.getTeamMemberIds.mockResolvedValue([]);

      const res = await service.getManagerDashboard(mockManagerUser);

      expect(res.teamGoalsSummary.totalTeamMembers).toBe(0);
      expect(res.teamGoalsSummary.totalGoals).toBe(0);
      expect(res.teamReviewStatus.totalAssignedReviews).toBe(0);
      expect(res.pendingActions.urgentReviews).toHaveLength(0);
    });

    it('should aggregate team goals, identify lagging goals, and detect pending/overdue reviews', async () => {
      hierarchy.getTeamMemberIds.mockResolvedValue(['emp-sub-1', 'emp-sub-2']);

      prisma.performanceGoal.findMany.mockResolvedValue([
        {
          id: 'tg-1',
          employeeId: 'emp-sub-1',
          title: 'Infrastructure Upgrade',
          category: 'QUANTITATIVE',
          status: 'IN_PROGRESS',
          baselineValue: 0,
          targetValue: 100,
          currentValue: 20, // 20% progress => lagging!
          dueDate: new Date(Date.now() + 86400000 * 10), // due in 10 days
          employee: { displayName: 'Rohan Sharma', employeeCode: 'EMP002' },
        },
        {
          id: 'tg-2',
          employeeId: 'emp-sub-2',
          title: 'Customer Satisfaction Score',
          category: 'QUANTITATIVE',
          status: 'COMPLETED',
          baselineValue: 0,
          targetValue: 100,
          currentValue: 100,
          dueDate: new Date(Date.now() + 86400000 * 20),
          employee: { displayName: 'Sneha Patel', employeeCode: 'EMP003' },
        },
      ]);

      prisma.performanceReview.findMany.mockResolvedValue([
        {
          id: 'rev-sub-1',
          employeeId: 'emp-sub-1',
          status: 'SELF_ASSESSMENT_SUBMITTED',
          cycle: {
            name: 'Mid-Year 2026',
            status: 'MANAGER_REVIEW',
            managerReviewDeadline: new Date(Date.now() - 86400000 * 2), // OVERDUE!
          },
          employee: { displayName: 'Rohan Sharma', employeeCode: 'EMP002' },
        },
        {
          id: 'rev-sub-2',
          employeeId: 'emp-sub-2',
          status: 'FINALIZED',
          cycle: {
            name: 'Mid-Year 2026',
            status: 'MANAGER_REVIEW',
            managerReviewDeadline: new Date(Date.now() + 86400000 * 5),
          },
          employee: { displayName: 'Sneha Patel', employeeCode: 'EMP003' },
        },
      ]);

      const res = await service.getManagerDashboard(mockManagerUser);

      expect(res.teamGoalsSummary.totalTeamMembers).toBe(2);
      expect(res.teamGoalsSummary.totalGoals).toBe(2);
      expect(res.teamGoalsSummary.laggingGoals).toHaveLength(1);
      expect(res.teamGoalsSummary.laggingGoals[0].title).toBe('Infrastructure Upgrade');

      expect(res.teamReviewStatus.totalAssignedReviews).toBe(2);
      expect(res.teamReviewStatus.selfAssessmentSubmitted).toBe(1);
      expect(res.teamReviewStatus.finalized).toBe(1);
      expect(res.teamReviewStatus.completionPercentage).toBe(50);

      expect(res.pendingActions.pendingManagerReviewsCount).toBe(1);
      expect(res.pendingActions.overdueReviewsCount).toBe(1);
      expect(res.pendingActions.urgentReviews).toHaveLength(1);
      expect(res.pendingActions.urgentReviews[0].isOverdue).toBe(true);
    });
  });

  describe('HR/Admin Global Dashboard & Differential Privacy (getHrAdminDashboard)', () => {
    it('should prohibit regular non-HR/Admin employees from accessing global analytics', async () => {
      await expect(service.getHrAdminDashboard(mockEmployeeUser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should suppress rating distribution when cohort size is below privacy threshold (< 3)', async () => {
      prisma.reviewCycle.findMany.mockResolvedValue([
        {
          id: 'cyc-1',
          name: 'H1 2026 Appraisal',
          status: 'MANAGER_REVIEW',
          startDate: new Date('2026-04-01'),
          endDate: new Date('2026-09-30'),
          goalsWeightPercentage: 70,
          competenciesWeightPercentage: 30,
          participants: [
            {
              id: 'p-1',
              status: 'ENROLLED',
              departmentId: 'dep-1',
              branchId: 'br-1',
              reviews: [{ id: 'r-1', status: 'FINALIZED', overallScore: 4.2 }],
            },
            {
              id: 'p-2',
              status: 'ENROLLED',
              departmentId: 'dep-1',
              branchId: 'br-1',
              reviews: [{ id: 'r-2', status: 'FINALIZED', overallScore: 3.8 }],
            },
          ],
        },
      ]);

      prisma.department.findMany.mockResolvedValue([{ id: 'dep-1', name: 'Engineering' }]);
      prisma.branch.findMany.mockResolvedValue([{ id: 'br-1', name: 'Bengaluru HQ' }]);

      const res = await service.getHrAdminDashboard(mockHrUser, {});

      expect(res.overview.totalActiveCycles).toBe(1);
      expect(res.overview.totalParticipants).toBe(2);
      expect(res.overview.totalCompletedReviews).toBe(2);
      expect(res.overview.overallCompletionRate).toBe(100);

      // Differential Privacy Check: exactly 2 completed reviews => cohort < 3 => SUPPRESSED!
      expect(res.ratingDistribution.isSuppressed).toBe(true);
      expect(res.ratingDistribution.averageScore).toBeNull();
      expect(res.ratingDistribution.buckets).toHaveLength(0);
      expect(res.ratingDistribution.suppressionReason).toContain('cohort size < 3');
    });

    it('should compute full rating distribution and department breakdown when cohort size is >= 3', async () => {
      prisma.reviewCycle.findMany.mockResolvedValue([
        {
          id: 'cyc-1',
          name: 'H1 2026 Appraisal',
          status: 'MANAGER_REVIEW',
          startDate: new Date('2026-04-01'),
          endDate: new Date('2026-09-30'),
          goalsWeightPercentage: 70,
          competenciesWeightPercentage: 30,
          participants: [
            {
              id: 'p-1',
              status: 'ENROLLED',
              departmentId: 'dep-1',
              branchId: 'br-1',
              reviews: [{ id: 'r-1', status: 'FINALIZED', overallScore: 4.5 }],
            },
            {
              id: 'p-2',
              status: 'ENROLLED',
              departmentId: 'dep-1',
              branchId: 'br-1',
              reviews: [{ id: 'r-2', status: 'FINALIZED', overallScore: 3.5 }],
            },
            {
              id: 'p-3',
              status: 'ENROLLED',
              departmentId: 'dep-1',
              branchId: 'br-1',
              reviews: [{ id: 'r-3', status: 'FINALIZED', overallScore: 2.5 }],
            },
          ],
        },
      ]);

      prisma.department.findMany.mockResolvedValue([{ id: 'dep-1', name: 'Engineering' }]);
      prisma.branch.findMany.mockResolvedValue([{ id: 'br-1', name: 'Bengaluru HQ' }]);

      const res = await service.getHrAdminDashboard(mockHrUser, {});

      expect(res.ratingDistribution.isSuppressed).toBe(false);
      expect(res.ratingDistribution.averageScore).toBe(3.5); // (4.5 + 3.5 + 2.5) / 3 = 3.5
      expect(res.ratingDistribution.buckets).toHaveLength(4);

      expect(res.departmentBreakdown).toHaveLength(1);
      expect(res.departmentBreakdown[0].departmentName).toBe('Engineering');
      expect(res.departmentBreakdown[0].completionRate).toBe(100);
    });
  });

  describe('Export Performance Report (exportPerformanceReportCsv)', () => {
    it('should prohibit regular employees from exporting reports', async () => {
      await expect(service.exportPerformanceReportCsv(mockEmployeeUser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should generate sanitized CSV report with formula injection protection', async () => {
      prisma.reviewCycleParticipant.findMany.mockResolvedValue([
        {
          id: 'p-1',
          status: 'ENROLLED',
          cycle: { name: 'FY26 Review', status: 'FINALIZED' },
          employee: {
            employeeCode: '=CMD|calc', // Potential formula injection vector!
            displayName: '+John Doe', // Potential formula injection vector!
            employment: {
              department: { name: 'Finance' },
              branch: { name: 'Mumbai' },
            },
          },
          reviews: [
            {
              status: 'FINALIZED',
              overallScore: 4.25,
              selfSubmittedAt: new Date('2026-06-01'),
              managerSubmittedAt: new Date('2026-06-15'),
              finalizedAt: new Date('2026-06-20'),
            },
          ],
        },
      ]);

      const { filename, csv } = await service.exportPerformanceReportCsv(mockAdminUser, {});

      expect(filename).toContain('.csv');
      expect(csv).toContain('Employee Code,Employee Name,Department');
      // Formula injection sanitization check: formula prefix is escaped with single quote
      expect(csv).toContain('"\'=CMD|calc"');
      expect(csv).toContain('"\'+John Doe"');
      expect(csv).toContain('"4.25"');
    });
  });
});
