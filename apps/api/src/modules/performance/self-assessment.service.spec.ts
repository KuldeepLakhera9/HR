import { Test, TestingModule } from '@nestjs/testing';
import { SelfAssessmentService } from './self-assessment.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.module';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('SelfAssessmentService (Employee Self-Assessment)', () => {
  let service: SelfAssessmentService;
  let prisma: any;
  let audit: any;
  let notifications: any;

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

  const mockOtherUser: AuthenticatedUser = {
    id: 'user-emp-2',
    email: 'rahul@example.com',
    organizationId: 'org-1',
    firstName: 'Rahul',
    lastName: 'Sharma',
    employeeCode: 'EMP002',
    status: 'ACTIVE',
    roles: ['EMPLOYEE'],
    permissions: [],
    sessionId: 'sess-emp-2',
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

  const mockEmployee = {
    id: 'emp-1',
    employeeCode: 'EMP001',
    displayName: 'Priya Nair',
    organizationId: 'org-1',
    managerId: 'mgr-1',
    status: 'CONFIRMED',
  };

  const mockCycle = {
    id: 'cycle-1',
    organizationId: 'org-1',
    name: 'FY2026 Annual Appraisal',
    code: 'CYC-2026-ANNUAL',
    status: 'SELF_ASSESSMENT',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'),
    selfAssessmentDeadline: new Date(Date.now() + 86400000 * 7), // 7 days in future
    templateVersion: 2,
    ratingScaleMax: 5,
  };

  const mockParticipant = {
    id: 'part-1',
    cycleId: 'cycle-1',
    employeeId: 'emp-1',
    managerId: 'mgr-1',
    status: 'ENROLLED',
    cycle: mockCycle,
    manager: {
      id: 'mgr-1',
      employeeCode: 'MGR001',
      displayName: 'Vikram Mehta',
    },
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId === 'user-emp-1') return Promise.resolve(mockEmployee);
          if (where.userId === 'user-emp-2') {
            return Promise.resolve({
              id: 'emp-2',
              employeeCode: 'EMP002',
              displayName: 'Rahul Sharma',
              organizationId: 'org-1',
            });
          }
          if (where.userId === 'user-hr-1') {
            return Promise.resolve({
              id: 'hr-1',
              employeeCode: 'HR001',
              displayName: 'Ananya Iyer',
              organizationId: 'org-1',
            });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      reviewCycleParticipant: {
        findFirst: jest.fn().mockResolvedValue(mockParticipant),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (
            where.cycleId_employeeId?.cycleId === 'cycle-1' &&
            where.cycleId_employeeId?.employeeId === 'emp-1'
          ) {
            return Promise.resolve(mockParticipant);
          }
          return Promise.resolve(null);
        }),
      },
      reviewCycle: {
        findFirst: jest.fn().mockResolvedValue(mockCycle),
        findUnique: jest.fn().mockResolvedValue(mockCycle),
      },
      performanceGoal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'goal-1',
            title: 'Q3 Product Delivery',
            weight: 30,
            status: 'APPROVED',
            employeeId: 'emp-1',
          },
        ]),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'goal-1' && where.employeeId === 'emp-1') {
            return Promise.resolve({ id: 'goal-1', employeeId: 'emp-1' });
          }
          return Promise.resolve(null);
        }),
      },
      performanceCompetency: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'comp-1',
            name: 'Technical Excellence',
            weight: 20,
          },
        ]),
      },
      performanceReview: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      performanceReviewItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'item-1' }),
        update: jest.fn().mockResolvedValue({ id: 'item-1' }),
      },
      performanceReviewHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };

    audit = {
      record: jest.fn().mockResolvedValue(true),
    };

    notifications = {
      createNotification: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelfAssessmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<SelfAssessmentService>(SelfAssessmentService);
  });

  describe('Active Context & Eligibility', () => {
    it('should return enrolled cycle, goals, competencies, and edit permissions', async () => {
      prisma.performanceReview.findFirst.mockResolvedValue(null);

      const context = await service.getEmployeeActiveContext(mockEmployeeUser);

      expect(context.participant.id).toBe('part-1');
      expect(context.cycle.name).toBe('FY2026 Annual Appraisal');
      expect(context.goals).toHaveLength(1);
      expect(context.competencies).toHaveLength(1);
      expect(context.canEdit).toBe(true);
      expect(context.canSubmit).toBe(true);
      expect(context.isDeadlinePassed).toBe(false);
    });

    it('should reject context resolution when employee is not enrolled in any cycle', async () => {
      prisma.reviewCycleParticipant.findFirst.mockResolvedValue(null);

      await expect(service.getEmployeeActiveContext(mockEmployeeUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should disallow edit when employee is exempted from cycle', async () => {
      prisma.reviewCycleParticipant.findFirst.mockResolvedValue({
        ...mockParticipant,
        status: 'EXEMPTED',
        exemptionReason: 'On Maternity Leave',
      });

      const context = await service.getEmployeeActiveContext(mockEmployeeUser);

      expect(context.canEdit).toBe(false);
      expect(context.canSubmit).toBe(false);
    });
  });

  describe('Draft Creation & Updates', () => {
    it('should save draft self-assessment with versioned template snapshot', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue(null);
      prisma.performanceReview.upsert.mockResolvedValue({
        id: 'rev-1',
        cycleId: 'cycle-1',
        employeeId: 'emp-1',
        status: 'SELF_ASSESSMENT_DRAFT',
        templateVersion: 2,
        selfSummary: 'Draft summary of progress',
        selfAchievements: 'Launched microservice architecture',
        organizationId: 'org-1',
      });

      // Mock getReviewById return
      jest.spyOn(service, 'getReviewById').mockResolvedValue({
        id: 'rev-1',
        cycleId: 'cycle-1',
        employeeId: 'emp-1',
        status: 'SELF_ASSESSMENT_DRAFT',
        templateVersion: 2,
        selfSummary: 'Draft summary of progress',
        selfAchievements: 'Launched microservice architecture',
      } as any);

      const result = await service.saveDraft(mockEmployeeUser, {
        cycleId: 'cycle-1',
        selfSummary: 'Draft summary of progress',
        selfAchievements: 'Launched microservice architecture',
        items: [
          {
            goalId: 'goal-1',
            selfRating: 4.5,
            selfComments: 'Exceeded target metrics by 20%',
          },
        ],
      });

      expect(result.status).toBe('SELF_ASSESSMENT_DRAFT');
      expect(result.templateVersion).toBe(2);
      expect(prisma.performanceReviewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SELF_ASSESSMENT_DRAFT_SAVED',
            actorId: 'emp-1',
          }),
        }),
      );
    });

    it('should reject draft save if employee is not enrolled in the cycle', async () => {
      prisma.reviewCycleParticipant.findUnique.mockResolvedValue(null);

      await expect(
        service.saveDraft(mockEmployeeUser, {
          cycleId: 'cycle-unauthorized',
          selfSummary: 'Testing',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject draft update if self-assessment has already been formally submitted', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        id: 'rev-1',
        status: 'SELF_ASSESSMENT_SUBMITTED',
        employeeId: 'emp-1',
      });

      await expect(
        service.saveDraft(mockEmployeeUser, {
          cycleId: 'cycle-1',
          selfSummary: 'Attempting to change after submission',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject draft save if deadline has passed and review is not reopened', async () => {
      prisma.reviewCycleParticipant.findUnique.mockResolvedValue({
        ...mockParticipant,
        cycle: {
          ...mockCycle,
          selfAssessmentDeadline: new Date(Date.now() - 86400000), // yesterday
        },
      });

      await expect(
        service.saveDraft(mockEmployeeUser, {
          cycleId: 'cycle-1',
          selfSummary: 'Late draft update',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject draft save if goal does not belong to the employee', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue(null);
      prisma.performanceReview.upsert.mockResolvedValue({
        id: 'rev-1',
        cycleId: 'cycle-1',
        employeeId: 'emp-1',
      });
      prisma.performanceGoal.findFirst.mockResolvedValue(null); // not found for this employee

      await expect(
        service.saveDraft(mockEmployeeUser, {
          cycleId: 'cycle-1',
          items: [{ goalId: 'goal-belonging-to-someone-else', selfRating: 5 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Formal Submission & Validation', () => {
    it('should enforce required executive summary and achievements', async () => {
      await expect(
        service.submitSelfAssessment(mockEmployeeUser, {
          cycleId: 'cycle-1',
          selfSummary: '',
          selfAchievements: 'Some achievements',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.submitSelfAssessment(mockEmployeeUser, {
          cycleId: 'cycle-1',
          selfSummary: 'Valid executive summary long enough',
          selfAchievements: 'Short', // less than 10 chars
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject rating scores exceeding cycle ratingScaleMax', async () => {
      await expect(
        service.submitSelfAssessment(mockEmployeeUser, {
          cycleId: 'cycle-1',
          selfSummary: 'Comprehensive self-reflection summary of work',
          selfAchievements: 'Achieved high impact results across all pillars',
          items: [{ goalId: 'goal-1', selfRating: 6 }], // max is 5
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully submit self-assessment, lock review, and record audit trail', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue(null);
      prisma.performanceReview.upsert.mockResolvedValue({
        id: 'rev-1',
        cycleId: 'cycle-1',
        employeeId: 'emp-1',
        status: 'SELF_ASSESSMENT_SUBMITTED',
        templateVersion: 2,
        selfSubmittedAt: new Date(),
        organizationId: 'org-1',
      });

      jest.spyOn(service, 'getReviewById').mockResolvedValue({
        id: 'rev-1',
        cycleId: 'cycle-1',
        employeeId: 'emp-1',
        status: 'SELF_ASSESSMENT_SUBMITTED',
        templateVersion: 2,
        selfSummary: 'Annual comprehensive evaluation of milestones',
        selfAchievements: 'Scaled microservices to support 100k requests/min',
      } as any);

      const result = await service.submitSelfAssessment(mockEmployeeUser, {
        cycleId: 'cycle-1',
        selfSummary: 'Annual comprehensive evaluation of milestones',
        selfAchievements: 'Scaled microservices to support 100k requests/min',
        items: [{ goalId: 'goal-1', selfRating: 5, selfComments: 'All targets exceeded' }],
      });

      expect(result.status).toBe('SELF_ASSESSMENT_SUBMITTED');
      expect(prisma.performanceReviewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SELF_ASSESSMENT_SUBMITTED',
            actorId: 'emp-1',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SELF_ASSESSMENT_SUBMITTED',
          entity: 'PerformanceReview',
          entityId: 'rev-1',
        }),
      );
      expect(notifications.createNotification).toHaveBeenCalled();
    });

    it('should prevent duplicate submission once already submitted', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        id: 'rev-1',
        status: 'SELF_ASSESSMENT_SUBMITTED',
        employeeId: 'emp-1',
      });

      await expect(
        service.submitSelfAssessment(mockEmployeeUser, {
          cycleId: 'cycle-1',
          selfSummary: 'Annual comprehensive evaluation of milestones',
          selfAchievements: 'Scaled microservices to support 100k requests/min',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Security & Access Control', () => {
    it('should prevent an employee from viewing another employee review', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        id: 'rev-2',
        employeeId: 'emp-2', // belongs to Rahul
        managerId: 'mgr-2',
        organizationId: 'org-1',
      });

      // Priya attempts to view Rahul's review
      await expect(service.getReviewById(mockEmployeeUser, 'rev-2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow HR to view any review within their organization', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        id: 'rev-2',
        employeeId: 'emp-2',
        managerId: 'mgr-2',
        organizationId: 'org-1',
      });

      const result = await service.getReviewById(mockHrUser, 'rev-2');
      expect(result.id).toBe('rev-2');
    });
  });

  describe('Reopening & Audit Workflow', () => {
    it('should disallow regular employees from reopening their own review', async () => {
      await expect(
        service.reopenSelfAssessment(mockEmployeeUser, 'rev-1', {
          reason: 'Need to update achievements',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow HR/Admin to reopen submitted review with mandatory reason', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        id: 'rev-1',
        status: 'SELF_ASSESSMENT_SUBMITTED',
        cycleId: 'cycle-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        employee: { id: 'emp-1', displayName: 'Priya Nair', userId: 'user-emp-1' },
        cycle: { name: 'FY2026 Annual Appraisal' },
      });

      prisma.performanceReview.update.mockResolvedValue({
        id: 'rev-1',
        status: 'REOPENED',
      });

      jest.spyOn(service, 'getReviewById').mockResolvedValue({
        id: 'rev-1',
        status: 'REOPENED',
        reopenReason: 'Authorized correction for project metrics',
      } as any);

      const result = await service.reopenSelfAssessment(mockHrUser, 'rev-1', {
        reason: 'Authorized correction for project metrics',
      });

      expect(result.status).toBe('REOPENED');
      expect(prisma.performanceReviewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SELF_ASSESSMENT_REOPENED',
            changeReason: 'Authorized correction for project metrics',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SELF_ASSESSMENT_REOPENED',
          entity: 'PerformanceReview',
        }),
      );
    });

    it('should allow employee to edit and resubmit once review is REOPENED even after deadline', async () => {
      // Reopened review past deadline
      prisma.reviewCycleParticipant.findUnique.mockResolvedValue({
        ...mockParticipant,
        cycle: {
          ...mockCycle,
          selfAssessmentDeadline: new Date(Date.now() - 86400000), // deadline passed
        },
      });

      prisma.performanceReview.findUnique.mockResolvedValue({
        id: 'rev-1',
        status: 'REOPENED',
        employeeId: 'emp-1',
      });

      prisma.performanceReview.upsert.mockResolvedValue({
        id: 'rev-1',
        status: 'SELF_ASSESSMENT_SUBMITTED',
        organizationId: 'org-1',
      });

      jest.spyOn(service, 'getReviewById').mockResolvedValue({
        id: 'rev-1',
        status: 'SELF_ASSESSMENT_SUBMITTED',
      } as any);

      const res = await service.submitSelfAssessment(mockEmployeeUser, {
        cycleId: 'cycle-1',
        selfSummary: 'Corrected evaluation with audited updates',
        selfAchievements: 'Corrected high impact delivery metrics',
      });

      expect(res.status).toBe('SELF_ASSESSMENT_SUBMITTED');
    });
  });
});
