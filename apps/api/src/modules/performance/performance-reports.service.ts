import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { QueryHrPerformanceReportDto } from './dto/performance-reports.dto';
import {
  EmployeePerformanceDashboardDto,
  ManagerPerformanceDashboardDto,
  HrAdminPerformanceDashboardDto,
} from '@hrms/types';

@Injectable()
export class PerformanceReportsService {
  private readonly logger = new Logger(PerformanceReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchy: HierarchyService,
  ) {}

  /**
   * Safe number rounding helper
   */
  private round(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  /**
   * Helper to verify if user has HR or ADMIN privileges
   */
  private isHrOrAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes('ADMIN') || user.roles.includes('HR');
  }

  /**
   * Formula injection protection for CSV export
   */
  private sanitizeCsvField(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    const sanitized = str.replace(/"/g, '""');
    // Prevent Excel formula injection (=, +, -, @, \t, \r)
    if (/^[=+\-@\t\r]/.test(sanitized)) {
      return `"'${sanitized}"`;
    }
    return `"${sanitized}"`;
  }

  /**
   * 1. Employee Performance Dashboard
   */
  async getEmployeeDashboard(user: AuthenticatedUser): Promise<EmployeePerformanceDashboardDto> {
    const callerEmp = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, displayName: true },
    });

    if (!callerEmp) {
      throw new NotFoundException('Employee profile record not found.');
    }

    const now = new Date();

    // 1. Fetch Goals
    const goals = await this.prisma.performanceGoal.findMany({
      where: {
        employeeId: callerEmp.id,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        baselineValue: true,
        targetValue: true,
        currentValue: true,
        weight: true,
        dueDate: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let completedGoals = 0;
    let inProgressGoals = 0;
    let draftGoals = 0;
    let pendingApprovalGoals = 0;
    let totalProgressSum = 0;

    const activeGoalsList: EmployeePerformanceDashboardDto['goalsSummary']['activeGoalsList'] = [];
    const upcomingDeadlines: EmployeePerformanceDashboardDto['upcomingDeadlines'] = [];

    for (const g of goals) {
      let progress = 0;
      const base = g.baselineValue ?? 0;
      const tgt = g.targetValue ?? 0;
      const cur = g.currentValue ?? 0;

      if (tgt !== base && tgt > base) {
        progress = Math.min(100, Math.max(0, ((cur - base) / (tgt - base)) * 100));
      } else if (tgt > 0) {
        progress = Math.min(100, Math.max(0, (cur / tgt) * 100));
      }
      progress = this.round(progress);
      totalProgressSum += progress;

      const isCompleted = g.status === 'COMPLETED';
      const isDraft = g.status === 'DRAFT';
      const isPendingApproval = g.status === 'PENDING_APPROVAL';
      const isActive =
        g.status === 'APPROVED' ||
        g.status === 'IN_PROGRESS' ||
        g.status === 'ON_TRACK' ||
        g.status === 'NEEDS_ATTENTION' ||
        g.status === 'AT_RISK';

      if (isCompleted) completedGoals++;
      else if (isActive) inProgressGoals++;
      else if (isDraft) draftGoals++;
      else if (isPendingApproval) pendingApprovalGoals++;

      if (isActive || isPendingApproval) {
        activeGoalsList.push({
          id: g.id,
          title: g.title,
          category: g.category,
          progressPercentage: progress,
          dueDate: g.dueDate ? g.dueDate.toISOString() : null,
          status: g.status,
        });
      }

      if (g.dueDate && g.status !== 'COMPLETED' && g.status !== 'CANCELLED') {
        const diffTime = g.dueDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        upcomingDeadlines.push({
          id: g.id,
          type: 'GOAL',
          title: g.title,
          dueDate: g.dueDate.toISOString(),
          daysRemaining,
          isOverdue: daysRemaining < 0,
        });
      }
    }

    const averageProgressPercentage =
      goals.length > 0 ? this.round(totalProgressSum / goals.length) : 0;

    // 2. Fetch Active Review Cycle & Participation
    const activeParticipant = await this.prisma.reviewCycleParticipant.findFirst({
      where: {
        employeeId: callerEmp.id,
        status: 'ENROLLED',
      },
      include: {
        cycle: true,
        reviews: {
          select: {
            id: true,
            status: true,
            selfSubmittedAt: true,
          },
        },
      },
      orderBy: { cycle: { startDate: 'desc' } },
    });

    let currentCycleReview: EmployeePerformanceDashboardDto['currentCycleReview'] = null;

    if (activeParticipant && activeParticipant.cycle) {
      const activeReview = activeParticipant.reviews[0] || null;
      const cycle = activeParticipant.cycle;

      currentCycleReview = {
        cycleId: cycle.id,
        cycleName: cycle.name,
        cycleStatus: cycle.status,
        selfAssessmentDeadline: cycle.selfAssessmentDeadline
          ? cycle.selfAssessmentDeadline.toISOString()
          : null,
        reviewStatus: activeReview?.status || 'NOT_STARTED',
        selfSubmittedAt: activeReview?.selfSubmittedAt
          ? activeReview.selfSubmittedAt.toISOString()
          : null,
      };

      if (
        cycle.selfAssessmentDeadline &&
        (!activeReview ||
          activeReview.status === 'NOT_STARTED' ||
          activeReview.status === 'REOPENED')
      ) {
        const diffTime = cycle.selfAssessmentDeadline.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        upcomingDeadlines.push({
          id: cycle.id,
          type: 'SELF_ASSESSMENT',
          title: `${cycle.name} — Self-Assessment`,
          dueDate: cycle.selfAssessmentDeadline.toISOString(),
          daysRemaining,
          isOverdue: daysRemaining < 0,
        });
      }
    }

    // Sort deadlines chronologically
    upcomingDeadlines.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // 3. Fetch Finalized Reviews (Employee-Visible Feedback only)
    const finalizedReviews = await this.prisma.performanceReview.findMany({
      where: {
        employeeId: callerEmp.id,
        organizationId: user.organizationId,
        status: 'FINALIZED',
      },
      include: {
        cycle: { select: { name: true, ratingScaleMax: true } },
        feedbackNotes: {
          where: { visibility: 'EMPLOYEE_VISIBLE' }, // STRICT PRIVACY GUARD: Employee visible only!
          select: { title: true, content: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { finalizedAt: 'desc' },
      take: 5,
    });

    const recentFinalizedFeedback: EmployeePerformanceDashboardDto['recentFinalizedFeedback'] =
      finalizedReviews.map((r) => ({
        reviewId: r.id,
        cycleName: r.cycle.name,
        finalizedAt: r.finalizedAt ? r.finalizedAt.toISOString() : r.updatedAt.toISOString(),
        overallScore: r.overallScore,
        ratingScaleMax: r.cycle.ratingScaleMax || 5,
        scoreExplanation: r.scoreExplanation,
        managerSummary: r.managerSummary,
        managerStrengths: r.managerStrengths,
        managerImprovements: r.managerImprovements,
        employeeVisibleFeedbacks: r.feedbackNotes.map((f) => ({
          title: f.title,
          content: f.content,
          createdAt: f.createdAt.toISOString(),
        })),
      }));

    // 4. Fetch Active Development Plans
    const devPlans = await this.prisma.developmentPlan.findMany({
      where: {
        employeeId: callerEmp.id,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      select: {
        id: true,
        objective: true,
        actionSteps: true,
        targetDate: true,
        status: true,
        responsiblePerson: true,
      },
      orderBy: { targetDate: 'asc' },
    });

    const activeDevelopmentPlans: EmployeePerformanceDashboardDto['activeDevelopmentPlans'] =
      devPlans.map((d) => ({
        id: d.id,
        objective: d.objective,
        actionSteps: d.actionSteps,
        targetDate: d.targetDate ? d.targetDate.toISOString() : null,
        status: d.status,
        responsiblePerson: d.responsiblePerson,
      }));

    return {
      goalsSummary: {
        totalGoals: goals.length,
        completedGoals,
        inProgressGoals,
        draftGoals,
        pendingApprovalGoals,
        averageProgressPercentage,
        activeGoalsList: activeGoalsList.slice(0, 8),
      },
      upcomingDeadlines,
      currentCycleReview,
      recentFinalizedFeedback,
      activeDevelopmentPlans,
    };
  }

  /**
   * 2. Manager Performance Dashboard
   */
  async getManagerDashboard(user: AuthenticatedUser): Promise<ManagerPerformanceDashboardDto> {
    const callerEmp = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, displayName: true },
    });

    if (!callerEmp) {
      throw new NotFoundException('Manager employee profile not found.');
    }

    // Resolve authorized team hierarchy members
    const teamMemberIds = await this.hierarchy.getTeamMemberIds(callerEmp.id, user.organizationId);

    if (!teamMemberIds || teamMemberIds.length === 0) {
      return {
        teamGoalsSummary: {
          totalTeamMembers: 0,
          totalGoals: 0,
          completedGoals: 0,
          inProgressGoals: 0,
          pendingApprovalGoals: 0,
          averageProgressPercentage: 0,
          laggingGoals: [],
        },
        teamReviewStatus: {
          totalAssignedReviews: 0,
          notStarted: 0,
          selfAssessmentSubmitted: 0,
          managerReviewInProgress: 0,
          managerReviewSubmitted: 0,
          finalized: 0,
          completionPercentage: 0,
        },
        pendingActions: {
          pendingSelfAssessmentsCount: 0,
          pendingManagerReviewsCount: 0,
          overdueReviewsCount: 0,
          urgentReviews: [],
        },
      };
    }

    const now = new Date();

    // 1. Team Goals Summary
    const teamGoals = await this.prisma.performanceGoal.findMany({
      where: {
        employeeId: { in: teamMemberIds },
        organizationId: user.organizationId,
      },
      include: {
        employee: { select: { displayName: true, employeeCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let completedGoals = 0;
    let inProgressGoals = 0;
    let pendingApprovalGoals = 0;
    let totalProgressSum = 0;
    const laggingGoals: ManagerPerformanceDashboardDto['teamGoalsSummary']['laggingGoals'] = [];

    for (const g of teamGoals) {
      let progress = 0;
      const base = g.baselineValue ?? 0;
      const tgt = g.targetValue ?? 0;
      const cur = g.currentValue ?? 0;

      if (tgt !== base && tgt > base) {
        progress = Math.min(100, Math.max(0, ((cur - base) / (tgt - base)) * 100));
      } else if (tgt > 0) {
        progress = Math.min(100, Math.max(0, (cur / tgt) * 100));
      }
      progress = this.round(progress);
      totalProgressSum += progress;

      const isCompleted = g.status === 'COMPLETED';
      const isPendingApproval = g.status === 'PENDING_APPROVAL';
      const isActive =
        g.status === 'APPROVED' ||
        g.status === 'IN_PROGRESS' ||
        g.status === 'ON_TRACK' ||
        g.status === 'NEEDS_ATTENTION' ||
        g.status === 'AT_RISK';

      if (isCompleted) completedGoals++;
      else if (isActive) inProgressGoals++;
      else if (isPendingApproval) pendingApprovalGoals++;

      // Lagging goal criteria: active, progress < 50%, and due within 30 days or overdue
      if (
        isActive &&
        progress < 50 &&
        g.dueDate &&
        g.dueDate.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000
      ) {
        laggingGoals.push({
          id: g.id,
          employeeId: g.employeeId,
          employeeName: g.employee.displayName,
          employeeCode: g.employee.employeeCode,
          title: g.title,
          progressPercentage: progress,
          dueDate: g.dueDate.toISOString(),
        });
      }
    }

    const averageProgressPercentage =
      teamGoals.length > 0 ? this.round(totalProgressSum / teamGoals.length) : 0;

    // 2. Team Review Status
    const teamReviews = await this.prisma.performanceReview.findMany({
      where: {
        employeeId: { in: teamMemberIds },
        organizationId: user.organizationId,
      },
      include: {
        cycle: {
          select: {
            name: true,
            status: true,
            managerReviewDeadline: true,
            selfAssessmentDeadline: true,
          },
        },
        employee: { select: { displayName: true, employeeCode: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    let notStarted = 0;
    let selfAssessmentSubmitted = 0;
    let managerReviewInProgress = 0;
    let managerReviewSubmitted = 0;
    let finalized = 0;
    let pendingSelfAssessmentsCount = 0;
    let pendingManagerReviewsCount = 0;
    let overdueReviewsCount = 0;

    const urgentReviews: ManagerPerformanceDashboardDto['pendingActions']['urgentReviews'] = [];

    for (const r of teamReviews) {
      if (r.status === 'NOT_STARTED' || r.status === 'REOPENED') {
        notStarted++;
        pendingSelfAssessmentsCount++;
      } else if (r.status === 'SELF_ASSESSMENT_SUBMITTED') {
        selfAssessmentSubmitted++;
        pendingManagerReviewsCount++;
      } else if (r.status === 'MANAGER_REVIEW_DRAFT') {
        managerReviewInProgress++;
        pendingManagerReviewsCount++;
      } else if (r.status === 'MANAGER_REVIEW_SUBMITTED') {
        managerReviewSubmitted++;
      } else if (r.status === 'FINALIZED') {
        finalized++;
      }

      // Check overdue or urgent
      const deadline = r.cycle.managerReviewDeadline;
      const isOverdue = !!(
        deadline &&
        now.getTime() > deadline.getTime() &&
        r.status !== 'FINALIZED' &&
        r.status !== 'MANAGER_REVIEW_SUBMITTED'
      );

      if (isOverdue) {
        overdueReviewsCount++;
      }

      if (
        r.status === 'SELF_ASSESSMENT_SUBMITTED' ||
        r.status === 'MANAGER_REVIEW_DRAFT' ||
        isOverdue
      ) {
        urgentReviews.push({
          reviewId: r.id,
          employeeId: r.employeeId,
          employeeName: r.employee.displayName,
          employeeCode: r.employee.employeeCode,
          cycleName: r.cycle.name,
          status: r.status,
          deadline: deadline ? deadline.toISOString() : null,
          isOverdue,
        });
      }
    }

    const totalAssignedReviews = teamReviews.length;
    const completionPercentage =
      totalAssignedReviews > 0 ? this.round((finalized / totalAssignedReviews) * 100) : 0;

    return {
      teamGoalsSummary: {
        totalTeamMembers: teamMemberIds.length,
        totalGoals: teamGoals.length,
        completedGoals,
        inProgressGoals,
        pendingApprovalGoals,
        averageProgressPercentage,
        laggingGoals: laggingGoals.slice(0, 10),
      },
      teamReviewStatus: {
        totalAssignedReviews,
        notStarted,
        selfAssessmentSubmitted,
        managerReviewInProgress,
        managerReviewSubmitted,
        finalized,
        completionPercentage,
      },
      pendingActions: {
        pendingSelfAssessmentsCount,
        pendingManagerReviewsCount,
        overdueReviewsCount,
        urgentReviews: urgentReviews.slice(0, 12),
      },
    };
  }

  /**
   * 3. HR/Admin Performance Analytics & Global Dashboard
   */
  async getHrAdminDashboard(
    user: AuthenticatedUser,
    query: QueryHrPerformanceReportDto,
  ): Promise<HrAdminPerformanceDashboardDto> {
    if (!this.isHrOrAdmin(user)) {
      throw new ForbiddenException('Access restricted to HR and Administrators.');
    }

    const now = new Date();

    // 1. Fetch Cycles
    const cycles = await this.prisma.reviewCycle.findMany({
      where: {
        organizationId: user.organizationId,
        ...(query.cycleId ? { id: query.cycleId } : {}),
      },
      include: {
        participants: {
          select: {
            id: true,
            status: true,
            departmentId: true,
            branchId: true,
            reviews: {
              select: {
                id: true,
                status: true,
                overallScore: true,
              },
            },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    let totalActiveCycles = 0;
    let totalParticipants = 0;
    let totalCompletedReviews = 0;
    let totalPendingSelfAssessments = 0;
    let totalPendingManagerReviews = 0;
    let totalOverdueReviews = 0;

    const cycleParticipation: HrAdminPerformanceDashboardDto['cycleParticipation'] = [];
    const departmentMap = new Map<string, { total: number; completed: number }>();
    const branchMap = new Map<string, { total: number; completed: number }>();

    const targetCycle = query.cycleId
      ? cycles.find((c) => c.id === query.cycleId) || cycles[0]
      : cycles[0] || null;

    const scoreList: number[] = [];

    for (const c of cycles) {
      if (c.status !== 'ARCHIVED' && c.status !== 'FINALIZED') {
        totalActiveCycles++;
      }

      const cycleParticipants = c.participants.filter((p) => p.status !== 'EXEMPTED');
      let cycleCompleted = 0;

      for (const p of cycleParticipants) {
        totalParticipants++;
        const review = p.reviews[0] || null;

        if (review && review.status === 'FINALIZED') {
          totalCompletedReviews++;
          cycleCompleted++;
          if (c.id === targetCycle?.id && review.overallScore !== null) {
            scoreList.push(review.overallScore);
          }
        } else if (!review || review.status === 'NOT_STARTED' || review.status === 'REOPENED') {
          totalPendingSelfAssessments++;
        } else if (
          review.status === 'SELF_ASSESSMENT_SUBMITTED' ||
          review.status === 'MANAGER_REVIEW_DRAFT'
        ) {
          totalPendingManagerReviews++;
        }

        // Check overdue
        if (
          c.managerReviewDeadline &&
          now > c.managerReviewDeadline &&
          (!review || review.status !== 'FINALIZED')
        ) {
          totalOverdueReviews++;
        }

        // Aggregate Department
        if (p.departmentId) {
          const current = departmentMap.get(p.departmentId) || { total: 0, completed: 0 };
          current.total++;
          if (review?.status === 'FINALIZED') current.completed++;
          departmentMap.set(p.departmentId, current);
        }

        // Aggregate Branch
        if (p.branchId) {
          const current = branchMap.get(p.branchId) || { total: 0, completed: 0 };
          current.total++;
          if (review?.status === 'FINALIZED') current.completed++;
          branchMap.set(p.branchId, current);
        }
      }

      const completionRate =
        cycleParticipants.length > 0
          ? this.round((cycleCompleted / cycleParticipants.length) * 100)
          : 0;

      cycleParticipation.push({
        cycleId: c.id,
        cycleName: c.name,
        cycleStatus: c.status,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate.toISOString(),
        totalParticipants: cycleParticipants.length,
        completedCount: cycleCompleted,
        completionRate,
      });
    }

    const overallCompletionRate =
      totalParticipants > 0 ? this.round((totalCompletedReviews / totalParticipants) * 100) : 0;

    // Resolve Department Names
    const departmentIds = Array.from(departmentMap.keys());
    const departments = await this.prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true },
    });
    const departmentNameLookup = new Map(departments.map((d) => [d.id, d.name]));

    const departmentBreakdown: HrAdminPerformanceDashboardDto['departmentBreakdown'] = [];
    departmentMap.forEach((val, depId) => {
      departmentBreakdown.push({
        departmentId: depId,
        departmentName: departmentNameLookup.get(depId) || 'Unassigned Department',
        totalParticipants: val.total,
        completedCount: val.completed,
        completionRate: val.total > 0 ? this.round((val.completed / val.total) * 100) : 0,
      });
    });

    // Resolve Branch Names
    const branchIds = Array.from(branchMap.keys());
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const branchNameLookup = new Map(branches.map((b) => [b.id, b.name]));

    const branchBreakdown: HrAdminPerformanceDashboardDto['branchBreakdown'] = [];
    branchMap.forEach((val, brId) => {
      branchBreakdown.push({
        branchId: brId,
        branchName: branchNameLookup.get(brId) || 'Unassigned Branch',
        totalParticipants: val.total,
        completedCount: val.completed,
        completionRate: val.total > 0 ? this.round((val.completed / val.total) * 100) : 0,
      });
    });

    // Rating Distribution & Differential Privacy Protection
    let isNumericalApproved = false;
    let isSuppressed = false;
    let suppressionReason: string | undefined = undefined;
    let averageScore: number | null = null;
    const buckets = [
      { label: '1.0 - 1.99 (Needs Improvement)', min: 1.0, max: 1.99, count: 0 },
      { label: '2.0 - 2.99 (Developing)', min: 2.0, max: 2.99, count: 0 },
      { label: '3.0 - 3.99 (Meets Expectations)', min: 3.0, max: 3.99, count: 0 },
      { label: '4.0 - 5.0 (Exceeds / Outstanding)', min: 4.0, max: 5.0, count: 0 },
    ];

    if (targetCycle) {
      isNumericalApproved =
        (targetCycle.goalsWeightPercentage || 0) + (targetCycle.competenciesWeightPercentage || 0) >
        0;

      // Small group differential privacy check: if < 3 completed reviews, suppress distribution
      if (scoreList.length < 3) {
        isSuppressed = true;
        suppressionReason =
          'Aggregate rating distribution suppressed to preserve individual confidentiality (cohort size < 3).';
      } else {
        const sum = scoreList.reduce((acc, curr) => acc + curr, 0);
        averageScore = this.round(sum / scoreList.length);

        for (const score of scoreList) {
          if (score < 2.0) buckets[0].count++;
          else if (score < 3.0) buckets[1].count++;
          else if (score < 4.0) buckets[2].count++;
          else buckets[3].count++;
        }
      }
    }

    // Cycle Exceptions & Audit Information
    const [exemptedCount, managerReassignedCount, reopenedCount, recentAuditEvents] =
      await Promise.all([
        this.prisma.reviewCycleParticipant.count({
          where: {
            cycle: { organizationId: user.organizationId },
            status: 'EXEMPTED',
          },
        }),
        this.prisma.reviewCycleParticipant.count({
          where: {
            cycle: { organizationId: user.organizationId },
            managerReassignedAt: { not: null },
          },
        }),
        this.prisma.performanceReview.count({
          where: {
            organizationId: user.organizationId,
            reopenedAt: { not: null },
          },
        }),
        this.prisma.reviewCycleHistory.findMany({
          where: {
            cycle: { organizationId: user.organizationId },
          },
          include: { cycle: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
      ]);

    const recentAuditTimeline = recentAuditEvents.map((a) => ({
      id: a.id,
      cycleName: a.cycle.name,
      action: a.action,
      changeReason: a.changeReason,
      timestamp: a.createdAt.toISOString(),
    }));

    return {
      overview: {
        totalActiveCycles,
        totalParticipants,
        totalCompletedReviews,
        overallCompletionRate,
        totalPendingSelfAssessments,
        totalPendingManagerReviews,
        totalOverdueReviews,
      },
      cycleParticipation,
      departmentBreakdown,
      branchBreakdown,
      ratingDistribution: {
        cycleId: targetCycle?.id || null,
        cycleName: targetCycle?.name || null,
        isNumericalApproved,
        isSuppressed,
        suppressionReason,
        averageScore: isSuppressed ? null : averageScore,
        totalEvaluated: scoreList.length,
        buckets: isSuppressed ? [] : buckets,
      },
      cycleExceptions: {
        exemptedCount,
        managerReassignedCount,
        reopenedCount,
        recentAuditTimeline,
      },
    };
  }

  /**
   * 4. Export Performance Review MIS Report (CSV with Sanitization)
   */
  async exportPerformanceReportCsv(
    user: AuthenticatedUser,
    query: QueryHrPerformanceReportDto,
  ): Promise<{ filename: string; csv: string }> {
    if (!this.isHrOrAdmin(user)) {
      throw new ForbiddenException('Access restricted to HR and Administrators.');
    }

    const participants = await this.prisma.reviewCycleParticipant.findMany({
      where: {
        cycle: {
          organizationId: user.organizationId,
          ...(query.cycleId ? { id: query.cycleId } : {}),
        },
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.status ? { status: query.status as any } : {}),
      },
      include: {
        cycle: { select: { name: true, status: true } },
        employee: {
          select: {
            employeeCode: true,
            displayName: true,
            employment: {
              select: {
                department: { select: { name: true } },
                branch: { select: { name: true } },
              },
            },
          },
        },
        reviews: {
          select: {
            status: true,
            overallScore: true,
            selfSubmittedAt: true,
            managerSubmittedAt: true,
            finalizedAt: true,
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
      take: 2000, // Safe bounding limit
    });

    const headers = [
      'Employee Code',
      'Employee Name',
      'Department',
      'Branch',
      'Review Cycle',
      'Cycle Status',
      'Review Status',
      'Self Submitted Date',
      'Manager Submitted Date',
      'Overall Score',
      'Finalized Date',
    ];

    const rows: string[] = [headers.join(',')];

    for (const p of participants) {
      const review = p.reviews[0] || null;
      const row = [
        this.sanitizeCsvField(p.employee.employeeCode),
        this.sanitizeCsvField(p.employee.displayName),
        this.sanitizeCsvField(p.employee.employment?.department?.name || 'N/A'),
        this.sanitizeCsvField(p.employee.employment?.branch?.name || 'N/A'),
        this.sanitizeCsvField(p.cycle.name),
        this.sanitizeCsvField(p.cycle.status),
        this.sanitizeCsvField(review?.status || p.status),
        this.sanitizeCsvField(
          review?.selfSubmittedAt ? review.selfSubmittedAt.toISOString().split('T')[0] : '',
        ),
        this.sanitizeCsvField(
          review?.managerSubmittedAt ? review.managerSubmittedAt.toISOString().split('T')[0] : '',
        ),
        this.sanitizeCsvField(
          review?.overallScore !== null && review?.overallScore !== undefined
            ? review.overallScore.toFixed(2)
            : '',
        ),
        this.sanitizeCsvField(
          review?.finalizedAt ? review.finalizedAt.toISOString().split('T')[0] : '',
        ),
      ];
      rows.push(row.join(','));
    }

    const csvContent = rows.join('\r\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `performance-reviews-report-${timestamp}.csv`;

    return { filename, csv: csvContent };
  }
}
