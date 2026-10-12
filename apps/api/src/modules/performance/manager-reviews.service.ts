import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  SaveManagerReviewDraftDto,
  SubmitManagerReviewDto,
  ReturnReviewForCorrectionDto,
  FinalizeReviewDto,
  QueryManagerReviewsDto,
} from './dto/manager-review.dto';
import {
  ManagerReviewInboxItemDto,
  ManagerReviewDetailDto,
  PerformanceReviewStatus,
} from '@hrms/types';

@Injectable()
export class ManagerReviewsService {
  private readonly logger = new Logger(ManagerReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly hierarchy: HierarchyService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Helper: Resolve active employee for authenticated user
   */
  async getEmployeeForUser(userId: string, organizationId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId, deletedAt: null },
      select: {
        id: true,
        employeeCode: true,
        displayName: true,
        organizationId: true,
        managerId: true,
        status: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Active employee profile not found for this user account');
    }

    return employee;
  }

  /**
   * Helper: Check if caller is HR or ADMIN
   */
  private isHrOrAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes('ADMIN') || user.roles.includes('HR');
  }

  /**
   * Helper: Resolve all authorized employee IDs in manager's scope
   */
  async getAuthorizedEmployeeIds(user: AuthenticatedUser, managerId: string): Promise<Set<string>> {
    const employeeIds = new Set<string>();

    if (this.isHrOrAdmin(user)) {
      const allEmployees = await this.prisma.employee.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true },
      });
      for (const e of allEmployees) {
        employeeIds.add(e.id);
      }
      return employeeIds;
    }

    // 1. Reporting hierarchy (direct & indirect reports)
    try {
      const memberIds = await this.hierarchy.getTeamMemberIds(managerId, user.organizationId);
      if (memberIds) {
        for (const id of memberIds) {
          employeeIds.add(id);
        }
      }
    } catch (err: any) {
      this.logger.debug(`Could not resolve hierarchy team members: ${err.message}`);
    }

    // 2. Explicit review cycle participant assignment
    const participants = await this.prisma.reviewCycleParticipant.findMany({
      where: {
        managerId,
        cycle: { organizationId: user.organizationId },
      },
      select: { employeeId: true },
    });
    for (const p of participants) {
      employeeIds.add(p.employeeId);
    }

    // 3. Direct manager on performance reviews
    const reviews = await this.prisma.performanceReview.findMany({
      where: {
        managerId,
        organizationId: user.organizationId,
      },
      select: { employeeId: true },
    });
    for (const r of reviews) {
      employeeIds.add(r.employeeId);
    }

    // Self-review prohibition: manager can never evaluate themselves
    employeeIds.delete(managerId);

    return employeeIds;
  }

  /**
   * Helper: Compute deterministic review scores and auditable explanation
   */
  private computeReviewScores(
    cycle: {
      goalsWeightPercentage: number;
      competenciesWeightPercentage: number;
      ratingScaleMax: number;
    },
    goals: Array<{ id: string; weight: number; title: string }>,
    competencies: Array<{ id: string; weight: number; name: string }>,
    items: Array<{
      goalId?: string | null;
      competencyId?: string | null;
      managerRating?: number | null;
      isNotApplicable?: boolean;
    }>,
  ) {
    // 1. Goal ratings weighted average
    let totalGoalWeight = 0;
    let weightedGoalScore = 0;
    const goalBreakdown: any[] = [];

    for (const g of goals) {
      const item = items.find((it) => it.goalId === g.id);
      if (
        item &&
        item.managerRating !== null &&
        item.managerRating !== undefined &&
        !item.isNotApplicable
      ) {
        const w = g.weight > 0 ? g.weight : 1;
        weightedGoalScore += item.managerRating * w;
        totalGoalWeight += w;
        goalBreakdown.push({
          goalId: g.id,
          title: g.title,
          weight: w,
          rating: item.managerRating,
        });
      }
    }

    const calculatedGoalsScore =
      totalGoalWeight > 0 ? Number((weightedGoalScore / totalGoalWeight).toFixed(2)) : null;

    // 2. Competencies weighted average
    let totalCompWeight = 0;
    let weightedCompScore = 0;
    const compBreakdown: any[] = [];

    for (const c of competencies) {
      const item = items.find((it) => it.competencyId === c.id);
      if (
        item &&
        item.managerRating !== null &&
        item.managerRating !== undefined &&
        !item.isNotApplicable
      ) {
        const w = c.weight > 0 ? c.weight : 1;
        weightedCompScore += item.managerRating * w;
        totalCompWeight += w;
        compBreakdown.push({
          competencyId: c.id,
          name: c.name,
          weight: w,
          rating: item.managerRating,
        });
      }
    }

    const calculatedCompetenciesScore =
      totalCompWeight > 0 ? Number((weightedCompScore / totalCompWeight).toFixed(2)) : null;

    // 3. Overall composite score
    let overallScore: number | null = null;
    const goalsWeightPct = cycle.goalsWeightPercentage;
    const compsWeightPct = cycle.competenciesWeightPercentage;

    if (calculatedGoalsScore !== null && calculatedCompetenciesScore !== null) {
      const totalWeights = goalsWeightPct + compsWeightPct;
      if (totalWeights > 0) {
        overallScore = Number(
          (
            (calculatedGoalsScore * goalsWeightPct + calculatedCompetenciesScore * compsWeightPct) /
            totalWeights
          ).toFixed(2),
        );
      }
    } else if (calculatedGoalsScore !== null) {
      overallScore = calculatedGoalsScore;
    } else if (calculatedCompetenciesScore !== null) {
      overallScore = calculatedCompetenciesScore;
    }

    const scoreExplanation =
      overallScore !== null
        ? `Goals: ${calculatedGoalsScore ?? 'N/A'} (${goalsWeightPct}%) + Competencies: ${calculatedCompetenciesScore ?? 'N/A'} (${compsWeightPct}%) = Overall: ${overallScore} / ${cycle.ratingScaleMax}`
        : 'Incomplete ratings; overall score pending completion.';

    const calculationBreakdown = {
      goalsWeightPercentage: goalsWeightPct,
      competenciesWeightPercentage: compsWeightPct,
      goalsScore: calculatedGoalsScore,
      competenciesScore: calculatedCompetenciesScore,
      overallScore,
      goalRatings: goalBreakdown,
      competencyRatings: compBreakdown,
      calculatedAt: new Date().toISOString(),
    };

    return {
      calculatedGoalsScore,
      calculatedCompetenciesScore,
      overallScore,
      scoreExplanation,
      calculationBreakdown,
    };
  }

  /**
   * 1. Get Manager Review Inbox (scoped to manager's authorized direct/indirect reports)
   */
  async getManagerInbox(
    user: AuthenticatedUser,
    query: QueryManagerReviewsDto,
  ): Promise<{
    items: ManagerReviewInboxItemDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
    counts: {
      all: number;
      pendingReview: number;
      submitted: number;
      finalized: number;
      overdue: number;
    };
  }> {
    const manager = await this.getEmployeeForUser(user.id, user.organizationId);
    const authorizedEmployeeIds = await this.getAuthorizedEmployeeIds(user, manager.id);

    if (authorizedEmployeeIds.size === 0) {
      return {
        items: [],
        meta: { total: 0, page: query.page || 1, limit: query.limit || 20, totalPages: 0 },
        counts: { all: 0, pendingReview: 0, submitted: 0, finalized: 0, overdue: 0 },
      };
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PerformanceReviewWhereInput = {
      organizationId: user.organizationId,
      employeeId: {
        in: Array.from(authorizedEmployeeIds),
        not: manager.id, // Strictly prohibit self-review in manager inbox
      },
    };

    if (query.cycleId) {
      where.cycleId = query.cycleId;
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as PerformanceReviewStatus;
    }

    if (query.search) {
      where.employee = {
        OR: [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { employeeCode: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [reviews, totalCount, allReviewsForCounts] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where,
        include: {
          cycle: {
            select: {
              id: true,
              name: true,
              code: true,
              status: true,
              managerReviewDeadline: true,
            },
          },
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
              profilePhoto: true,
              employment: {
                select: {
                  department: { select: { name: true } },
                  designation: { select: { title: true } },
                },
              },
            },
          },
          items: {
            select: { id: true, goalId: true, competencyId: true },
          },
        },
        orderBy: [{ cycle: { startDate: 'desc' } }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.performanceReview.count({ where }),
      this.prisma.performanceReview.findMany({
        where: {
          organizationId: user.organizationId,
          employeeId: {
            in: Array.from(authorizedEmployeeIds),
            not: manager.id,
          },
          ...(query.cycleId ? { cycleId: query.cycleId } : {}),
        },
        select: {
          status: true,
          cycle: { select: { managerReviewDeadline: true } },
        },
      }),
    ]);

    const now = new Date();
    let pendingReview = 0;
    let submitted = 0;
    let finalized = 0;
    let overdue = 0;

    for (const r of allReviewsForCounts) {
      if (r.status === 'SELF_ASSESSMENT_SUBMITTED' || r.status === 'MANAGER_REVIEW_DRAFT') {
        pendingReview++;
      } else if (r.status === 'MANAGER_REVIEW_SUBMITTED' || r.status === 'HR_CALIBRATION') {
        submitted++;
      } else if (r.status === 'FINALIZED') {
        finalized++;
      }

      if (
        r.cycle.managerReviewDeadline &&
        now > new Date(r.cycle.managerReviewDeadline) &&
        r.status !== 'FINALIZED'
      ) {
        overdue++;
      }
    }

    const items: ManagerReviewInboxItemDto[] = reviews.map((r) => {
      const isOverdue = r.cycle.managerReviewDeadline
        ? now > new Date(r.cycle.managerReviewDeadline) && r.status !== 'FINALIZED'
        : false;

      const goalsCount = r.items.filter((it) => !!it.goalId).length;
      const competenciesCount = r.items.filter((it) => !!it.competencyId).length;

      return {
        id: r.id,
        cycleId: r.cycle.id,
        cycleName: r.cycle.name,
        cycleCode: r.cycle.code,
        cycleStatus: r.cycle.status,
        employeeId: r.employee.id,
        employeeCode: r.employee.employeeCode,
        employeeName: r.employee.displayName,
        employeePhoto: r.employee.profilePhoto,
        departmentName: r.employee.employment?.department?.name,
        designationTitle: r.employee.employment?.designation?.title,
        status: r.status,
        selfSubmittedAt: r.selfSubmittedAt?.toISOString() || null,
        managerSubmittedAt: r.managerSubmittedAt?.toISOString() || null,
        managerReviewDeadline: r.cycle.managerReviewDeadline?.toISOString() || null,
        isOverdue,
        overallScore: r.overallScore,
        goalsCount,
        competenciesCount,
      };
    });

    return {
      items,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      counts: {
        all: allReviewsForCounts.length,
        pendingReview,
        submitted,
        finalized,
        overdue,
      },
    };
  }

  /**
   * 2. Get Performance Review Details for Manager (Strict Scope & Confidentiality Filtering)
   */
  async getReviewDetail(
    user: AuthenticatedUser,
    reviewId: string,
  ): Promise<ManagerReviewDetailDto> {
    const manager = await this.getEmployeeForUser(user.id, user.organizationId);

    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        cycle: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            displayName: true,
            profilePhoto: true,
            employment: {
              select: {
                department: { select: { id: true, name: true } },
                designation: { select: { id: true, title: true } },
                branch: { select: { id: true, name: true } },
              },
            },
          },
        },
        manager: {
          select: { id: true, employeeCode: true, displayName: true },
        },
        participant: true,
        items: {
          include: {
            goal: true,
            competency: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        feedbackNotes: {
          include: {
            author: { select: { id: true, displayName: true, employeeCode: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        developmentPlans: {
          orderBy: { createdAt: 'asc' },
        },
        history: {
          include: {
            actor: { select: { id: true, displayName: true, employeeCode: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!review || review.organizationId !== user.organizationId) {
      throw new NotFoundException('Performance review record not found');
    }

    // Self-review prohibition: manager cannot review themselves
    if (review.employeeId === manager.id && !this.isHrOrAdmin(user)) {
      throw new ForbiddenException(
        'Policy strictly prohibits self-evaluation in the Manager portal.',
      );
    }

    // Manager Scope Authorization
    if (!this.isHrOrAdmin(user)) {
      const authorizedEmployeeIds = await this.getAuthorizedEmployeeIds(user, manager.id);
      if (!authorizedEmployeeIds.has(review.employeeId)) {
        throw new ForbiddenException(
          'You are not authorized to evaluate this employee. They are outside your managerial reporting scope.',
        );
      }
    }

    // Confidential Notes Protection:
    // HR can view all notes. Managers can view EMPLOYEE_VISIBLE and MANAGER_ONLY. HR_CONFIDENTIAL is protected.
    const filteredFeedback = review.feedbackNotes.filter((note) => {
      if (this.isHrOrAdmin(user)) return true;
      return note.visibility !== 'HR_CONFIDENTIAL';
    });

    const now = new Date();
    const isDeadlinePassed = review.cycle.managerReviewDeadline
      ? now > new Date(review.cycle.managerReviewDeadline)
      : false;

    const isCycleArchived = review.cycle.status === 'ARCHIVED';

    const canEdit =
      !isCycleArchived &&
      (review.status === 'SELF_ASSESSMENT_SUBMITTED' || review.status === 'MANAGER_REVIEW_DRAFT');

    const canSubmit = canEdit;

    const canReturn = canEdit;

    const canFinalize =
      !isCycleArchived &&
      (review.status === 'MANAGER_REVIEW_SUBMITTED' || review.status === 'HR_CALIBRATION');

    return {
      review: {
        ...review,
        feedbackNotes: filteredFeedback,
      } as any,
      developmentPlans: review.developmentPlans as any,
      feedbackNotes: filteredFeedback as any,
      canEdit,
      canSubmit,
      canReturn,
      canFinalize,
      isDeadlinePassed,
      ratingScaleMax: review.cycle.ratingScaleMax,
      scoreBreakdown: review.calculationBreakdown,
    };
  }

  /**
   * 3. Save Manager Review Draft
   */
  async saveDraft(
    user: AuthenticatedUser,
    reviewId: string,
    dto: SaveManagerReviewDraftDto,
  ): Promise<ManagerReviewDetailDto> {
    const manager = await this.getEmployeeForUser(user.id, user.organizationId);

    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        cycle: true,
        items: true,
      },
    });

    if (!review || review.organizationId !== user.organizationId) {
      throw new NotFoundException('Performance review record not found');
    }

    if (review.employeeId === manager.id && !this.isHrOrAdmin(user)) {
      throw new ForbiddenException('Policy forbids evaluating your own performance.');
    }

    if (!this.isHrOrAdmin(user)) {
      const authorizedEmployeeIds = await this.getAuthorizedEmployeeIds(user, manager.id);
      if (!authorizedEmployeeIds.has(review.employeeId)) {
        throw new ForbiddenException('You are not authorized to evaluate this employee.');
      }
    }

    if (review.cycle.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot edit review: the review cycle has been closed.');
    }

    if (review.status === 'FINALIZED') {
      throw new BadRequestException('Cannot edit a review that has already been finalized.');
    }

    // Load goals and competencies for deterministic score computation
    const [goals, competencies] = await Promise.all([
      this.prisma.performanceGoal.findMany({
        where: {
          employeeId: review.employeeId,
          organizationId: user.organizationId,
          OR: [{ cycleId: review.cycleId }, { cycleId: null }],
        },
        select: { id: true, weight: true, title: true },
      }),
      this.prisma.performanceCompetency.findMany({
        where: { cycleId: review.cycleId },
        select: { id: true, weight: true, name: true },
      }),
    ]);

    // Compute updated scores
    const mergedItems = (dto.items || []).map((it) => ({
      goalId: it.goalId,
      competencyId: it.competencyId,
      managerRating: it.managerRating,
      isNotApplicable: it.isNotApplicable,
    }));

    const scores = this.computeReviewScores(review.cycle, goals, competencies, mergedItems);

    await this.prisma.$transaction(async (tx) => {
      // 1. Update review header
      await tx.performanceReview.update({
        where: { id: reviewId },
        data: {
          status: 'MANAGER_REVIEW_DRAFT',
          managerId: manager.id,
          managerSummary: dto.managerSummary !== undefined ? dto.managerSummary : undefined,
          managerStrengths: dto.managerStrengths !== undefined ? dto.managerStrengths : undefined,
          managerImprovements:
            dto.managerImprovements !== undefined ? dto.managerImprovements : undefined,
          calculatedGoalsScore: scores.calculatedGoalsScore,
          calculatedCompetenciesScore: scores.calculatedCompetenciesScore,
          overallScore: scores.overallScore,
          calculationBreakdown: scores.calculationBreakdown,
          scoreExplanation: scores.scoreExplanation,
        },
      });

      // 2. Synchronize items
      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          if (item.goalId) {
            const existingItem = await tx.performanceReviewItem.findFirst({
              where: { reviewId, goalId: item.goalId },
            });
            if (existingItem) {
              await tx.performanceReviewItem.update({
                where: { id: existingItem.id },
                data: {
                  managerRating: item.managerRating,
                  managerComments: item.managerComments,
                  isNotApplicable: item.isNotApplicable ?? existingItem.isNotApplicable,
                },
              });
            } else {
              await tx.performanceReviewItem.create({
                data: {
                  reviewId,
                  goalId: item.goalId,
                  managerRating: item.managerRating,
                  managerComments: item.managerComments,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            }
          } else if (item.competencyId) {
            const existingItem = await tx.performanceReviewItem.findFirst({
              where: { reviewId, competencyId: item.competencyId },
            });
            if (existingItem) {
              await tx.performanceReviewItem.update({
                where: { id: existingItem.id },
                data: {
                  managerRating: item.managerRating,
                  managerComments: item.managerComments,
                  isNotApplicable: item.isNotApplicable ?? existingItem.isNotApplicable,
                },
              });
            } else {
              await tx.performanceReviewItem.create({
                data: {
                  reviewId,
                  competencyId: item.competencyId,
                  managerRating: item.managerRating,
                  managerComments: item.managerComments,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            }
          }
        }
      }

      // 3. Upsert development recommendations
      if (dto.developmentPlans && dto.developmentPlans.length > 0) {
        for (const plan of dto.developmentPlans) {
          await tx.developmentPlan.create({
            data: {
              reviewId,
              employeeId: review.employeeId,
              objective: plan.objective.trim(),
              actionSteps: plan.actionSteps.trim(),
              targetDate: plan.targetDate ? new Date(plan.targetDate) : null,
              trainingNeeds: plan.trainingNeeds?.trim() || null,
              responsiblePerson: plan.responsiblePerson?.trim() || manager.displayName,
            },
          });
        }
      }

      // 4. Record audit history
      await tx.performanceReviewHistory.create({
        data: {
          reviewId,
          actorId: manager.id,
          action: 'MANAGER_REVIEW_DRAFT_SAVED',
          changeReason: 'Draft evaluation autosaved by manager',
          previousState: {
            status: review.status,
            overallScore: review.overallScore,
          },
          newState: {
            status: 'MANAGER_REVIEW_DRAFT',
            overallScore: scores.overallScore,
            itemsUpdated: dto.items?.length || 0,
          },
        },
      });
    });

    return this.getReviewDetail(user, reviewId);
  }

  /**
   * 4. Submit Manager Review (Formal Completion)
   */
  async submitReview(
    user: AuthenticatedUser,
    reviewId: string,
    dto: SubmitManagerReviewDto,
  ): Promise<ManagerReviewDetailDto> {
    const manager = await this.getEmployeeForUser(user.id, user.organizationId);

    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        cycle: true,
        items: true,
        employee: { select: { id: true, displayName: true, userId: true } },
      },
    });

    if (!review || review.organizationId !== user.organizationId) {
      throw new NotFoundException('Performance review record not found');
    }

    if (review.employeeId === manager.id && !this.isHrOrAdmin(user)) {
      throw new ForbiddenException('Policy strictly prohibits evaluating your own performance.');
    }

    if (!this.isHrOrAdmin(user)) {
      const authorizedEmployeeIds = await this.getAuthorizedEmployeeIds(user, manager.id);
      if (!authorizedEmployeeIds.has(review.employeeId)) {
        throw new ForbiddenException('You are not authorized to evaluate this employee.');
      }
    }

    if (review.cycle.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot submit review: the review cycle has closed.');
    }

    if (review.status === 'MANAGER_REVIEW_SUBMITTED' || review.status === 'FINALIZED') {
      throw new BadRequestException('Duplicate submission: review has already been submitted.');
    }

    // Required narrative section validations
    if (!dto.managerSummary || dto.managerSummary.trim().length < 10) {
      throw new BadRequestException(
        'Manager executive summary is required and must contain at least 10 characters',
      );
    }
    if (!dto.managerStrengths || dto.managerStrengths.trim().length < 10) {
      throw new BadRequestException(
        'Key employee strengths are required and must contain at least 10 characters',
      );
    }
    if (!dto.managerImprovements || dto.managerImprovements.trim().length < 10) {
      throw new BadRequestException(
        'Improvement areas & growth feedback are required and must contain at least 10 characters',
      );
    }

    // Scale bounds validation
    if (dto.items && dto.items.length > 0) {
      for (const it of dto.items) {
        if (!it.isNotApplicable) {
          if (it.managerRating < 1 || it.managerRating > review.cycle.ratingScaleMax) {
            throw new BadRequestException(
              `Rating ${it.managerRating} is outside permitted bounds (1 to ${review.cycle.ratingScaleMax})`,
            );
          }
        }
      }
    }

    // Load goals and competencies for authoritative score computation
    const [goals, competencies] = await Promise.all([
      this.prisma.performanceGoal.findMany({
        where: {
          employeeId: review.employeeId,
          organizationId: user.organizationId,
          OR: [{ cycleId: review.cycleId }, { cycleId: null }],
        },
        select: { id: true, weight: true, title: true },
      }),
      this.prisma.performanceCompetency.findMany({
        where: { cycleId: review.cycleId },
        select: { id: true, weight: true, name: true },
      }),
    ]);

    const mergedItems = (dto.items || []).map((it) => ({
      goalId: it.goalId,
      competencyId: it.competencyId,
      managerRating: it.managerRating,
      isNotApplicable: it.isNotApplicable,
    }));

    const scores = this.computeReviewScores(review.cycle, goals, competencies, mergedItems);

    await this.prisma.$transaction(async (tx) => {
      // 1. Update review header
      await tx.performanceReview.update({
        where: { id: reviewId },
        data: {
          status: 'MANAGER_REVIEW_SUBMITTED',
          managerId: manager.id,
          managerSummary: dto.managerSummary.trim(),
          managerStrengths: dto.managerStrengths.trim(),
          managerImprovements: dto.managerImprovements.trim(),
          managerSubmittedAt: new Date(),
          calculatedGoalsScore: scores.calculatedGoalsScore,
          calculatedCompetenciesScore: scores.calculatedCompetenciesScore,
          overallScore: scores.overallScore,
          calculationBreakdown: scores.calculationBreakdown,
          scoreExplanation: scores.scoreExplanation,
        },
      });

      // 2. Synchronize review items
      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          if (item.goalId) {
            const existingItem = await tx.performanceReviewItem.findFirst({
              where: { reviewId, goalId: item.goalId },
            });
            if (existingItem) {
              await tx.performanceReviewItem.update({
                where: { id: existingItem.id },
                data: {
                  managerRating: item.managerRating,
                  managerComments: item.managerComments?.trim() || null,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            } else {
              await tx.performanceReviewItem.create({
                data: {
                  reviewId,
                  goalId: item.goalId,
                  managerRating: item.managerRating,
                  managerComments: item.managerComments?.trim() || null,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            }
          } else if (item.competencyId) {
            const existingItem = await tx.performanceReviewItem.findFirst({
              where: { reviewId, competencyId: item.competencyId },
            });
            if (existingItem) {
              await tx.performanceReviewItem.update({
                where: { id: existingItem.id },
                data: {
                  managerRating: item.managerRating,
                  managerComments: item.managerComments?.trim() || null,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            } else {
              await tx.performanceReviewItem.create({
                data: {
                  reviewId,
                  competencyId: item.competencyId,
                  managerRating: item.managerRating,
                  managerComments: item.managerComments?.trim() || null,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            }
          }
        }
      }

      // 3. Upsert development plans
      if (dto.developmentPlans && dto.developmentPlans.length > 0) {
        for (const plan of dto.developmentPlans) {
          await tx.developmentPlan.create({
            data: {
              reviewId,
              employeeId: review.employeeId,
              objective: plan.objective.trim(),
              actionSteps: plan.actionSteps.trim(),
              targetDate: plan.targetDate ? new Date(plan.targetDate) : null,
              trainingNeeds: plan.trainingNeeds?.trim() || null,
              responsiblePerson: plan.responsiblePerson?.trim() || manager.displayName,
            },
          });
        }
      }

      // 4. Save feedback notes if provided
      if (dto.feedbackNotes && dto.feedbackNotes.length > 0) {
        for (const note of dto.feedbackNotes) {
          await tx.performanceFeedback.create({
            data: {
              reviewId,
              authorId: manager.id,
              title: note.title.trim(),
              content: note.content.trim(),
              visibility: note.visibility || 'EMPLOYEE_VISIBLE',
            },
          });
        }
      }

      // 5. Record audit history
      await tx.performanceReviewHistory.create({
        data: {
          reviewId,
          actorId: manager.id,
          action: 'MANAGER_REVIEW_SUBMITTED',
          changeReason: 'Manager review formally completed and submitted for calibration',
          previousState: {
            status: review.status,
            overallScore: review.overallScore,
          },
          newState: {
            status: 'MANAGER_REVIEW_SUBMITTED',
            overallScore: scores.overallScore,
            submittedAt: new Date().toISOString(),
          },
        },
      });
    });

    // Record immutable system audit
    await this.audit.record({
      action: 'MANAGER_REVIEW_SUBMITTED',
      entity: 'PerformanceReview',
      entityId: reviewId,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        employeeId: review.employeeId,
        managerId: manager.id,
        overallScore: scores.overallScore,
      },
    });

    // Notify employee that manager review has been submitted
    if (review.employee.userId) {
      try {
        await this.notifications.createNotification({
          userId: review.employee.userId,
          organizationId: user.organizationId,
          title: 'Manager Review Completed',
          message: `${manager.displayName} has submitted your performance review for ${review.cycle.name}.`,
          type: 'INFO',
          link: `/progress?tab=self-assessment&cycleId=${review.cycleId}`,
        });
      } catch (err: any) {
        this.logger.warn(`Could not dispatch notification: ${err.message}`);
      }
    }

    return this.getReviewDetail(user, reviewId);
  }

  /**
   * 5. Return Review for Correction (Send back to Employee with mandatory reason)
   */
  async returnForCorrection(
    user: AuthenticatedUser,
    reviewId: string,
    dto: ReturnReviewForCorrectionDto,
  ): Promise<ManagerReviewDetailDto> {
    const manager = await this.getEmployeeForUser(user.id, user.organizationId);

    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        cycle: true,
        employee: { select: { id: true, displayName: true, userId: true } },
      },
    });

    if (!review || review.organizationId !== user.organizationId) {
      throw new NotFoundException('Performance review record not found');
    }

    if (review.employeeId === manager.id && !this.isHrOrAdmin(user)) {
      throw new ForbiddenException('Policy forbids managing your own performance review.');
    }

    if (!this.isHrOrAdmin(user)) {
      const authorizedEmployeeIds = await this.getAuthorizedEmployeeIds(user, manager.id);
      if (!authorizedEmployeeIds.has(review.employeeId)) {
        throw new ForbiddenException('You are not authorized to return this review.');
      }
    }

    if (review.status !== 'SELF_ASSESSMENT_SUBMITTED' && review.status !== 'MANAGER_REVIEW_DRAFT') {
      throw new BadRequestException(
        `Cannot return review in status ${review.status}. Only pending reviews can be returned to employee.`,
      );
    }

    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException(
        'A mandatory explanation is required when returning review for revision (min 5 chars)',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.performanceReview.update({
        where: { id: reviewId },
        data: {
          status: 'REOPENED',
          reopenReason: dto.reason.trim(),
          reopenedAt: new Date(),
          reopenedById: manager.id,
        },
      });

      await tx.performanceReviewHistory.create({
        data: {
          reviewId,
          actorId: manager.id,
          action: 'RETURNED_FOR_CORRECTION',
          changeReason: dto.reason.trim(),
          previousState: {
            status: review.status,
            selfSubmittedAt: review.selfSubmittedAt,
          },
          newState: {
            status: 'REOPENED',
            reopenedAt: new Date().toISOString(),
            returnedBy: manager.displayName,
          },
        },
      });
    });

    await this.audit.record({
      action: 'REVIEW_RETURNED_FOR_CORRECTION',
      entity: 'PerformanceReview',
      entityId: reviewId,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        employeeId: review.employeeId,
        managerId: manager.id,
        reason: dto.reason,
      },
    });

    // Notify employee that review was returned with feedback
    if (review.employee.userId) {
      try {
        await this.notifications.createNotification({
          userId: review.employee.userId,
          organizationId: user.organizationId,
          title: 'Self-Assessment Returned for Revision',
          message: `${manager.displayName} requested revisions on your self-assessment. Reason: ${dto.reason}`,
          type: 'WARNING',
          link: `/progress?tab=self-assessment&cycleId=${review.cycleId}`,
        });
      } catch (err: any) {
        this.logger.warn(`Could not dispatch notification: ${err.message}`);
      }
    }

    return this.getReviewDetail(user, reviewId);
  }

  /**
   * 6. Finalize Review (Atomic finalization preventing concurrent overrides)
   */
  async finalizeReview(
    user: AuthenticatedUser,
    reviewId: string,
    dto: FinalizeReviewDto,
  ): Promise<ManagerReviewDetailDto> {
    const manager = await this.getEmployeeForUser(user.id, user.organizationId);

    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        cycle: true,
        employee: { select: { id: true, displayName: true, userId: true } },
      },
    });

    if (!review || review.organizationId !== user.organizationId) {
      throw new NotFoundException('Performance review record not found');
    }

    if (review.employeeId === manager.id && !this.isHrOrAdmin(user)) {
      throw new ForbiddenException('Policy forbids self-review finalization.');
    }

    if (!this.isHrOrAdmin(user)) {
      const authorizedEmployeeIds = await this.getAuthorizedEmployeeIds(user, manager.id);
      if (!authorizedEmployeeIds.has(review.employeeId)) {
        throw new ForbiddenException('You are not authorized to finalize this review.');
      }
    }

    // Atomic update preventing duplicate / concurrent finalization
    const updateResult = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.performanceReview.updateMany({
        where: {
          id: reviewId,
          status: { in: ['MANAGER_REVIEW_SUBMITTED', 'HR_CALIBRATION'] },
        },
        data: {
          status: 'FINALIZED',
          finalizedById: manager.id,
          finalizedAt: new Date(),
        },
      });

      if (updateResultCount(updated) === 0) {
        throw new BadRequestException(
          'Cannot finalize: review is not in a submittable state or has already been concurrently finalized.',
        );
      }

      await tx.performanceReviewHistory.create({
        data: {
          reviewId,
          actorId: manager.id,
          action: 'REVIEW_FINALIZED',
          changeReason:
            dto.finalComments?.trim() || 'Review officially finalized and closed for feedback',
          previousState: {
            status: review.status,
            overallScore: review.overallScore,
          },
          newState: {
            status: 'FINALIZED',
            finalizedAt: new Date().toISOString(),
            finalizedById: manager.id,
          },
        },
      });

      return updated;
    });

    await this.audit.record({
      action: 'REVIEW_FINALIZED',
      entity: 'PerformanceReview',
      entityId: reviewId,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        employeeId: review.employeeId,
        finalizedById: manager.id,
        overallScore: review.overallScore,
      },
    });

    // Notify employee that final review is ready
    if (review.employee.userId) {
      try {
        await this.notifications.createNotification({
          userId: review.employee.userId,
          organizationId: user.organizationId,
          title: 'Performance Review Finalized',
          message: `Your performance review for ${review.cycle.name} has been officially finalized. Overall score: ${review.overallScore ?? 'Evaluated'}.`,
          type: 'INFO',
          link: `/progress?tab=self-assessment&cycleId=${review.cycleId}`,
        });
      } catch (err: any) {
        this.logger.warn(`Could not dispatch notification: ${err.message}`);
      }
    }

    return this.getReviewDetail(user, reviewId);
  }
}

function updateResultCount(result: any): number {
  return result?.count ?? (result ? 1 : 0);
}
