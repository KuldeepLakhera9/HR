import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { PerformanceAnalyticsQueryDto } from '../dto/performance-analytics-query.dto';
import {
  PerformanceAnalyticsOverviewDto,
  GoalProgressAnalyticsDto,
  DevelopmentPlanAnalyticsDto,
} from '@hrms/types';

@Injectable()
export class PerformanceAnalyticsService {
  private readonly logger = new Logger(PerformanceAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
  ) {}

  /**
   * Helper: Round number to 2 decimal places deterministically
   */
  private round(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  /**
   * Authoritative RBAC & Scope Resolution:
   * - ADMIN / HR: Organization-wide access
   * - MANAGER: Downline team hierarchy scoped
   * - EMPLOYEE: Blocked with ForbiddenException
   */
  async resolveScopedEmployeeIds(
    user: AuthenticatedUser,
  ): Promise<{ scopedEmployeeIds: string[] | null; scopeType: 'ORGANIZATION' | 'TEAM' }> {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    const isManager = user.roles.includes('MANAGER');

    if (!isAdminOrHr && !isManager) {
      throw new ForbiddenException(
        'Employees do not have permission to access performance management analytics',
      );
    }

    if (isAdminOrHr) {
      return { scopedEmployeeIds: null, scopeType: 'ORGANIZATION' };
    }

    // Resolve Manager's Downline Team Hierarchy
    const managerEmp = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!managerEmp) {
      throw new ForbiddenException('Manager employee profile not found');
    }

    const teamIds = await this.hierarchyService.getTeamMemberIds(
      managerEmp.id,
      user.organizationId,
    );
    return {
      scopedEmployeeIds: teamIds.length > 0 ? teamIds : [managerEmp.id],
      scopeType: 'TEAM',
    };
  }

  /**
   * 1. Performance Management Overview Report
   * Cycle participation, self & manager reviews, overdue tracking, rating distribution & exceptions.
   */
  async getPerformanceOverviewReport(
    user: AuthenticatedUser,
    query: PerformanceAnalyticsQueryDto,
  ): Promise<PerformanceAnalyticsOverviewDto> {
    const { scopedEmployeeIds, scopeType } = await this.resolveScopedEmployeeIds(user);
    const now = new Date();

    // 1. Resolve Target Review Cycle
    const cycle = await this.prisma.reviewCycle.findFirst({
      where: {
        organizationId: user.organizationId,
        ...(query.cycleId ? { id: query.cycleId } : {}),
      },
      orderBy: { startDate: 'desc' },
    });

    if (!cycle) {
      return {
        cycle: null,
        participation: {
          totalEnrolled: 0,
          eligibleCount: 0,
          exemptedCount: 0,
          withdrawnCount: 0,
          finalizedCount: 0,
          completionRate: 0,
        },
        assessments: {
          selfAssessmentNotStarted: 0,
          selfAssessmentDraft: 0,
          selfAssessmentSubmitted: 0,
          selfAssessmentRate: 0,
          managerReviewDraft: 0,
          managerReviewSubmitted: 0,
          managerReviewRate: 0,
          reopenedCount: 0,
        },
        deadlines: {
          overdueSelfAssessments: 0,
          overdueManagerReviews: 0,
          totalOverdueReviews: 0,
        },
        departmentBreakdown: [],
        branchBreakdown: [],
        ratingDistribution: {
          isNumericalApproved: false,
          isSuppressed: false,
          averageScore: null,
          totalFinalizedScored: 0,
          missingOrExcludedCount: 0,
          buckets: [],
        },
        cycleExceptions: {
          exemptedCount: 0,
          managerReassignedCount: 0,
          reopenedCount: 0,
        },
        metadata: {
          scopeType,
          filterDepartmentId: query.departmentId || null,
          filterBranchId: query.branchId || null,
        },
      };
    }

    // Verify whether an approved numerical rating policy exists
    const isNumericalApproved =
      (cycle.goalsWeightPercentage || 0) + (cycle.competenciesWeightPercentage || 0) > 0;

    // 2. Fetch Review Cycle Participants with Scoping
    const participants = await this.prisma.reviewCycleParticipant.findMany({
      where: {
        cycleId: cycle.id,
        ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
        ...(query.departmentId && query.departmentId !== 'ALL'
          ? { departmentId: query.departmentId }
          : {}),
        ...(query.branchId && query.branchId !== 'ALL' ? { branchId: query.branchId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      include: {
        reviews: {
          select: {
            id: true,
            status: true,
            overallScore: true,
            selfSubmittedAt: true,
            managerSubmittedAt: true,
            finalizedAt: true,
            reopenedAt: true,
          },
        },
      },
    });

    let totalEnrolled = 0;
    let exemptedCount = 0;
    let withdrawnCount = 0;
    let finalizedCount = 0;

    let selfAssessmentNotStarted = 0;
    let selfAssessmentDraft = 0;
    let selfAssessmentSubmitted = 0;
    let managerReviewDraft = 0;
    let managerReviewSubmitted = 0;
    let reopenedCount = 0;

    let overdueSelfAssessments = 0;
    let overdueManagerReviews = 0;
    let totalOverdueReviews = 0;

    const departmentMap = new Map<string, { total: number; completed: number }>();
    const branchMap = new Map<string, { total: number; completed: number }>();
    const scores: number[] = [];
    let missingOrExcludedCount = 0;

    for (const p of participants) {
      totalEnrolled++;

      if (p.status === 'EXEMPTED') {
        exemptedCount++;
        continue; // Exempted records are excluded from completion and assessment queues
      }
      if (p.status === 'WITHDRAWN') {
        withdrawnCount++;
        continue;
      }

      const review = p.reviews[0] || null;

      // Self-Assessment Tracking
      if (!review || review.status === 'NOT_STARTED') {
        selfAssessmentNotStarted++;
      } else if (review.status === 'SELF_ASSESSMENT_DRAFT') {
        selfAssessmentDraft++;
      } else if (
        review.status === 'SELF_ASSESSMENT_SUBMITTED' ||
        review.status === 'MANAGER_REVIEW_DRAFT' ||
        review.status === 'MANAGER_REVIEW_SUBMITTED' ||
        review.status === 'HR_CALIBRATION' ||
        review.status === 'FINALIZED'
      ) {
        selfAssessmentSubmitted++;
      }

      if (review?.status === 'REOPENED' || review?.reopenedAt) {
        reopenedCount++;
      }

      // Manager Review Tracking
      if (review?.status === 'MANAGER_REVIEW_DRAFT') {
        managerReviewDraft++;
      } else if (
        review?.status === 'MANAGER_REVIEW_SUBMITTED' ||
        review?.status === 'HR_CALIBRATION' ||
        review?.status === 'FINALIZED'
      ) {
        managerReviewSubmitted++;
      }

      // Finalized Outcome Tracking
      const isFinalized = review?.status === 'FINALIZED';
      if (isFinalized) {
        finalizedCount++;
        if (review.overallScore !== null && review.overallScore !== undefined) {
          scores.push(review.overallScore);
        } else {
          // Finalized without numerical score (e.g., narrative only or missing evaluation)
          missingOrExcludedCount++;
        }
      }

      // Overdue Checks using Cycle Deadlines
      let isReviewOverdue = false;
      if (cycle.selfAssessmentDeadline && now > cycle.selfAssessmentDeadline) {
        const isSelfPending =
          !review ||
          review.status === 'NOT_STARTED' ||
          review.status === 'SELF_ASSESSMENT_DRAFT' ||
          review.status === 'REOPENED';
        if (isSelfPending) {
          overdueSelfAssessments++;
          isReviewOverdue = true;
        }
      }

      if (cycle.managerReviewDeadline && now > cycle.managerReviewDeadline) {
        const isManagerPending =
          review &&
          (review.status === 'SELF_ASSESSMENT_SUBMITTED' ||
            review.status === 'MANAGER_REVIEW_DRAFT');
        if (isManagerPending) {
          overdueManagerReviews++;
          isReviewOverdue = true;
        }
      }

      if (isReviewOverdue) {
        totalOverdueReviews++;
      }

      // Department rollups
      if (p.departmentId) {
        const dep = departmentMap.get(p.departmentId) || { total: 0, completed: 0 };
        dep.total++;
        if (isFinalized) dep.completed++;
        departmentMap.set(p.departmentId, dep);
      }

      // Branch rollups
      if (p.branchId) {
        const br = branchMap.get(p.branchId) || { total: 0, completed: 0 };
        br.total++;
        if (isFinalized) br.completed++;
        branchMap.set(p.branchId, br);
      }
    }

    const eligibleCount = totalEnrolled - (exemptedCount + withdrawnCount);
    const completionRate =
      eligibleCount > 0 ? this.round((finalizedCount / eligibleCount) * 100) : 0;
    const selfAssessmentRate =
      eligibleCount > 0 ? this.round((selfAssessmentSubmitted / eligibleCount) * 100) : 0;
    const managerReviewRate =
      eligibleCount > 0 ? this.round((managerReviewSubmitted / eligibleCount) * 100) : 0;

    // Resolve Department & Branch Names with Privacy Suppression
    const [departments, branches] = await Promise.all([
      this.prisma.department.findMany({
        where: { id: { in: Array.from(departmentMap.keys()) } },
        select: { id: true, name: true },
      }),
      this.prisma.branch.findMany({
        where: { id: { in: Array.from(branchMap.keys()) } },
        select: { id: true, name: true },
      }),
    ]);
    const deptNameMap = new Map(departments.map((d) => [d.id, d.name]));
    const branchNameMap = new Map(branches.map((b) => [b.id, b.name]));

    const departmentBreakdown = Array.from(departmentMap.entries()).map(([depId, stats]) => {
      const isSuppressed = scopeType === 'TEAM' && stats.total < 5;
      return {
        departmentId: depId,
        departmentName: deptNameMap.get(depId) || 'Unassigned Department',
        totalParticipants: stats.total,
        completedCount: stats.completed,
        completionRate: stats.total > 0 ? this.round((stats.completed / stats.total) * 100) : 0,
        isSuppressed,
      };
    });

    const branchBreakdown = Array.from(branchMap.entries()).map(([brId, stats]) => {
      const isSuppressed = scopeType === 'TEAM' && stats.total < 5;
      return {
        branchId: brId,
        branchName: branchNameMap.get(brId) || 'Unassigned Branch',
        totalParticipants: stats.total,
        completedCount: stats.completed,
        completionRate: stats.total > 0 ? this.round((stats.completed / stats.total) * 100) : 0,
        isSuppressed,
      };
    });

    // Rating Distribution & Confidentiality Protection:
    // Only calculate distribution on finalized reviews where an approved numerical rating policy exists.
    // Never treat missing or incomplete ratings as 0.0!
    let isSuppressed = false;
    let suppressionReason: string | undefined = undefined;
    let averageScore: number | null = null;
    const buckets = [
      { label: '1.0 - 1.99 (Needs Improvement)', min: 1.0, max: 1.99, count: 0 },
      { label: '2.0 - 2.99 (Developing)', min: 2.0, max: 2.99, count: 0 },
      { label: '3.0 - 3.99 (Meets Expectations)', min: 3.0, max: 3.99, count: 0 },
      { label: '4.0 - 5.0 (Exceeds / Outstanding)', min: 4.0, max: 5.0, count: 0 },
    ];

    if (!isNumericalApproved) {
      isSuppressed = false;
      averageScore = null;
    } else {
      const minCohort = scopeType === 'TEAM' ? 5 : 3;
      if (scores.length < minCohort) {
        isSuppressed = true;
        suppressionReason = `Aggregate rating distribution suppressed to preserve individual confidentiality (cohort size ${scores.length} < minimum threshold ${minCohort}).`;
      } else {
        const sum = scores.reduce((acc, curr) => acc + curr, 0);
        averageScore = this.round(sum / scores.length);

        for (const s of scores) {
          if (s < 2.0) buckets[0].count++;
          else if (s < 3.0) buckets[1].count++;
          else if (s < 4.0) buckets[2].count++;
          else buckets[3].count++;
        }
      }
    }

    // Cycle Exceptions: counts of reassigned managers and historical reopens
    const [managerReassignedCount] = await Promise.all([
      this.prisma.reviewCycleParticipant.count({
        where: {
          cycleId: cycle.id,
          managerReassignedAt: { not: null },
          ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
        },
      }),
    ]);

    return {
      cycle: {
        id: cycle.id,
        name: cycle.name,
        status: cycle.status,
        startDate: cycle.startDate.toISOString(),
        endDate: cycle.endDate.toISOString(),
        selfAssessmentDeadline: cycle.selfAssessmentDeadline
          ? cycle.selfAssessmentDeadline.toISOString()
          : null,
        managerReviewDeadline: cycle.managerReviewDeadline
          ? cycle.managerReviewDeadline.toISOString()
          : null,
        ratingScaleMax: cycle.ratingScaleMax || 5,
        isNumericalApproved,
      },
      participation: {
        totalEnrolled,
        eligibleCount,
        exemptedCount,
        withdrawnCount,
        finalizedCount,
        completionRate,
      },
      assessments: {
        selfAssessmentNotStarted,
        selfAssessmentDraft,
        selfAssessmentSubmitted,
        selfAssessmentRate,
        managerReviewDraft,
        managerReviewSubmitted,
        managerReviewRate,
        reopenedCount,
      },
      deadlines: {
        overdueSelfAssessments,
        overdueManagerReviews,
        totalOverdueReviews,
      },
      departmentBreakdown,
      branchBreakdown,
      ratingDistribution: {
        isNumericalApproved,
        isSuppressed,
        suppressionReason,
        averageScore: isSuppressed ? null : averageScore,
        totalFinalizedScored: scores.length,
        missingOrExcludedCount,
        buckets: isSuppressed ? [] : buckets,
      },
      cycleExceptions: {
        exemptedCount,
        managerReassignedCount,
        reopenedCount,
      },
      metadata: {
        scopeType,
        filterDepartmentId: query.departmentId || null,
        filterBranchId: query.branchId || null,
      },
    };
  }

  /**
   * 2. Goal Progress and Completion Report
   * Evaluates organization/team goals, category distributions, progress rates, and lagging goals.
   */
  async getGoalProgressReport(
    user: AuthenticatedUser,
    query: PerformanceAnalyticsQueryDto,
  ): Promise<GoalProgressAnalyticsDto> {
    const { scopedEmployeeIds } = await this.resolveScopedEmployeeIds(user);
    const now = new Date();

    const goals = await this.prisma.performanceGoal.findMany({
      where: {
        organizationId: user.organizationId,
        ...(query.cycleId ? { cycleId: query.cycleId } : {}),
        ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      include: {
        employee: {
          select: {
            displayName: true,
            employeeCode: true,
            employment: {
              select: {
                departmentId: true,
                branchId: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply department and branch filtering if requested
    const filteredGoals = goals.filter((g) => {
      if (
        query.departmentId &&
        query.departmentId !== 'ALL' &&
        g.employee.employment?.departmentId !== query.departmentId
      ) {
        return false;
      }
      if (
        query.branchId &&
        query.branchId !== 'ALL' &&
        g.employee.employment?.branchId !== query.branchId
      ) {
        return false;
      }
      return true;
    });

    let completedGoals = 0;
    let inProgressGoals = 0;
    let pendingApprovalGoals = 0;
    let draftGoals = 0;
    let cancelledGoals = 0;
    let totalProgressSum = 0;
    let activeEligibleCount = 0;
    let overdueGoalsCount = 0;

    const categoryMap = new Map<
      string,
      { total: number; completed: number; progressSum: number; eligible: number }
    >();
    const laggingGoals: GoalProgressAnalyticsDto['laggingGoals'] = [];

    for (const g of filteredGoals) {
      const isCompleted = g.status === 'COMPLETED';
      const isCancelled = g.status === 'CANCELLED';
      const isDraft = g.status === 'DRAFT';
      const isPending = g.status === 'PENDING_APPROVAL';
      const isActive =
        g.status === 'APPROVED' ||
        g.status === 'IN_PROGRESS' ||
        g.status === 'ON_TRACK' ||
        g.status === 'NEEDS_ATTENTION' ||
        g.status === 'AT_RISK';

      if (isCompleted) completedGoals++;
      else if (isCancelled) cancelledGoals++;
      else if (isDraft) draftGoals++;
      else if (isPending) pendingApprovalGoals++;
      else if (isActive) inProgressGoals++;

      // Progress accumulation (exclude cancelled goals from average progress)
      if (!isCancelled) {
        activeEligibleCount++;
        totalProgressSum += g.progressPercentage || 0;
      }

      // Category breakdown
      const cat = categoryMap.get(g.category) || {
        total: 0,
        completed: 0,
        progressSum: 0,
        eligible: 0,
      };
      cat.total++;
      if (isCompleted) cat.completed++;
      if (!isCancelled) {
        cat.eligible++;
        cat.progressSum += g.progressPercentage || 0;
      }
      categoryMap.set(g.category, cat);

      // Check overdue or lagging (progress < 50% and due within 30 days or overdue)
      const isOverdue = !!(
        g.dueDate &&
        now.getTime() > g.dueDate.getTime() &&
        !isCompleted &&
        !isCancelled
      );
      if (isOverdue) {
        overdueGoalsCount++;
      }

      if ((isActive || isPending) && g.dueDate && ((g.progressPercentage || 0) < 50 || isOverdue)) {
        laggingGoals.push({
          id: g.id,
          title: g.title,
          employeeName: g.employee.displayName,
          employeeCode: g.employee.employeeCode,
          category: g.category,
          progressPercentage: this.round(g.progressPercentage || 0),
          dueDate: g.dueDate ? g.dueDate.toISOString() : null,
          isOverdue,
        });
      }
    }

    const averageProgressPercentage =
      activeEligibleCount > 0 ? this.round(totalProgressSum / activeEligibleCount) : 0;

    const byCategory: GoalProgressAnalyticsDto['byCategory'] = Array.from(
      categoryMap.entries(),
    ).map(([category, stats]) => ({
      category,
      total: stats.total,
      completed: stats.completed,
      averageProgress: stats.eligible > 0 ? this.round(stats.progressSum / stats.eligible) : 0,
    }));

    return {
      overview: {
        totalGoals: filteredGoals.length,
        completedGoals,
        inProgressGoals,
        pendingApprovalGoals,
        draftGoals,
        cancelledGoals,
        averageProgressPercentage,
        overdueGoalsCount,
      },
      byCategory,
      laggingGoals: laggingGoals.slice(0, 20),
    };
  }

  /**
   * 3. Development Plan Progress Report
   * Evaluates planned, active, completed, and overdue employee development actions.
   */
  async getDevelopmentPlanReport(
    user: AuthenticatedUser,
    query: PerformanceAnalyticsQueryDto,
  ): Promise<DevelopmentPlanAnalyticsDto> {
    const { scopedEmployeeIds } = await this.resolveScopedEmployeeIds(user);
    const now = new Date();

    const plans = await this.prisma.developmentPlan.findMany({
      where: {
        ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        review: {
          organizationId: user.organizationId,
          ...(query.cycleId ? { cycleId: query.cycleId } : {}),
        },
      },
      include: {
        employee: {
          select: {
            displayName: true,
            employeeCode: true,
            employment: {
              select: {
                departmentId: true,
                branchId: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const filteredPlans = plans.filter((p) => {
      if (
        query.departmentId &&
        query.departmentId !== 'ALL' &&
        p.employee.employment?.departmentId !== query.departmentId
      ) {
        return false;
      }
      if (
        query.branchId &&
        query.branchId !== 'ALL' &&
        p.employee.employment?.branchId !== query.branchId
      ) {
        return false;
      }
      return true;
    });

    let plannedCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    let onHoldCount = 0;
    let cancelledCount = 0;
    let overduePlansCount = 0;

    const activePlans: DevelopmentPlanAnalyticsDto['activePlans'] = [];

    for (const p of filteredPlans) {
      if (p.status === 'PLANNED') plannedCount++;
      else if (p.status === 'IN_PROGRESS') inProgressCount++;
      else if (p.status === 'COMPLETED') completedCount++;
      else if (p.status === 'ON_HOLD') onHoldCount++;
      else if (p.status === 'CANCELLED') cancelledCount++;

      const isOverdue = !!(
        p.targetDate &&
        now.getTime() > p.targetDate.getTime() &&
        p.status !== 'COMPLETED' &&
        p.status !== 'CANCELLED'
      );

      if (isOverdue) {
        overduePlansCount++;
      }

      if (p.status !== 'COMPLETED' && p.status !== 'CANCELLED') {
        activePlans.push({
          id: p.id,
          objective: p.objective,
          employeeName: p.employee.displayName,
          employeeCode: p.employee.employeeCode,
          status: p.status,
          targetDate: p.targetDate ? p.targetDate.toISOString() : null,
          isOverdue,
        });
      }
    }

    const nonCancelledTotal = filteredPlans.length - cancelledCount;
    const completionRate =
      nonCancelledTotal > 0 ? this.round((completedCount / nonCancelledTotal) * 100) : 0;

    return {
      overview: {
        totalPlans: filteredPlans.length,
        plannedCount,
        inProgressCount,
        completedCount,
        onHoldCount,
        cancelledCount,
        completionRate,
        overduePlansCount,
      },
      activePlans: activePlans.slice(0, 20),
    };
  }
}
