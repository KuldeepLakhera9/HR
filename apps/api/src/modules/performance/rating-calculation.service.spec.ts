import { Test, TestingModule } from '@nestjs/testing';
import { RatingCalculationService, ScoreCalculationInput } from './rating-calculation.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('RatingCalculationService (Performance Rating and Calculation Engine)', () => {
  let service: RatingCalculationService;
  let prisma: any;
  let audit: any;
  let hierarchy: any;

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

  const mockHrEmployee = {
    id: 'emp-hr-1',
    userId: 'user-hr-1',
    organizationId: 'org-1',
    displayName: 'Ananya Iyer',
    employeeCode: 'HR001',
  };

  const mockManagerEmployee = {
    id: 'emp-mgr-1',
    userId: 'user-mgr-1',
    organizationId: 'org-1',
    displayName: 'Vikram Mehta',
    employeeCode: 'MGR001',
  };

  const mockTargetEmployee = {
    id: 'emp-sub-1',
    userId: 'user-emp-1',
    organizationId: 'org-1',
    displayName: 'Priya Nair',
    employeeCode: 'EMP001',
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId === 'user-hr-1') return Promise.resolve(mockHrEmployee);
          if (where.userId === 'user-mgr-1') return Promise.resolve(mockManagerEmployee);
          if (where.userId === 'user-emp-1') return Promise.resolve(mockTargetEmployee);
          return Promise.resolve(null);
        }),
      },
      performanceReview: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      performanceGoal: {
        findMany: jest.fn(),
      },
      performanceCompetency: {
        findMany: jest.fn(),
      },
      performanceReviewHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(true),
    };

    hierarchy = {
      getTeamMemberIds: jest.fn().mockResolvedValue(['emp-sub-1']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: HierarchyService, useValue: hierarchy },
      ],
    }).compile();

    service = module.get<RatingCalculationService>(RatingCalculationService);
  });

  describe('Deterministic Rounding and Precision', () => {
    it('should round numbers precisely to 2 decimal places with EPSILON protection', () => {
      expect(service.round(4.123)).toBe(4.12);
      expect(service.round(4.126)).toBe(4.13);
      expect(service.round(4.125)).toBe(4.13);
      expect(service.round(3.33333333333)).toBe(3.33);
      expect(service.round(1.005)).toBe(1.01);
      expect(service.round(0)).toBe(0);
    });
  });

  describe('calculateScores (Pure Calculation Engine)', () => {
    it('should calculate standard weighted score (70% goals, 30% competencies)', () => {
      const input: ScoreCalculationInput = {
        cycle: {
          goalsWeightPercentage: 70,
          competenciesWeightPercentage: 30,
          ratingScaleMax: 5,
          templateVersion: 2,
        },
        goals: [
          { id: 'g1', weight: 60, title: 'Revenue Growth', status: 'ACTIVE' },
          { id: 'g2', weight: 40, title: 'Operational Efficiency', status: 'ACTIVE' },
        ],
        competencies: [
          { id: 'c1', weight: 50, name: 'Collaboration' },
          { id: 'c2', weight: 50, name: 'Innovation' },
        ],
        items: [
          { goalId: 'g1', managerRating: 4.5 },
          { goalId: 'g2', managerRating: 3.5 },
          { competencyId: 'c1', managerRating: 5.0 },
          { competencyId: 'c2', managerRating: 4.0 },
        ],
      };

      // Goal 1: 4.5 * 60 = 270; Goal 2: 3.5 * 40 = 140 => (410 / 100) = 4.10
      // Comp 1: 5.0 * 50 = 250; Comp 2: 4.0 * 50 = 200 => (450 / 100) = 4.50
      // Overall: (4.10 * 70 + 4.50 * 30) / 100 = (287 + 135) / 100 = 422 / 100 = 4.22
      const result = service.calculateScores(input);

      expect(result.calculatedGoalsScore).toBe(4.1);
      expect(result.calculatedCompetenciesScore).toBe(4.5);
      expect(result.overallScore).toBe(4.22);
      expect(result.isNarrativeOnly).toBe(false);
      expect(result.policyVersion).toBe(2);
      expect(result.scoreExplanation).toContain('Goals: 4.1 (70%) + Competencies: 4.5 (30%)');
      expect(result.goalRatings).toHaveLength(2);
      expect(result.competencyRatings).toHaveLength(2);
      expect(result.excludedItems).toHaveLength(0);
    });

    it('should reject negative component weights or total weights exceeding 100%', () => {
      expect(() =>
        service.calculateScores({
          cycle: {
            goalsWeightPercentage: -10,
            competenciesWeightPercentage: 50,
            ratingScaleMax: 5,
          },
          goals: [],
          competencies: [],
          items: [],
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateScores({
          cycle: {
            goalsWeightPercentage: 70,
            competenciesWeightPercentage: 40, // 110% total
            ratingScaleMax: 5,
          },
          goals: [],
          competencies: [],
          items: [],
        }),
      ).toThrow(BadRequestException);
    });

    it('should defer numerical calculation when organizational policy is narrative-only (weights = 0)', () => {
      const input: ScoreCalculationInput = {
        cycle: {
          goalsWeightPercentage: 0,
          competenciesWeightPercentage: 0,
          ratingScaleMax: 5,
          templateVersion: 1,
        },
        goals: [{ id: 'g1', weight: 100, title: 'Target A' }],
        competencies: [{ id: 'c1', weight: 100, name: 'Skill B' }],
        items: [
          { goalId: 'g1', managerRating: 4.0 },
          { competencyId: 'c1', managerRating: 4.0 },
        ],
      };

      const result = service.calculateScores(input);

      expect(result.isNarrativeOnly).toBe(true);
      expect(result.overallScore).toBeNull();
      expect(result.calculatedGoalsScore).toBeNull();
      expect(result.calculatedCompetenciesScore).toBeNull();
      expect(result.scoreExplanation).toContain('Narrative assessment mode');
    });

    it('should reject ratings out of scale bounds [0, ratingScaleMax]', () => {
      const input: ScoreCalculationInput = {
        cycle: {
          goalsWeightPercentage: 100,
          competenciesWeightPercentage: 0,
          ratingScaleMax: 5,
        },
        goals: [{ id: 'g1', weight: 100, title: 'Target A' }],
        competencies: [],
        items: [{ goalId: 'g1', managerRating: 5.5 }],
      };

      expect(() => service.calculateScores(input)).toThrow(BadRequestException);
    });

    it('should exclude CANCELLED goals and re-normalize denominator over applicable goals', () => {
      const input: ScoreCalculationInput = {
        cycle: {
          goalsWeightPercentage: 100,
          competenciesWeightPercentage: 0,
          ratingScaleMax: 5,
        },
        goals: [
          { id: 'g1', weight: 50, title: 'Active Goal', status: 'ACTIVE' },
          { id: 'g2', weight: 50, title: 'Discontinued Objective', status: 'CANCELLED' },
        ],
        competencies: [],
        items: [
          { goalId: 'g1', managerRating: 4.0 },
          { goalId: 'g2', managerRating: 2.0 },
        ],
      };

      const result = service.calculateScores(input);

      // g2 cancelled => only g1 evaluated (weight 50 normalized to 100%)
      expect(result.calculatedGoalsScore).toBe(4.0);
      expect(result.overallScore).toBe(4.0);
      expect(result.excludedItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'GOAL',
            id: 'g2',
            reason: 'Goal cancelled',
          }),
        ]),
      );
    });

    it('should exclude items marked isNotApplicable and missing ratings from calculation', () => {
      const input: ScoreCalculationInput = {
        cycle: {
          goalsWeightPercentage: 50,
          competenciesWeightPercentage: 50,
          ratingScaleMax: 5,
        },
        goals: [
          { id: 'g1', weight: 60, title: 'Applicable Goal' },
          { id: 'g2', weight: 40, title: 'Non-applicable Goal' },
        ],
        competencies: [
          { id: 'c1', weight: 50, name: 'Applicable Comp' },
          { id: 'c2', weight: 50, name: 'Unrated Comp' },
        ],
        items: [
          { goalId: 'g1', managerRating: 4.0, isNotApplicable: false },
          { goalId: 'g2', managerRating: null, isNotApplicable: true },
          { competencyId: 'c1', managerRating: 3.5, isNotApplicable: false },
          { competencyId: 'c2', managerRating: null, isNotApplicable: false }, // missing rating
        ],
      };

      const result = service.calculateScores(input);

      // Goals: g1 is 4.0 (100% of applicable weight 60)
      expect(result.calculatedGoalsScore).toBe(4.0);
      // Competencies: c1 is 3.5 (100% of applicable weight 50)
      expect(result.calculatedCompetenciesScore).toBe(3.5);
      // Overall: (4.0 * 50 + 3.5 * 50) / 100 = 3.75
      expect(result.overallScore).toBe(3.75);

      expect(result.excludedItems).toHaveLength(2);
      expect(result.excludedItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'g2', reason: 'Marked not applicable by reviewer' }),
          expect.objectContaining({ id: 'c2', reason: 'Rating missing' }),
        ]),
      );
    });

    it('should return null overallScore when no criteria have applicable ratings', () => {
      const input: ScoreCalculationInput = {
        cycle: {
          goalsWeightPercentage: 60,
          competenciesWeightPercentage: 40,
          ratingScaleMax: 5,
        },
        goals: [{ id: 'g1', weight: 100, title: 'Goal 1' }],
        competencies: [{ id: 'c1', weight: 100, name: 'Comp 1' }],
        items: [
          { goalId: 'g1', isNotApplicable: true },
          { competencyId: 'c1', isNotApplicable: true },
        ],
      };

      const result = service.calculateScores(input);
      expect(result.overallScore).toBeNull();
      expect(result.scoreExplanation).toContain('No applicable ratings provided');
    });
  });

  describe('recalculateReview (Authorized Recalculation & Finalized Score Preservation)', () => {
    const baseReview = {
      id: 'rev-1',
      organizationId: 'org-1',
      employeeId: 'emp-sub-1',
      managerId: 'emp-mgr-1',
      status: 'MANAGER_REVIEW_SUBMITTED',
      calculatedGoalsScore: 3.0,
      calculatedCompetenciesScore: 3.0,
      overallScore: 3.0,
      scoreExplanation: 'Old explanation',
      calculationBreakdown: {},
      cycle: {
        id: 'cycle-1',
        goalsWeightPercentage: 60,
        competenciesWeightPercentage: 40,
        ratingScaleMax: 5,
        templateVersion: 2,
      },
      employee: mockTargetEmployee,
      items: [
        { goalId: 'g1', managerRating: 5.0, isNotApplicable: false },
        { competencyId: 'c1', managerRating: 4.0, isNotApplicable: false },
      ],
    };

    it('should throw NotFoundException if review does not exist or belongs to different org', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue(null);

      await expect(
        service.recalculateReview(mockHrUser, 'non-existent', {
          reason: 'Routine policy audit',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prohibit self-recalculation by an employee', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        employeeId: 'emp-sub-1',
      });

      await expect(
        service.recalculateReview(mockEmployeeUser, 'rev-1', {
          reason: 'Attempt self recalculation',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should strictly prohibit recalculation of FINALIZED reviews by non-HR managers', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'FINALIZED',
      });

      await expect(
        service.recalculateReview(mockManagerUser, 'rev-1', {
          reason: 'Manager trying to adjust finalized score',
          forceRecalculate: true,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject HR recalculation of FINALIZED reviews without explicit forceRecalculate confirmation', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'FINALIZED',
      });

      await expect(
        service.recalculateReview(mockHrUser, 'rev-1', {
          reason: 'HR audited calculation check without force flag',
          forceRecalculate: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully recalculate FINALIZED review when authorized by HR with forceRecalculate and auditable reason', async () => {
      prisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'FINALIZED',
      });

      prisma.performanceGoal.findMany.mockResolvedValue([
        { id: 'g1', weight: 100, title: 'Goal 1', status: 'ACTIVE' },
      ]);
      prisma.performanceCompetency.findMany.mockResolvedValue([
        { id: 'c1', weight: 100, name: 'Comp 1' },
      ]);
      prisma.performanceReview.update.mockResolvedValue({
        ...baseReview,
        status: 'FINALIZED',
        overallScore: 4.6,
      });

      const res = await service.recalculateReview(mockHrUser, 'rev-1', {
        reason: 'Authorized correction following formal grievance audit',
        forceRecalculate: true,
      });

      // Goal: 5.0 (60%), Comp: 4.0 (40%) => (3.0 + 1.6) = 4.6
      expect(res.reviewId).toBe('rev-1');
      expect(res.newOverallScore).toBe(4.6);
      expect(res.previousOverallScore).toBe(3.0);
      expect(res.isFinalized).toBe(true);
      expect(res.policyVersion).toBe(2);
      expect(res.breakdown.overallScore).toBe(4.6);

      // Verify update in DB
      expect(prisma.performanceReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rev-1' },
          data: expect.objectContaining({
            overallScore: 4.6,
          }),
        }),
      );

      // Verify immutable audit history was created
      expect(prisma.performanceReviewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewId: 'rev-1',
            action: 'REVIEW_SCORE_RECALCULATED',
            actorId: 'emp-hr-1',
          }),
        }),
      );

      // Verify audit service log
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PERFORMANCE_REVIEW_SCORE_RECALCULATED',
          entityId: 'rev-1',
        }),
      );
    });
  });
});
