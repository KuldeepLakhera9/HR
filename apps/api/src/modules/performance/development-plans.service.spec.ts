import { Test, TestingModule } from '@nestjs/testing';
import { DevelopmentPlansService } from './development-plans.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { FeedbackVisibility, DevelopmentPlanStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('DevelopmentPlansService', () => {
  let service: DevelopmentPlansService;
  let prisma: any;
  let audit: any;
  let hierarchy: any;
  let notifications: any;

  const mockOrgId = 'org-123';
  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    organizationId: mockOrgId,
    roles: ['EMPLOYEE'],
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    employeeCode: 'EMP-001',
    status: 'ACTIVE' as any,
    permissions: [],
    sessionId: 'sess-1',
  };
  const mockManagerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    organizationId: mockOrgId,
    roles: ['MANAGER'],
    email: 'bob@example.com',
    firstName: 'Bob',
    lastName: 'Manager',
    employeeCode: 'MGR-001',
    status: 'ACTIVE' as any,
    permissions: [],
    sessionId: 'sess-2',
  };
  const mockHrUser: AuthenticatedUser = {
    id: 'user-hr-1',
    organizationId: mockOrgId,
    roles: ['HR'],
    email: 'charlie@example.com',
    firstName: 'Charlie',
    lastName: 'HR',
    employeeCode: 'HR-001',
    status: 'ACTIVE' as any,
    permissions: [],
    sessionId: 'sess-3',
  };

  const mockEmployee = {
    id: 'emp-1',
    userId: 'user-emp-1',
    organizationId: mockOrgId,
    displayName: 'Alice Smith',
    employeeCode: 'EMP-001',
    managerId: 'emp-mgr-1',
  };

  const mockManager = {
    id: 'emp-mgr-1',
    userId: 'user-mgr-1',
    organizationId: mockOrgId,
    displayName: 'Bob Manager',
    employeeCode: 'MGR-001',
  };

  const mockHr = {
    id: 'emp-hr-1',
    userId: 'user-hr-1',
    organizationId: mockOrgId,
    displayName: 'Charlie HR',
    employeeCode: 'HR-001',
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn(),
      },
      reviewCycleParticipant: {
        findFirst: jest.fn(),
      },
      developmentPlan: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      performanceReview: {
        findFirst: jest.fn(),
      },
      performanceFeedback: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      performanceReviewHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(true),
    };

    hierarchy = {
      getTeamMemberIds: jest.fn(),
    };

    notifications = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevelopmentPlansService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: HierarchyService, useValue: hierarchy },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<DevelopmentPlansService>(DevelopmentPlansService);
  });

  describe('getOverview - Role and Visibility Filtering', () => {
    it('should strictly show ONLY EMPLOYEE_VISIBLE feedback to the employee themselves', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      prisma.developmentPlan.findMany.mockResolvedValue([]);
      prisma.performanceReview.findFirst.mockResolvedValue({
        id: 'rev-1',
        managerStrengths: 'Strong problem solving',
        managerImprovements: 'Needs better documentation',
      });

      prisma.performanceFeedback.findMany.mockImplementation(({ where }: any) => {
        expect(where.visibility.in).toEqual([FeedbackVisibility.EMPLOYEE_VISIBLE]);
        return Promise.resolve([
          {
            id: 'fb-1',
            reviewId: 'rev-1',
            authorId: 'emp-mgr-1',
            author: mockManager,
            visibility: FeedbackVisibility.EMPLOYEE_VISIBLE,
            title: 'Great work',
            content: 'Keep it up',
            createdAt: new Date(),
          },
        ]);
      });

      const result = await service.getOverview(mockEmployeeUser);
      expect(result.feedbacks).toHaveLength(1);
      expect(result.feedbacks[0].visibility).toBe(FeedbackVisibility.EMPLOYEE_VISIBLE);
      expect(result.canManage).toBe(false);
      expect(result.strengthsSummary).toBe('Strong problem solving');
    });

    it('should show EMPLOYEE_VISIBLE and MANAGER_ONLY to an authorized manager, but NOT HR_CONFIDENTIAL', async () => {
      prisma.employee.findFirst
        .mockResolvedValueOnce(mockManager) // actorEmp
        .mockResolvedValueOnce(mockEmployee); // targetEmployee
      hierarchy.getTeamMemberIds.mockResolvedValue(['emp-1']);
      prisma.developmentPlan.findMany.mockResolvedValue([]);
      prisma.performanceReview.findFirst.mockResolvedValue({ id: 'rev-1' });

      prisma.performanceFeedback.findMany.mockImplementation(({ where }: any) => {
        expect(where.visibility.in).toContain(FeedbackVisibility.EMPLOYEE_VISIBLE);
        expect(where.visibility.in).toContain(FeedbackVisibility.MANAGER_ONLY);
        expect(where.visibility.in).not.toContain(FeedbackVisibility.HR_CONFIDENTIAL);
        return Promise.resolve([
          {
            id: 'fb-1',
            reviewId: 'rev-1',
            authorId: 'emp-mgr-1',
            author: mockManager,
            visibility: FeedbackVisibility.MANAGER_ONLY,
            title: 'Manager note',
            content: 'Under review',
            createdAt: new Date(),
          },
        ]);
      });

      const result = await service.getOverview(mockManagerUser, 'emp-1');
      expect(result.feedbacks).toHaveLength(1);
      expect(result.canManage).toBe(true);
    });

    it('should show ALL feedback tiers including HR_CONFIDENTIAL to HR admin', async () => {
      prisma.employee.findFirst.mockResolvedValueOnce(mockHr).mockResolvedValueOnce(mockEmployee);
      prisma.developmentPlan.findMany.mockResolvedValue([]);
      prisma.performanceReview.findFirst.mockResolvedValue({ id: 'rev-1' });

      prisma.performanceFeedback.findMany.mockImplementation(({ where }: any) => {
        expect(where.visibility.in).toContain(FeedbackVisibility.HR_CONFIDENTIAL);
        return Promise.resolve([]);
      });

      const result = await service.getOverview(mockHrUser, 'emp-1');
      expect(result.canManage).toBe(true);
    });

    it('should reject cross-team access when a manager tries to view an unrelated employee', async () => {
      prisma.employee.findFirst
        .mockResolvedValueOnce(mockManager)
        .mockResolvedValueOnce({ id: 'emp-other', organizationId: mockOrgId });
      hierarchy.getTeamMemberIds.mockResolvedValue(['emp-1']); // target is 'emp-other'

      await expect(service.getOverview(mockManagerUser, 'emp-other')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createPlan - Assignment & Authorization', () => {
    it('should allow authorized manager to assign a development plan', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManager);
      prisma.performanceReview.findFirst.mockResolvedValue({
        id: 'rev-1',
        employeeId: 'emp-1',
        organizationId: mockOrgId,
        employee: mockEmployee,
        cycle: { id: 'c-1', name: 'Annual 2026' },
      });
      hierarchy.getTeamMemberIds.mockResolvedValue(['emp-1']);

      const mockCreated = {
        id: 'plan-1',
        reviewId: 'rev-1',
        employeeId: 'emp-1',
        objective: 'Master System Design',
        actionSteps: 'Complete distributed systems course',
        successCriteria: 'Pass internal architecture review',
        targetDate: new Date('2026-12-31'),
        status: DevelopmentPlanStatus.PLANNED,
        responsiblePerson: 'Bob Manager',
        trainingNeeds: 'Architecture handbook',
        followUpNotes: null,
        completionEvidence: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: mockEmployee,
        review: { cycle: { name: 'Annual 2026' } },
      };
      prisma.developmentPlan.create.mockResolvedValue(mockCreated);

      const result = await service.createPlan(mockManagerUser, {
        reviewId: 'rev-1',
        objective: 'Master System Design',
        actionSteps: 'Complete distributed systems course',
        successCriteria: 'Pass internal architecture review',
        targetDate: '2026-12-31',
      });

      expect(result.id).toBe('plan-1');
      expect(result.successCriteria).toBe('Pass internal architecture review');
      expect(prisma.performanceReviewHistory.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PERFORMANCE_DEVELOPMENT_PLAN_CREATED',
          entity: 'DevelopmentPlan',
        }),
      );
      expect(notifications.createNotification).toHaveBeenCalled();
    });

    it('should prohibit regular employees from unilaterally creating/assigning plans', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      prisma.performanceReview.findFirst.mockResolvedValue({
        id: 'rev-1',
        employeeId: 'emp-1',
        organizationId: mockOrgId,
        employee: mockEmployee,
      });

      await expect(
        service.createPlan(mockEmployeeUser, {
          reviewId: 'rev-1',
          objective: 'Arbitrary self-goal',
          actionSteps: 'Take a break',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updatePlan - Role-Specific Update Rules', () => {
    it('should allow employees to update status, notes, and evidence for their own plan', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      const existingPlan = {
        id: 'plan-1',
        reviewId: 'rev-1',
        employeeId: 'emp-1',
        objective: 'Master System Design',
        actionSteps: 'Complete course',
        status: DevelopmentPlanStatus.IN_PROGRESS,
        review: { organizationId: mockOrgId, cycle: { name: 'Annual 2026' } },
        employee: mockEmployee,
      };
      prisma.developmentPlan.findFirst.mockResolvedValue(existingPlan);

      prisma.developmentPlan.update.mockResolvedValue({
        ...existingPlan,
        status: DevelopmentPlanStatus.COMPLETED,
        followUpNotes: 'Finished all modules with 95% score',
        completionEvidence: 'https://storage.internal/cert-123.pdf',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.updatePlan(mockEmployeeUser, 'plan-1', {
        status: DevelopmentPlanStatus.COMPLETED,
        followUpNotes: 'Finished all modules with 95% score',
        completionEvidence: 'https://storage.internal/cert-123.pdf',
      });

      expect(result.status).toBe(DevelopmentPlanStatus.COMPLETED);
      expect(result.completionEvidence).toBe('https://storage.internal/cert-123.pdf');
      expect(audit.record).toHaveBeenCalled();
    });

    it('should prevent employees from altering manager-assigned objective or action steps', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      prisma.developmentPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        reviewId: 'rev-1',
        employeeId: 'emp-1',
        review: { organizationId: mockOrgId },
        employee: mockEmployee,
      });

      await expect(
        service.updatePlan(mockEmployeeUser, 'plan-1', {
          objective: 'Tampered objective',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addFeedback - Confidential Notes & Security', () => {
    it('should prevent managers from creating HR_CONFIDENTIAL notes', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManager);
      prisma.performanceReview.findFirst.mockResolvedValue({
        id: 'rev-1',
        employeeId: 'emp-1',
        organizationId: mockOrgId,
        employee: mockEmployee,
      });
      hierarchy.getTeamMemberIds.mockResolvedValue(['emp-1']);

      await expect(
        service.addFeedback(mockManagerUser, {
          reviewId: 'rev-1',
          title: 'Private investigation',
          content: 'Confidential details',
          visibility: FeedbackVisibility.HR_CONFIDENTIAL,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow HR to create HR_CONFIDENTIAL notes', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockHr);
      prisma.performanceReview.findFirst.mockResolvedValue({
        id: 'rev-1',
        employeeId: 'emp-1',
        organizationId: mockOrgId,
        employee: mockEmployee,
      });

      prisma.performanceFeedback.create.mockResolvedValue({
        id: 'fb-conf-1',
        reviewId: 'rev-1',
        authorId: 'emp-hr-1',
        author: mockHr,
        visibility: FeedbackVisibility.HR_CONFIDENTIAL,
        title: 'HR Calibration Note',
        content: 'Internal merit review pending',
        createdAt: new Date(),
      });

      const result = await service.addFeedback(mockHrUser, {
        reviewId: 'rev-1',
        title: 'HR Calibration Note',
        content: 'Internal merit review pending',
        visibility: FeedbackVisibility.HR_CONFIDENTIAL,
      });

      expect(result.visibility).toBe(FeedbackVisibility.HR_CONFIDENTIAL);
      // Ensure no notification was sent to employee for confidential note!
      expect(notifications.createNotification).not.toHaveBeenCalled();
    });

    it('should send notification to employee for EMPLOYEE_VISIBLE feedback', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManager);
      prisma.performanceReview.findFirst.mockResolvedValue({
        id: 'rev-1',
        employeeId: 'emp-1',
        organizationId: mockOrgId,
        employee: mockEmployee,
      });
      hierarchy.getTeamMemberIds.mockResolvedValue(['emp-1']);

      prisma.performanceFeedback.create.mockResolvedValue({
        id: 'fb-pub-1',
        reviewId: 'rev-1',
        authorId: 'emp-mgr-1',
        author: mockManager,
        visibility: FeedbackVisibility.EMPLOYEE_VISIBLE,
        title: 'Q3 Recognition',
        content: 'Exceptional client demo delivery',
        createdAt: new Date(),
      });

      const result = await service.addFeedback(mockManagerUser, {
        reviewId: 'rev-1',
        title: 'Q3 Recognition',
        content: 'Exceptional client demo delivery',
        visibility: FeedbackVisibility.EMPLOYEE_VISIBLE,
      });

      expect(result.visibility).toBe(FeedbackVisibility.EMPLOYEE_VISIBLE);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockEmployee.userId,
          title: 'New Performance Feedback Received',
        }),
      );
    });
  });

  describe('sendReminder', () => {
    it('should allow manager to trigger a reminder notification to direct report', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManager);
      prisma.developmentPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        employeeId: 'emp-1',
        objective: 'Complete Security Training',
        review: { organizationId: mockOrgId },
        employee: mockEmployee,
      });
      hierarchy.getTeamMemberIds.mockResolvedValue(['emp-1']);

      const res = await service.sendReminder(mockManagerUser, 'plan-1');
      expect(res.success).toBe(true);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Action Item Reminder: Development Objective',
        }),
      );
    });
  });
});
