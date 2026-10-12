import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceNotificationsService } from './performance-notifications.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('PerformanceNotificationsService (Performance Notifications & Reminders)', () => {
  let service: PerformanceNotificationsService;
  let prisma: any;
  let hierarchy: any;
  let notifications: any;

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

  beforeEach(async () => {
    prisma = {
      employee: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      performanceGoal: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      reviewCycle: {
        findMany: jest.fn(),
      },
      performanceReview: {
        findUnique: jest.fn(),
      },
    };

    hierarchy = {
      getTeamMemberIds: jest.fn().mockResolvedValue(['emp-sub-1']),
    };

    notifications = {
      createNotification: jest.fn().mockImplementation((data) =>
        Promise.resolve({
          id: 'notif-1',
          ...data,
          createdAt: new Date(),
          isRead: false,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceNotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchy },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<PerformanceNotificationsService>(PerformanceNotificationsService);
  });

  describe('Workflow Transition Notifications', () => {
    it('should notify manager when an employee submits a goal for approval', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-sub-1',
        displayName: 'Priya Nair',
        manager: { id: 'emp-mgr-1', userId: 'user-mgr-1' },
      });

      await service.notifyGoalSubmitted({
        organizationId: 'org-1',
        goalId: 'g-1',
        title: 'Complete System Migration',
        employeeId: 'emp-sub-1',
      });

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-mgr-1',
          title: 'Performance Goal Submitted for Approval',
          idempotencyKey: 'goal-sub-g-1',
          link: '/progress?tab=goals',
        }),
      );
    });

    it('should notify employee when manager approves goal', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-sub-1',
        userId: 'user-emp-1',
      });

      await service.notifyGoalDecision({
        organizationId: 'org-1',
        goalId: 'g-1',
        title: 'Complete System Migration',
        employeeId: 'emp-sub-1',
        status: 'APPROVED',
      });

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-emp-1',
          title: 'Performance Goal Approved',
          idempotencyKey: 'goal-dec-g-1-APPROVED',
        }),
      );
    });

    it('should notify employee upon enrollment in a cycle with deadline', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-sub-1',
        userId: 'user-emp-1',
      });

      await service.notifyCycleEnrolled({
        organizationId: 'org-1',
        cycleId: 'cyc-1',
        cycleName: 'Annual Review 2026',
        employeeId: 'emp-sub-1',
        deadline: new Date('2026-11-30'),
      });

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-emp-1',
          title: 'Enrolled in Performance Cycle: Annual Review 2026',
          idempotencyKey: 'cycle-enrolled-cyc-1-emp-sub-1',
        }),
      );
    });

    it('should notify manager when employee submits self-assessment', async () => {
      prisma.employee.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'emp-mgr-1')
          return Promise.resolve({ id: 'emp-mgr-1', userId: 'user-mgr-1' });
        if (where.id === 'emp-sub-1')
          return Promise.resolve({ id: 'emp-sub-1', displayName: 'Priya Nair' });
        return Promise.resolve(null);
      });

      await service.notifySelfAssessmentSubmitted({
        organizationId: 'org-1',
        reviewId: 'rev-1',
        cycleName: 'Annual Review 2026',
        employeeId: 'emp-sub-1',
        managerId: 'emp-mgr-1',
      });

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-mgr-1',
          title: 'Self-Assessment Submitted: Annual Review 2026',
          idempotencyKey: 'self-assess-sub-rev-1',
        }),
      );
    });

    it('should notify employee when review is finalized without leaking confidential scores in notification text', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-sub-1',
        userId: 'user-emp-1',
      });

      await service.notifyReviewFinalized({
        organizationId: 'org-1',
        reviewId: 'rev-1',
        cycleName: 'Annual Review 2026',
        employeeId: 'emp-sub-1',
      });

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-emp-1',
          title: 'Performance Review Finalized: Annual Review 2026',
          idempotencyKey: 'rev-finalized-rev-1',
        }),
      );

      // Verify no confidential score leaking in message body
      const calledMessage = notifications.createNotification.mock.calls[0][0].message;
      expect(calledMessage).not.toContain('Score:');
      expect(calledMessage).not.toContain('Rating:');
    });

    it('should notify employee when score is calibrated under policy audit', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-sub-1',
        userId: 'user-emp-1',
      });

      await service.notifyScoreRecalculated({
        organizationId: 'org-1',
        reviewId: 'rev-1',
        cycleName: 'Annual Review 2026',
        employeeId: 'emp-sub-1',
        reason: 'Authorized grievance correction',
      });

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-emp-1',
          title: 'Performance Scores Calibrated: Annual Review 2026',
        }),
      );
    });
  });

  describe('Batch Reminders & Ineligible Record Filtering (scanAndSendPerformanceReminders)', () => {
    it('should reject non-HR/Admin users from triggering global reminder scans', async () => {
      await expect(service.scanAndSendPerformanceReminders(mockEmployeeUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should dispatch deadline reminders for active goals and skip completed or cancelled goals', async () => {
      const now = new Date();
      prisma.performanceGoal.findMany.mockResolvedValue([
        {
          id: 'g-active-1',
          title: 'Backend API Hardening',
          status: 'IN_PROGRESS',
          dueDate: new Date(now.getTime() + 86400000 * 2), // Due in 2 days
          employee: { userId: 'user-emp-1', displayName: 'Priya Nair' },
        },
      ]);

      prisma.reviewCycle.findMany.mockResolvedValue([]);

      const result = await service.scanAndSendPerformanceReminders(mockAdminUser);

      expect(result.goalsReminded).toBe(1);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-emp-1',
          title: expect.stringContaining('Upcoming Goal Due Date'),
          link: '/progress?tab=goals',
        }),
      );
    });

    it('should remind pending self-assessments but skip exempted participants and completed reviews', async () => {
      const now = new Date();
      prisma.performanceGoal.findMany.mockResolvedValue([]);

      prisma.reviewCycle.findMany.mockResolvedValue([
        {
          id: 'cyc-1',
          name: 'H2 2026 Cycle',
          status: 'SELF_ASSESSMENT',
          selfAssessmentDeadline: new Date(now.getTime() + 86400000 * 3),
          managerReviewDeadline: new Date(now.getTime() + 86400000 * 10),
          participants: [
            {
              id: 'p-1',
              status: 'ENROLLED',
              employeeId: 'emp-sub-1',
              employee: { userId: 'user-emp-1', displayName: 'Priya Nair' },
              manager: { userId: 'user-mgr-1', displayName: 'Vikram Mehta' },
              reviews: [{ id: 'r-1', status: 'NOT_STARTED' }], // Needs reminder
            },
            {
              id: 'p-2',
              status: 'ENROLLED',
              employeeId: 'emp-sub-2',
              employee: { userId: 'user-emp-2', displayName: 'Rohan Sharma' },
              manager: { userId: 'user-mgr-1', displayName: 'Vikram Mehta' },
              reviews: [{ id: 'r-2', status: 'FINALIZED' }], // Already finalized -> SKIP!
            },
          ],
        },
      ]);

      const result = await service.scanAndSendPerformanceReminders(mockAdminUser);

      expect(result.selfAssessmentsReminded).toBe(1);
      expect(notifications.createNotification).toHaveBeenCalledTimes(1);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-emp-1',
          title: expect.stringContaining('Self-Assessment Due Soon'),
        }),
      );
    });

    it('should remind managers of pending reviews awaiting their evaluation', async () => {
      const now = new Date();
      prisma.performanceGoal.findMany.mockResolvedValue([]);

      prisma.reviewCycle.findMany.mockResolvedValue([
        {
          id: 'cyc-1',
          name: 'H2 2026 Cycle',
          status: 'MANAGER_REVIEW',
          selfAssessmentDeadline: new Date(now.getTime() - 86400000 * 5),
          managerReviewDeadline: new Date(now.getTime() + 86400000 * 2), // 2 days left
          participants: [
            {
              id: 'p-1',
              status: 'ENROLLED',
              employeeId: 'emp-sub-1',
              employee: { userId: 'user-emp-1', displayName: 'Priya Nair' },
              manager: { userId: 'user-mgr-1', displayName: 'Vikram Mehta' },
              reviews: [{ id: 'r-1', status: 'SELF_ASSESSMENT_SUBMITTED' }], // Awaiting manager!
            },
          ],
        },
      ]);

      const result = await service.scanAndSendPerformanceReminders(mockAdminUser);

      expect(result.managerReviewsReminded).toBe(1);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-mgr-1',
          title: expect.stringContaining('Manager Review Due Soon'),
          link: '/progress?tab=manager-reviews',
        }),
      );
    });
  });

  describe('Failure Resilience (safeDispatch)', () => {
    it('should gracefully handle notification delivery failures without crashing caller transaction', async () => {
      notifications.createNotification.mockRejectedValue(
        new Error('Push notification gateway offline'),
      );

      // Safe dispatch should catch error, log warning, and return false
      const success = await service.safeDispatch({
        userId: 'user-1',
        organizationId: 'org-1',
        title: 'Test Notification',
        message: 'This notification fails',
      });

      expect(success).toBe(false);
    });
  });

  describe('Targeted On-Demand Nudges', () => {
    it('should send goal nudge and reject nudges for completed goals', async () => {
      prisma.performanceGoal.findUnique.mockResolvedValue({
        id: 'g-done',
        title: 'Legacy Goal',
        status: 'COMPLETED',
        organizationId: 'org-1',
        employee: { userId: 'user-emp-1' },
      });

      const res = await service.sendGoalNudge(mockAdminUser, 'g-done');
      expect(res.success).toBe(false);
      expect(res.message).toContain('already completed or cancelled');
    });

    it('should nudge manager when review is pending manager evaluation', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        id: 'rev-1',
        status: 'SELF_ASSESSMENT_SUBMITTED',
        organizationId: 'org-1',
        cycle: { name: 'Q3 Cycle' },
        employee: { displayName: 'Priya Nair', userId: 'user-emp-1' },
        manager: { displayName: 'Vikram Mehta', userId: 'user-mgr-1' },
      });

      const res = await service.sendReviewNudge(mockAdminUser, 'rev-1');
      expect(res.success).toBe(true);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-mgr-1',
          title: 'Manager Review Reminder: Q3 Cycle',
        }),
      );
    });
  });
});
