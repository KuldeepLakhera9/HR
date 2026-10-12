import { Test, TestingModule } from '@nestjs/testing';
import { ManagerReviewsService } from './manager-reviews.service';
import { RatingCalculationService } from './rating-calculation.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('ManagerReviewsService (Manager Performance Assessment)', () => {
  let service: ManagerReviewsService;
  let prisma: any;
  let audit: any;
  let hierarchy: any;
  let notifications: any;

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

  const mockOtherManagerUser: AuthenticatedUser = {
    id: 'user-mgr-2',
    email: 'rohit@example.com',
    organizationId: 'org-1',
    firstName: 'Rohit',
    lastName: 'Verma',
    employeeCode: 'MGR002',
    status: 'ACTIVE',
    roles: ['MANAGER'],
    permissions: [],
    sessionId: 'sess-mgr-2',
  };

  const mockHrUser: AuthenticatedUser = {
    id: 'user-hr-1',
    email: 'ananya@example.com',
    organizationId: 'org-1',
    firstName: 'Ananya',
    lastName: 'Iyer',
    employeeCode: 'HR001',
    status: 'ACTIVE',
    roles: ['HR'],
    permissions: [],
    sessionId: 'sess-hr-1',
  };

  const mockManagerEmployee = {
    id: 'emp-mgr-1',
    employeeCode: 'MGR001',
    displayName: 'Vikram Mehta',
    organizationId: 'org-1',
    status: 'CONFIRMED',
  };

  const mockOtherManagerEmployee = {
    id: 'emp-mgr-2',
    employeeCode: 'MGR002',
    displayName: 'Rohit Verma',
    organizationId: 'org-1',
    status: 'CONFIRMED',
  };

  const mockDirectReport = {
    id: 'emp-sub-1',
    employeeCode: 'EMP001',
    displayName: 'Priya Nair',
    organizationId: 'org-1',
    managerId: 'emp-mgr-1',
    status: 'CONFIRMED',
  };

  const mockCycle = {
    id: 'cycle-1',
    organizationId: 'org-1',
    name: 'FY2026 Annual Appraisal',
    code: 'CYC-2026-ANNUAL',
    status: 'MANAGER_REVIEW',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'),
    managerReviewDeadline: new Date(Date.now() + 86400000 * 5),
    goalsWeightPercentage: 70,
    competenciesWeightPercentage: 30,
    templateVersion: 2,
    ratingScaleMax: 5,
  };

  const mockReview = {
    id: 'rev-1',
    organizationId: 'org-1',
    cycleId: 'cycle-1',
    employeeId: 'emp-sub-1',
    managerId: 'emp-mgr-1',
    status: 'SELF_ASSESSMENT_SUBMITTED',
    templateVersion: 2,
    selfSummary: 'Self summary by Priya',
    selfAchievements: 'Completed all core targets',
    cycle: mockCycle,
    employee: {
      id: 'emp-sub-1',
      employeeCode: 'EMP001',
      displayName: 'Priya Nair',
      userId: 'user-emp-1',
    },
    items: [
      {
        id: 'item-1',
        goalId: 'goal-1',
        selfRating: 5,
        selfComments: 'Delivered ahead of time',
        isNotApplicable: false,
      },
      {
        id: 'item-2',
        competencyId: 'comp-1',
        selfRating: 4,
        selfComments: 'Followed company values',
        isNotApplicable: false,
      },
    ],
    feedbackNotes: [
      {
        id: 'note-1',
        title: 'Manager note',
        content: 'Good initiative',
        visibility: 'EMPLOYEE_VISIBLE',
      },
      {
        id: 'note-2',
        title: 'HR confidential memo',
        content: 'Compensation review pending',
        visibility: 'HR_CONFIDENTIAL',
      },
    ],
    developmentPlans: [],
    history: [],
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId === 'user-mgr-1') return Promise.resolve(mockManagerEmployee);
          if (where.userId === 'user-mgr-2') return Promise.resolve(mockOtherManagerEmployee);
          if (where.userId === 'user-hr-1') {
            return Promise.resolve({
              id: 'emp-hr-1',
              employeeCode: 'HR001',
              displayName: 'Ananya Iyer',
              organizationId: 'org-1',
            });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([mockDirectReport]),
      },
      reviewCycleParticipant: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          if (where?.managerId === 'emp-mgr-1') {
            return Promise.resolve([{ employeeId: 'emp-sub-1', managerId: 'emp-mgr-1' }]);
          }
          return Promise.resolve([]);
        }),
      },
      performanceReview: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'rev-1') return Promise.resolve(mockReview);
          if (where.id === 'rev-self') {
            return Promise.resolve({
              ...mockReview,
              id: 'rev-self',
              employeeId: 'emp-mgr-1', // Manager evaluating themselves
            });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          if (where?.managerId && where.managerId !== 'emp-mgr-1') {
            return Promise.resolve([]);
          }
          return Promise.resolve([mockReview]);
        }),
        count: jest.fn().mockResolvedValue(1),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...mockReview, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      performanceGoal: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'goal-1', title: 'Q3 Product Delivery', weight: 100 }]),
      },
      performanceCompetency: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'comp-1', name: 'Technical Excellence', weight: 100 }]),
      },
      performanceReviewItem: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            mockReview.items.find(
              (i) => i.goalId === where.goalId || i.competencyId === where.competencyId,
            ),
          );
        }),
        create: jest.fn().mockResolvedValue({ id: 'item-new' }),
        update: jest.fn().mockResolvedValue({ id: 'item-updated' }),
      },
      developmentPlan: {
        create: jest.fn().mockResolvedValue({ id: 'dev-1' }),
      },
      performanceFeedback: {
        create: jest.fn().mockResolvedValue({ id: 'feed-1' }),
      },
      performanceReviewHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };

    audit = {
      record: jest.fn().mockResolvedValue(true),
    };

    hierarchy = {
      getTeamMemberIds: jest.fn().mockImplementation((mgrId) => {
        if (mgrId === 'emp-mgr-1') return Promise.resolve(['emp-sub-1']);
        return Promise.resolve([]);
      }),
    };

    notifications = {
      createNotification: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagerReviewsService,
        RatingCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: HierarchyService, useValue: hierarchy },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<ManagerReviewsService>(ManagerReviewsService);
  });

  describe('Manager Scope & Security Access', () => {
    it('should return reviews in inbox for direct and indirect reports', async () => {
      const inbox = await service.getManagerInbox(mockManagerUser, {});

      expect(inbox.items).toHaveLength(1);
      expect(inbox.items[0].employeeId).toBe('emp-sub-1');
      expect(inbox.counts.all).toBe(1);
    });

    it('should forbid unauthorized cross-team review evaluation', async () => {
      // Rohit (MGR002) tries to inspect Vikram's report Priya
      await expect(service.getReviewDetail(mockOtherManagerUser, 'rev-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should strictly prohibit managers from evaluating their own performance', async () => {
      await expect(service.getReviewDetail(mockManagerUser, 'rev-self')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow HR/Admin full cross-team managerial review access', async () => {
      const detail = await service.getReviewDetail(mockHrUser, 'rev-1');
      expect(detail.review.id).toBe('rev-1');
    });

    it('should protect confidential HR notes from manager view', async () => {
      const detail = await service.getReviewDetail(mockManagerUser, 'rev-1');
      // Manager should only see EMPLOYEE_VISIBLE, not HR_CONFIDENTIAL
      const noteVisibilities = detail.feedbackNotes.map((n) => n.visibility);
      expect(noteVisibilities).toContain('EMPLOYEE_VISIBLE');
      expect(noteVisibilities).not.toContain('HR_CONFIDENTIAL');
    });
  });

  describe('Score Calculation & Deterministic Rubric', () => {
    it('should accurately calculate weighted goal and competency scores and round to 2 decimals', async () => {
      // Goal weight = 100, Competency weight = 100
      // Cycle weights: 70% Goals, 30% Competencies
      // Goal rating = 4.0, Competency rating = 5.0
      // Expected overall = (4.0 * 70 + 5.0 * 30) / 100 = 4.30
      jest.spyOn(service, 'getReviewDetail').mockResolvedValue({
        review: {
          ...mockReview,
          overallScore: 4.3,
          calculatedGoalsScore: 4,
          calculatedCompetenciesScore: 5,
        },
      } as any);

      await service.saveDraft(mockManagerUser, 'rev-1', {
        managerSummary: 'Solid execution throughout cycle',
        items: [
          { goalId: 'goal-1', managerRating: 4 },
          { competencyId: 'comp-1', managerRating: 5 },
        ],
      });

      expect(prisma.performanceReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            calculatedGoalsScore: 4,
            calculatedCompetenciesScore: 5,
            overallScore: 4.3,
            scoreExplanation: expect.stringContaining('Overall: 4.3 / 5'),
          }),
        }),
      );
    });
  });

  describe('Draft Saving & Submission Validation', () => {
    it('should enforce required narrative sections on formal submission', async () => {
      await expect(
        service.submitReview(mockManagerUser, 'rev-1', {
          managerSummary: '',
          managerStrengths: 'Good work',
          managerImprovements: 'Need more communication',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.submitReview(mockManagerUser, 'rev-1', {
          managerSummary: 'Valid executive summary long enough',
          managerStrengths: 'Too short', // less than 10 chars
          managerImprovements: 'Need more communication skills',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject ratings exceeding ratingScaleMax', async () => {
      await expect(
        service.submitReview(mockManagerUser, 'rev-1', {
          managerSummary: 'Thorough evaluation of all deliverables and goals',
          managerStrengths: 'Demonstrated exceptional leadership and delivery speed',
          managerImprovements: 'Focus on cross-functional alignment and documentation',
          items: [{ goalId: 'goal-1', managerRating: 7 }], // max is 5
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should formally submit review, update status, and record audit trail', async () => {
      jest.spyOn(service, 'getReviewDetail').mockResolvedValue({
        review: { ...mockReview, status: 'MANAGER_REVIEW_SUBMITTED' },
      } as any);

      const result = await service.submitReview(mockManagerUser, 'rev-1', {
        managerSummary: 'Thorough evaluation of all deliverables and goals',
        managerStrengths: 'Demonstrated exceptional leadership and delivery speed',
        managerImprovements: 'Focus on cross-functional alignment and documentation',
        items: [
          { goalId: 'goal-1', managerRating: 5, managerComments: 'Flawless execution' },
          { competencyId: 'comp-1', managerRating: 4, managerComments: 'Very collaborative' },
        ],
        developmentPlans: [
          {
            objective: 'Lead Q4 Architecture Working Group',
            actionSteps: 'Host weekly design reviews',
            trainingNeeds: 'System design masterclass',
          },
        ],
      });

      expect(prisma.performanceReviewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'MANAGER_REVIEW_SUBMITTED',
            actorId: 'emp-mgr-1',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MANAGER_REVIEW_SUBMITTED',
          entity: 'PerformanceReview',
          entityId: 'rev-1',
        }),
      );
      expect(notifications.createNotification).toHaveBeenCalled();
    });

    it('should reject duplicate submission once already submitted', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        ...mockReview,
        status: 'MANAGER_REVIEW_SUBMITTED',
      });

      await expect(
        service.submitReview(mockManagerUser, 'rev-1', {
          managerSummary: 'Thorough evaluation of all deliverables and goals',
          managerStrengths: 'Demonstrated exceptional leadership and delivery speed',
          managerImprovements: 'Focus on cross-functional alignment and documentation',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Return for Correction & Reopening', () => {
    it('should require mandatory reason when returning review to employee', async () => {
      await expect(
        service.returnForCorrection(mockManagerUser, 'rev-1', { reason: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return review to employee with REOPENED status and notify employee', async () => {
      jest.spyOn(service, 'getReviewDetail').mockResolvedValue({
        review: { ...mockReview, status: 'REOPENED', reopenReason: 'Please attach Q3 metrics' },
      } as any);

      await service.returnForCorrection(mockManagerUser, 'rev-1', {
        reason: 'Please attach Q3 metrics report',
      });

      expect(prisma.performanceReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REOPENED',
            reopenReason: 'Please attach Q3 metrics report',
            reopenedById: 'emp-mgr-1',
          }),
        }),
      );
      expect(notifications.createNotification).toHaveBeenCalled();
    });
  });

  describe('Atomic Finalization & Concurrency Protection', () => {
    it('should prevent concurrent or invalid finalization attempts', async () => {
      prisma.performanceReview.updateMany.mockResolvedValue({ count: 0 }); // simulate race condition or invalid state

      await expect(
        service.finalizeReview(mockManagerUser, 'rev-1', { finalComments: 'Approved' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should atomically finalize review, record audit history, and notify employee', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        ...mockReview,
        status: 'MANAGER_REVIEW_SUBMITTED',
      });
      prisma.performanceReview.updateMany.mockResolvedValue({ count: 1 });

      jest.spyOn(service, 'getReviewDetail').mockResolvedValue({
        review: { ...mockReview, status: 'FINALIZED' },
      } as any);

      await service.finalizeReview(mockManagerUser, 'rev-1', {
        finalComments: 'Official appraisal finalized successfully',
      });

      expect(prisma.performanceReviewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REVIEW_FINALIZED',
            actorId: 'emp-mgr-1',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REVIEW_FINALIZED',
          entity: 'PerformanceReview',
        }),
      );
    });
  });
});
