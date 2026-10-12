import { Test, TestingModule } from '@nestjs/testing';
import { ReviewCyclesService } from './review-cycles.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.module';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ReviewCycleStatus, ParticipantStatus, ReviewCycleType } from '@prisma/client';

describe('ReviewCyclesService (Performance Review Cycle Administration)', () => {
  let service: ReviewCyclesService;
  let prisma: any;
  let audit: any;
  let notifications: any;

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
    sessionId: 'sess-hr',
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
    sessionId: 'sess-emp',
  };

  beforeEach(async () => {
    prisma = {
      reviewCycle: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      reviewCycleParticipant: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(5),
      },
      reviewCycleHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
      },
      performanceReview: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
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
        ReviewCyclesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<ReviewCyclesService>(ReviewCyclesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCycle', () => {
    it('creates a review cycle successfully for HR user', async () => {
      prisma.reviewCycle.findFirst.mockResolvedValue(null);
      prisma.reviewCycle.create.mockResolvedValue({
        id: 'cycle-1',
        name: 'FY 2026-27 Annual Review',
        code: 'CYCLE-2026-ANNUAL',
        type: ReviewCycleType.ANNUAL,
        status: ReviewCycleStatus.DRAFT,
        goalsWeightPercentage: 70,
        competenciesWeightPercentage: 30,
      });

      const res = await service.createCycle(mockHrUser, {
        name: 'FY 2026-27 Annual Review',
        code: 'CYCLE-2026-ANNUAL',
        type: ReviewCycleType.ANNUAL,
        startDate: '2026-10-01',
        endDate: '2027-03-31',
        goalsWeightPercentage: 70,
        competenciesWeightPercentage: 30,
      });

      expect(res).toBeDefined();
      expect(res.id).toBe('cycle-1');
      expect(prisma.reviewCycle.create).toHaveBeenCalled();
      expect(prisma.reviewCycleHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATED' }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REVIEW_CYCLE_CREATED' }),
      );
    });

    it('rejects cycle creation if caller is regular employee', async () => {
      await expect(
        service.createCycle(mockEmployeeUser, {
          name: 'Unauthorized Cycle',
          code: 'CYCLE-FAIL',
          type: ReviewCycleType.ANNUAL,
          startDate: '2026-10-01',
          endDate: '2027-03-31',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cycle creation if end date is before start date', async () => {
      await expect(
        service.createCycle(mockHrUser, {
          name: 'Invalid Dates Cycle',
          code: 'CYCLE-INV-DATE',
          type: ReviewCycleType.QUARTERLY,
          startDate: '2026-10-31',
          endDate: '2026-10-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cycle creation if goal and competency weights do not sum to 100%', async () => {
      await expect(
        service.createCycle(mockHrUser, {
          name: 'Bad Weight Cycle',
          code: 'CYCLE-BAD-WEIGHT',
          type: ReviewCycleType.ANNUAL,
          startDate: '2026-10-01',
          endDate: '2027-03-31',
          goalsWeightPercentage: 80,
          competenciesWeightPercentage: 40, // 120% total
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cycle creation if code already exists in organization', async () => {
      prisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'existing-cycle',
        code: 'CYCLE-DUP',
      });

      await expect(
        service.createCycle(mockHrUser, {
          name: 'Duplicate Code Cycle',
          code: 'CYCLE-DUP',
          type: ReviewCycleType.ANNUAL,
          startDate: '2026-10-01',
          endDate: '2027-03-31',
          goalsWeightPercentage: 70,
          competenciesWeightPercentage: 30,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects contradictory deadline sequence (self-assessment after manager-review)', async () => {
      await expect(
        service.createCycle(mockHrUser, {
          name: 'Contradictory Deadlines',
          code: 'CYCLE-CONTRADICT',
          type: ReviewCycleType.ANNUAL,
          startDate: '2026-10-01',
          endDate: '2027-03-31',
          selfAssessmentDeadline: '2026-12-15',
          managerReviewDeadline: '2026-11-15', // Manager review earlier than self-assessment
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateCycle & Template Versioning', () => {
    it('increments templateVersion when rating weights or rubric change', async () => {
      prisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        organizationId: 'org-1',
        name: 'Original Cycle',
        status: ReviewCycleStatus.GOAL_SETTING,
        startDate: new Date('2026-10-01'),
        endDate: new Date('2027-03-31'),
        goalsWeightPercentage: 70,
        competenciesWeightPercentage: 30,
        templateVersion: 1,
        ratingScaleMax: 5,
      });

      prisma.reviewCycle.update.mockResolvedValue({
        id: 'cycle-1',
        name: 'Original Cycle',
        goalsWeightPercentage: 60,
        competenciesWeightPercentage: 40,
        templateVersion: 2,
      });

      const res = await service.updateCycle(mockHrUser, 'cycle-1', {
        goalsWeightPercentage: 60,
        competenciesWeightPercentage: 40,
        changeReason: 'Adjusted competency emphasis to 40%',
      });

      expect(res.templateVersion).toBe(2);
      expect(prisma.reviewCycleHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPDATED',
          }),
        }),
      );
    });

    it('blocks structural updates on finalized cycles without reopening', async () => {
      prisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-final',
        organizationId: 'org-1',
        status: ReviewCycleStatus.FINALIZED,
        reopenedAt: null,
        startDate: new Date('2026-10-01'),
        endDate: new Date('2027-03-31'),
        goalsWeightPercentage: 70,
        competenciesWeightPercentage: 30,
      });

      await expect(
        service.updateCycle(mockHrUser, 'cycle-final', {
          name: 'Renaming Finalized Cycle',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('enrollParticipants & Duplicate Protection', () => {
    it('enrolls eligible employees without duplicate records', async () => {
      prisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        organizationId: 'org-1',
        status: ReviewCycleStatus.GOAL_SETTING,
        templateVersion: 1,
        goalsWeightPercentage: 70,
        competenciesWeightPercentage: 30,
        eligibleDepartmentIds: null,
      });

      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          employeeCode: 'EMP001',
          displayName: 'Priya Nair',
          managerId: 'emp-mgr-1',
          employment: {
            department: { name: 'Eng' },
            designation: { title: 'Dev' },
            manager: { displayName: 'Rahul' },
          },
        },
        {
          id: 'emp-2',
          employeeCode: 'EMP002',
          displayName: 'Arun Patel',
          managerId: 'emp-mgr-1',
          employment: {
            department: { name: 'Eng' },
            designation: { title: 'Dev' },
            manager: { displayName: 'Rahul' },
          },
        },
      ]);

      prisma.reviewCycleParticipant.upsert.mockResolvedValue({ id: 'part-1' });

      const res = await service.enrollParticipants(mockHrUser, 'cycle-1');

      expect(res.success).toBe(true);
      expect(res.enrolledCount).toBe(2);
      expect(prisma.reviewCycleParticipant.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.reviewCycleHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ENROLLMENT_COMPLETED' }),
        }),
      );
    });
  });

  describe('reassignManager', () => {
    it('reassigns evaluating manager and preserves previous manager history', async () => {
      prisma.reviewCycleParticipant.findFirst.mockResolvedValue({
        id: 'part-1',
        cycleId: 'cycle-1',
        employeeId: 'emp-1',
        managerId: 'old-mgr-1',
        employee: { displayName: 'Priya Nair' },
      });

      prisma.employee.findFirst.mockResolvedValue({
        id: 'new-mgr-2',
        displayName: 'Siddharth Rao',
      });

      prisma.reviewCycleParticipant.update.mockResolvedValue({
        id: 'part-1',
        managerId: 'new-mgr-2',
        previousManagerId: 'old-mgr-1',
      });

      const res = await service.reassignManager(mockHrUser, 'cycle-1', 'part-1', {
        newManagerId: 'new-mgr-2',
        reason: 'Organizational restructuring in Q4',
      });

      expect(res.managerId).toBe('new-mgr-2');
      expect(res.previousManagerId).toBe('old-mgr-1');
      expect(prisma.reviewCycleHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'MANAGER_REASSIGNED' }),
        }),
      );
    });

    it('rejects self-evaluation as manager', async () => {
      prisma.reviewCycleParticipant.findFirst.mockResolvedValue({
        id: 'part-1',
        cycleId: 'cycle-1',
        employeeId: 'emp-1',
        managerId: 'old-mgr',
      });

      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-1', // Same as participant employeeId
        displayName: 'Priya Nair',
      });

      await expect(
        service.reassignManager(mockHrUser, 'cycle-1', 'part-1', {
          newManagerId: 'emp-1',
          reason: 'Invalid self-evaluation attempt',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exemptParticipant', () => {
    it('exempts employee on leave of absence with documented reason', async () => {
      prisma.reviewCycleParticipant.findFirst.mockResolvedValue({
        id: 'part-1',
        cycleId: 'cycle-1',
        status: ParticipantStatus.ENROLLED,
      });

      prisma.reviewCycleParticipant.update.mockResolvedValue({
        id: 'part-1',
        status: ParticipantStatus.EXEMPTED,
        exemptionReason: 'On approved 6-month maternity leave',
      });

      const res = await service.exemptParticipant(mockHrUser, 'cycle-1', 'part-1', {
        exemptionReason: 'On approved 6-month maternity leave',
      });

      expect(res.status).toBe(ParticipantStatus.EXEMPTED);
      expect(prisma.reviewCycleHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PARTICIPANT_EXEMPTED' }),
        }),
      );
    });
  });

  describe('transitionStage', () => {
    it('advances cycle stage from GOAL_SETTING to SELF_ASSESSMENT', async () => {
      prisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        status: ReviewCycleStatus.GOAL_SETTING,
      });
      prisma.reviewCycleParticipant.count.mockResolvedValue(10);
      prisma.reviewCycle.update.mockResolvedValue({
        id: 'cycle-1',
        status: ReviewCycleStatus.SELF_ASSESSMENT,
      });

      const res = await service.transitionStage(mockHrUser, 'cycle-1', {
        targetStatus: ReviewCycleStatus.SELF_ASSESSMENT,
        reason: 'Goal-setting window closed; opening self-evaluations',
      });

      expect(res.status).toBe(ReviewCycleStatus.SELF_ASSESSMENT);
      expect(prisma.reviewCycleHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'STAGE_TRANSITIONED' }),
        }),
      );
    });

    it('rejects invalid stage leap (e.g. DRAFT to FINALIZED)', async () => {
      prisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        status: ReviewCycleStatus.DRAFT,
      });

      await expect(
        service.transitionStage(mockHrUser, 'cycle-1', {
          targetStatus: ReviewCycleStatus.FINALIZED,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reopenCycle', () => {
    it('reopens a finalized review cycle with mandatory justification', async () => {
      prisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        status: ReviewCycleStatus.FINALIZED,
      });
      prisma.reviewCycle.update.mockResolvedValue({
        id: 'cycle-1',
        status: ReviewCycleStatus.HR_CALIBRATION,
        reopenReason: 'Reopening for late manager reviews due to medical leave',
      });

      const res = await service.reopenCycle(mockHrUser, 'cycle-1', {
        reopenReason: 'Reopening for late manager reviews due to medical leave',
        extendedFinalizationDeadline: '2027-04-15',
      });

      expect(res.status).toBe(ReviewCycleStatus.HR_CALIBRATION);
      expect(prisma.reviewCycleHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'REOPENED' }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CYCLE_REOPENED' }),
      );
    });

    it('rejects reopening if cycle is not in FINALIZED status', async () => {
      prisma.reviewCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        status: ReviewCycleStatus.SELF_ASSESSMENT,
      });

      await expect(
        service.reopenCycle(mockHrUser, 'cycle-1', {
          reopenReason: 'Invalid reopen attempt',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
