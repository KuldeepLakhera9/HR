import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { RecalculateReviewScoreDto } from './dto/rating-calculation.dto';
import { CalculationBreakdownDto, RecalculateReviewResultDto } from '@hrms/types';

export interface ScoreCalculationInput {
  cycle: {
    goalsWeightPercentage: number;
    competenciesWeightPercentage: number;
    ratingScaleMax: number;
    templateVersion?: number;
  };
  goals: Array<{
    id: string;
    weight: number;
    title: string;
    status?: string;
  }>;
  competencies: Array<{
    id: string;
    weight: number;
    name: string;
  }>;
  items: Array<{
    goalId?: string | null;
    competencyId?: string | null;
    managerRating?: number | null;
    isNotApplicable?: boolean;
  }>;
}

@Injectable()
export class RatingCalculationService {
  private readonly logger = new Logger(RatingCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly hierarchy: HierarchyService,
  ) {}

  /**
   * Deterministic rounding to 2 decimal places with EPSILON protection
   */
  round(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  /**
   * Check if user is HR or ADMIN
   */
  private isHrOrAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes('ADMIN') || user.roles.includes('HR');
  }

  /**
   * Pure deterministic score calculation engine
   */
  calculateScores(input: ScoreCalculationInput): CalculationBreakdownDto {
    const { cycle, goals, competencies, items } = input;
    const policyVersion = cycle.templateVersion ?? 1;
    const ratingScaleMax = cycle.ratingScaleMax > 0 ? cycle.ratingScaleMax : 5;
    const goalsWeightPercentage = cycle.goalsWeightPercentage ?? 0;
    const competenciesWeightPercentage = cycle.competenciesWeightPercentage ?? 0;

    // 1. Validate cycle weights
    if (goalsWeightPercentage < 0 || competenciesWeightPercentage < 0) {
      throw new BadRequestException('Component weights must be non-negative.');
    }

    if (goalsWeightPercentage + competenciesWeightPercentage > 100.01) {
      throw new BadRequestException('Total cycle component weights cannot exceed 100%.');
    }

    const isNarrativeOnly = goalsWeightPercentage === 0 && competenciesWeightPercentage === 0;

    if (isNarrativeOnly) {
      return {
        policyVersion,
        ratingScaleMax,
        goalsWeightPercentage: 0,
        competenciesWeightPercentage: 0,
        calculatedGoalsScore: null,
        calculatedCompetenciesScore: null,
        overallScore: null,
        scoreExplanation:
          'Narrative assessment mode: numerical scoring is deferred by organizational policy.',
        isNarrativeOnly: true,
        totalApplicableGoalWeight: 0,
        totalApplicableCompetencyWeight: 0,
        goalRatings: [],
        competencyRatings: [],
        excludedItems: [],
        calculatedAt: new Date().toISOString(),
      };
    }

    const excludedItems: Array<{
      type: 'GOAL' | 'COMPETENCY';
      id: string;
      title: string;
      reason: string;
    }> = [];

    // 2. Compute Goal Scores
    let totalGoalWeight = 0;
    let weightedGoalSum = 0;
    const goalRatings: CalculationBreakdownDto['goalRatings'] = [];

    for (const g of goals) {
      // Exclude cancelled goals
      if (g.status === 'CANCELLED') {
        excludedItems.push({
          type: 'GOAL',
          id: g.id,
          title: g.title,
          reason: 'Goal cancelled',
        });
        continue;
      }

      const item = items.find((it) => it.goalId === g.id);

      // Exclude non-applicable items
      if (item?.isNotApplicable) {
        excludedItems.push({
          type: 'GOAL',
          id: g.id,
          title: g.title,
          reason: 'Marked not applicable by reviewer',
        });
        continue;
      }

      // Missing ratings
      if (!item || item.managerRating === null || item.managerRating === undefined) {
        excludedItems.push({
          type: 'GOAL',
          id: g.id,
          title: g.title,
          reason: 'Rating missing',
        });
        continue;
      }

      // Validate rating bounds
      if (item.managerRating < 0 || item.managerRating > ratingScaleMax) {
        throw new BadRequestException(
          `Rating for goal "${g.title}" (${item.managerRating}) is out of bounds [0, ${ratingScaleMax}].`,
        );
      }

      const weight = g.weight > 0 ? g.weight : 1.0;
      weightedGoalSum += item.managerRating * weight;
      totalGoalWeight += weight;

      goalRatings.push({
        goalId: g.id,
        title: g.title,
        weight,
        rating: item.managerRating,
        status: g.status || 'ACTIVE',
        isNotApplicable: false,
      });
    }

    // Normalize goal relative percentage breakdown
    if (totalGoalWeight > 0) {
      for (const gr of goalRatings) {
        gr.normalizedWeightPercentage = this.round((gr.weight / totalGoalWeight) * 100);
      }
    }

    const calculatedGoalsScore =
      totalGoalWeight > 0 ? this.round(weightedGoalSum / totalGoalWeight) : null;

    // 3. Compute Competency Scores
    let totalCompWeight = 0;
    let weightedCompSum = 0;
    const compRatings: CalculationBreakdownDto['competencyRatings'] = [];

    for (const c of competencies) {
      const item = items.find((it) => it.competencyId === c.id);

      // Exclude non-applicable items
      if (item?.isNotApplicable) {
        excludedItems.push({
          type: 'COMPETENCY',
          id: c.id,
          title: c.name,
          reason: 'Marked not applicable by reviewer',
        });
        continue;
      }

      // Missing ratings
      if (!item || item.managerRating === null || item.managerRating === undefined) {
        excludedItems.push({
          type: 'COMPETENCY',
          id: c.id,
          title: c.name,
          reason: 'Rating missing',
        });
        continue;
      }

      // Validate rating bounds
      if (item.managerRating < 0 || item.managerRating > ratingScaleMax) {
        throw new BadRequestException(
          `Rating for competency "${c.name}" (${item.managerRating}) is out of bounds [0, ${ratingScaleMax}].`,
        );
      }

      const weight = c.weight > 0 ? c.weight : 1.0;
      weightedCompSum += item.managerRating * weight;
      totalCompWeight += weight;

      compRatings.push({
        competencyId: c.id,
        name: c.name,
        weight,
        rating: item.managerRating,
        isNotApplicable: false,
      });
    }

    // Normalize competency relative percentage breakdown
    if (totalCompWeight > 0) {
      for (const cr of compRatings) {
        cr.normalizedWeightPercentage = this.round((cr.weight / totalCompWeight) * 100);
      }
    }

    const calculatedCompetenciesScore =
      totalCompWeight > 0 ? this.round(weightedCompSum / totalCompWeight) : null;

    // 4. Compute Overall Composite Score
    let overallScore: number | null = null;
    let scoreExplanation = '';

    if (calculatedGoalsScore !== null && calculatedCompetenciesScore !== null) {
      const compositeWeightTotal = goalsWeightPercentage + competenciesWeightPercentage;
      if (compositeWeightTotal > 0) {
        overallScore = this.round(
          (calculatedGoalsScore * goalsWeightPercentage +
            calculatedCompetenciesScore * competenciesWeightPercentage) /
            compositeWeightTotal,
        );
        scoreExplanation = `Goals: ${calculatedGoalsScore} (${goalsWeightPercentage}%) + Competencies: ${calculatedCompetenciesScore} (${competenciesWeightPercentage}%) = Overall: ${overallScore} / ${ratingScaleMax}`;
      } else {
        scoreExplanation = 'Zero component weights configured; numerical calculation deferred.';
      }
    } else if (calculatedGoalsScore !== null) {
      overallScore = calculatedGoalsScore;
      scoreExplanation = `Goals evaluated: ${calculatedGoalsScore} (100% of applicable evaluated components) = Overall: ${overallScore} / ${ratingScaleMax}`;
    } else if (calculatedCompetenciesScore !== null) {
      overallScore = calculatedCompetenciesScore;
      scoreExplanation = `Competencies evaluated: ${calculatedCompetenciesScore} (100% of applicable evaluated components) = Overall: ${overallScore} / ${ratingScaleMax}`;
    } else {
      overallScore = null;
      scoreExplanation = 'No applicable ratings provided; official score calculation deferred.';
    }

    return {
      policyVersion,
      ratingScaleMax,
      goalsWeightPercentage,
      competenciesWeightPercentage,
      calculatedGoalsScore,
      calculatedCompetenciesScore,
      overallScore,
      scoreExplanation,
      isNarrativeOnly: false,
      totalApplicableGoalWeight: totalGoalWeight,
      totalApplicableCompetencyWeight: totalCompWeight,
      goalRatings,
      competencyRatings: compRatings,
      excludedItems,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Recalculate and re-evaluate an existing review score with explicit audit trail
   */
  async recalculateReview(
    user: AuthenticatedUser,
    reviewId: string,
    dto: RecalculateReviewScoreDto,
  ): Promise<RecalculateReviewResultDto> {
    const callerEmp = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, displayName: true },
    });

    if (!callerEmp) {
      throw new NotFoundException('Caller employee record not found.');
    }

    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        cycle: true,
        employee: { select: { id: true, displayName: true, employeeCode: true } },
        items: true,
      },
    });

    if (!review || review.organizationId !== user.organizationId) {
      throw new NotFoundException('Performance review record not found.');
    }

    const isHrOrAdmin = this.isHrOrAdmin(user);

    // Finalized Score Preservation:
    // Once finalized, recalculation strictly requires HR/ADMIN and explicit forceRecalculate flag!
    if (review.status === 'FINALIZED') {
      if (!isHrOrAdmin) {
        throw new ForbiddenException(
          'Policy strictly prohibits modifying finalized performance review scores. Only authorized HR administrators can initiate an official recalculation.',
        );
      }
      if (!dto.forceRecalculate) {
        throw new BadRequestException(
          'Finalized review scores are locked. To recalculate, HR must provide explicit confirmation (forceRecalculate: true) and an auditable reason.',
        );
      }
    } else {
      // If not finalized, verify manager authority
      if (!isHrOrAdmin) {
        if (review.employeeId === callerEmp.id) {
          throw new ForbiddenException('Self-recalculation is prohibited.');
        }
        const teamIds = await this.hierarchy.getTeamMemberIds(callerEmp.id, user.organizationId);
        if (!teamIds.includes(review.employeeId) && review.managerId !== callerEmp.id) {
          throw new ForbiddenException(
            'You do not have supervisory authority to recalculate this review.',
          );
        }
      }
    }

    // Load active/approved goals and competencies
    const [goals, competencies] = await Promise.all([
      this.prisma.performanceGoal.findMany({
        where: {
          employeeId: review.employeeId,
          organizationId: user.organizationId,
          OR: [{ cycleId: review.cycleId }, { cycleId: null }],
        },
        select: { id: true, weight: true, title: true, status: true },
      }),
      this.prisma.performanceCompetency.findMany({
        where: { cycleId: review.cycleId },
        select: { id: true, weight: true, name: true },
      }),
    ]);

    const itemsInput = review.items.map((it) => ({
      goalId: it.goalId,
      competencyId: it.competencyId,
      managerRating: it.managerRating,
      isNotApplicable: it.isNotApplicable,
    }));

    // Authoritative calculation
    const breakdown = this.calculateScores({
      cycle: review.cycle,
      goals,
      competencies,
      items: itemsInput,
    });

    const previousOverall = review.overallScore;
    const previousGoals = review.calculatedGoalsScore;
    const previousComps = review.calculatedCompetenciesScore;

    // Persist new authoritative scores
    await this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: {
        calculatedGoalsScore: breakdown.calculatedGoalsScore,
        calculatedCompetenciesScore: breakdown.calculatedCompetenciesScore,
        overallScore: breakdown.overallScore,
        calculationBreakdown: breakdown as any,
        scoreExplanation: breakdown.scoreExplanation,
      },
    });

    // Record immutable audit history
    await this.prisma.performanceReviewHistory.create({
      data: {
        reviewId: review.id,
        actorId: callerEmp.id,
        action: 'REVIEW_SCORE_RECALCULATED',
        changeReason: dto.reason.trim(),
        previousState: {
          overallScore: previousOverall,
          calculatedGoalsScore: previousGoals,
          calculatedCompetenciesScore: previousComps,
          status: review.status,
        },
        newState: {
          overallScore: breakdown.overallScore,
          calculatedGoalsScore: breakdown.calculatedGoalsScore,
          calculatedCompetenciesScore: breakdown.calculatedCompetenciesScore,
          scoreExplanation: breakdown.scoreExplanation,
          recalculatedBy: callerEmp.displayName,
          forced: dto.forceRecalculate || false,
        },
      },
    });

    await this.audit.record({
      action: 'PERFORMANCE_REVIEW_SCORE_RECALCULATED',
      entity: 'PerformanceReview',
      entityId: review.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        employeeId: review.employeeId,
        previousOverall,
        newOverall: breakdown.overallScore,
        reason: dto.reason,
        forced: dto.forceRecalculate || false,
        isFinalized: review.status === 'FINALIZED',
      },
    });

    return {
      reviewId: review.id,
      previousOverallScore: previousOverall,
      newOverallScore: breakdown.overallScore,
      previousGoalsScore: previousGoals,
      newGoalsScore: breakdown.calculatedGoalsScore,
      previousCompetenciesScore: previousComps,
      newCompetenciesScore: breakdown.calculatedCompetenciesScore,
      scoreExplanation: breakdown.scoreExplanation,
      breakdown,
      policyVersion: breakdown.policyVersion,
      isFinalized: review.status === 'FINALIZED',
    };
  }
}
