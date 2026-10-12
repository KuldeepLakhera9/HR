import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { TriggerPerformanceRemindersDto } from './dto/performance-notifications.dto';
import { TriggerRemindersResultDto } from '@hrms/types';

@Injectable()
export class PerformanceNotificationsService {
  private readonly logger = new Logger(PerformanceNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchy: HierarchyService,
    private readonly notifications: NotificationsService,
  ) {}

  private isHrOrAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes('ADMIN') || user.roles.includes('HR');
  }

  private formatDateKey(date?: Date | null): string {
    if (!date) return 'none';
    return date.toISOString().split('T')[0];
  }

  /**
   * Safe notification dispatch helper with try/catch wrapping
   * to guarantee notification errors never corrupt or abort business transactions.
   */
  async safeDispatch(params: {
    userId?: string | null;
    organizationId: string;
    title: string;
    message: string;
    type?: string;
    link?: string | null;
    idempotencyKey?: string | null;
  }): Promise<boolean> {
    try {
      if (!params.userId) {
        this.logger.debug(
          `[Performance Notification Skipped] No user account mapped for notification: "${params.title}"`,
        );
        return false;
      }
      await this.notifications.createNotification(params);
      return true;
    } catch (err: any) {
      this.logger.warn(
        `[Performance Notification Delivery Failed] Title="${params.title}" Err=${err?.message}`,
      );
      return false;
    }
  }

  // =========================================================================
  // 1. WORKFLOW TRANSITION NOTIFICATIONS
  // =========================================================================

  /**
   * Notify manager when an employee submits a goal for formal approval
   */
  async notifyGoalSubmitted(params: {
    organizationId: string;
    goalId: string;
    title: string;
    employeeId: string;
  }): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: params.employeeId },
      include: { manager: true },
    });

    if (!employee || !employee.manager?.userId) return;

    await this.safeDispatch({
      userId: employee.manager.userId,
      organizationId: params.organizationId,
      title: 'Performance Goal Submitted for Approval',
      message: `${employee.displayName} submitted goal: "${params.title}" for review.`,
      type: 'APPROVAL_REQUESTED',
      link: '/progress?tab=goals',
      idempotencyKey: `goal-sub-${params.goalId}`,
    });
  }

  /**
   * Notify employee when their manager approves or returns a goal
   */
  async notifyGoalDecision(params: {
    organizationId: string;
    goalId: string;
    title: string;
    employeeId: string;
    status: 'APPROVED' | 'RETURNED';
    comments?: string;
  }): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: params.employeeId },
      select: { userId: true },
    });

    if (!employee?.userId) return;

    const isApproved = params.status === 'APPROVED';
    await this.safeDispatch({
      userId: employee.userId,
      organizationId: params.organizationId,
      title: isApproved ? 'Performance Goal Approved' : 'Performance Goal Returned for Revision',
      message: isApproved
        ? `Your goal "${params.title}" has been approved by your manager.`
        : `Your goal "${params.title}" has been returned for updates.`,
      type: isApproved ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
      link: '/progress?tab=goals',
      idempotencyKey: `goal-dec-${params.goalId}-${params.status}`,
    });
  }

  /**
   * Notify employee upon enrollment into an active performance cycle
   */
  async notifyCycleEnrolled(params: {
    organizationId: string;
    cycleId: string;
    cycleName: string;
    employeeId: string;
    deadline?: Date | null;
  }): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: params.employeeId },
      select: { userId: true },
    });

    if (!employee?.userId) return;

    const deadlineStr = params.deadline ? ` Deadline: ${params.deadline.toLocaleDateString()}` : '';

    await this.safeDispatch({
      userId: employee.userId,
      organizationId: params.organizationId,
      title: `Enrolled in Performance Cycle: ${params.cycleName}`,
      message: `You are enrolled in ${params.cycleName}.${deadlineStr}`,
      type: 'INFO',
      link: '/progress?tab=self-assessment',
      idempotencyKey: `cycle-enrolled-${params.cycleId}-${params.employeeId}`,
    });
  }

  /**
   * Notify manager when an employee submits their self-assessment
   */
  async notifySelfAssessmentSubmitted(params: {
    organizationId: string;
    reviewId: string;
    cycleName: string;
    employeeId: string;
    managerId?: string | null;
  }): Promise<void> {
    let managerUserId: string | null = null;

    if (params.managerId) {
      const manager = await this.prisma.employee.findUnique({
        where: { id: params.managerId },
        select: { userId: true },
      });
      managerUserId = manager?.userId || null;
    } else {
      const employee = await this.prisma.employee.findUnique({
        where: { id: params.employeeId },
        include: { manager: true },
      });
      managerUserId = employee?.manager?.userId || null;
    }

    if (!managerUserId) return;

    const employee = await this.prisma.employee.findUnique({
      where: { id: params.employeeId },
      select: { displayName: true },
    });

    await this.safeDispatch({
      userId: managerUserId,
      organizationId: params.organizationId,
      title: `Self-Assessment Submitted: ${params.cycleName}`,
      message: `${employee?.displayName || 'Direct report'} has completed self-assessment for ${params.cycleName}. Manager review is ready.`,
      type: 'APPROVAL_REQUESTED',
      link: '/progress?tab=manager-reviews',
      idempotencyKey: `self-assess-sub-${params.reviewId}`,
    });
  }

  /**
   * Notify employee when manager returns self-assessment for correction
   */
  async notifyReviewReturned(params: {
    organizationId: string;
    reviewId: string;
    cycleName: string;
    employeeId: string;
    reason?: string;
  }): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: params.employeeId },
      select: { userId: true },
    });

    if (!employee?.userId) return;

    const reasonNote = params.reason ? ` Note: "${params.reason}"` : '';

    await this.safeDispatch({
      userId: employee.userId,
      organizationId: params.organizationId,
      title: `Self-Assessment Returned for Updates: ${params.cycleName}`,
      message: `Your manager requested updates on your performance evaluation.${reasonNote}`,
      type: 'WARNING',
      link: '/progress?tab=self-assessment',
      idempotencyKey: `rev-returned-${params.reviewId}-${this.formatDateKey(new Date())}`,
    });
  }

  /**
   * Notify employee when review is finalized
   * Avoids leaking confidential scores or notes into notification body.
   */
  async notifyReviewFinalized(params: {
    organizationId: string;
    reviewId: string;
    cycleName: string;
    employeeId: string;
  }): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: params.employeeId },
      select: { userId: true },
    });

    if (!employee?.userId) return;

    await this.safeDispatch({
      userId: employee.userId,
      organizationId: params.organizationId,
      title: `Performance Review Finalized: ${params.cycleName}`,
      message: `Your performance review for ${params.cycleName} has been officially completed. View finalized feedback in your dashboard.`,
      type: 'APPROVAL_APPROVED',
      link: '/progress?tab=dashboards',
      idempotencyKey: `rev-finalized-${params.reviewId}`,
    });
  }

  /**
   * Notify employee and manager when score is calibrated/recalculated under authorized audit
   */
  async notifyScoreRecalculated(params: {
    organizationId: string;
    reviewId: string;
    cycleName: string;
    employeeId: string;
    reason: string;
  }): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: params.employeeId },
      select: { userId: true },
    });

    if (!employee?.userId) return;

    await this.safeDispatch({
      userId: employee.userId,
      organizationId: params.organizationId,
      title: `Performance Scores Calibrated: ${params.cycleName}`,
      message: `Official review scores have been calibrated under organizational policy audit. View details in your dashboard.`,
      type: 'INFO',
      link: '/progress?tab=dashboards',
      idempotencyKey: `rev-recalc-${params.reviewId}-${this.formatDateKey(new Date())}`,
    });
  }

  /**
   * Notify employee when a development plan item is assigned
   */
  async notifyDevelopmentPlanAssigned(params: {
    organizationId: string;
    planId: string;
    objective: string;
    employeeId: string;
    targetDate?: Date | null;
  }): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: params.employeeId },
      select: { userId: true },
    });

    if (!employee?.userId) return;

    const targetDateStr = params.targetDate
      ? ` Target date: ${params.targetDate.toLocaleDateString()}`
      : '';

    await this.safeDispatch({
      userId: employee.userId,
      organizationId: params.organizationId,
      title: 'New Development Plan Action Assigned',
      message: `Development objective: "${params.objective}".${targetDateStr}`,
      type: 'INFO',
      link: '/progress?tab=development',
      idempotencyKey: `dev-plan-assigned-${params.planId}`,
    });
  }

  // =========================================================================
  // 2. AUTOMATED & BATCH DEADLINE REMINDERS ENGINE
  // =========================================================================

  /**
   * Batch scan and dispatch performance reminders for active goals and review cycles.
   * Enforces duplicate prevention via deterministic idempotencyKeys and skips ineligible records.
   */
  async scanAndSendPerformanceReminders(
    user: AuthenticatedUser,
    dto?: TriggerPerformanceRemindersDto,
  ): Promise<TriggerRemindersResultDto> {
    if (!this.isHrOrAdmin(user)) {
      throw new ForbiddenException('Access restricted to HR and Administrators.');
    }

    const windowDays =
      dto?.reminderWindowDays && dto.reminderWindowDays > 0 ? dto.reminderWindowDays : 7;
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    let goalsReminded = 0;
    let selfAssessmentsReminded = 0;
    let managerReviewsReminded = 0;

    // 1. Scan Active Goals (Avoid completed, cancelled, or draft goals!)
    const activeGoals = await this.prisma.performanceGoal.findMany({
      where: {
        organizationId: user.organizationId,
        status: { in: ['APPROVED', 'IN_PROGRESS', 'ON_TRACK', 'NEEDS_ATTENTION', 'AT_RISK'] },
        dueDate: { lte: thresholdDate },
      },
      include: {
        employee: { select: { userId: true, displayName: true } },
      },
    });

    for (const g of activeGoals) {
      if (!g.dueDate || !g.employee?.userId) continue;

      const dateKey = this.formatDateKey(g.dueDate);
      const isOverdue = now.getTime() > g.dueDate.getTime();
      const title = isOverdue
        ? `Overdue Goal Reminder: ${g.title}`
        : `Upcoming Goal Due Date: ${g.title}`;
      const message = isOverdue
        ? `Your goal "${g.title}" was due on ${g.dueDate.toLocaleDateString()}. Please update your progress.`
        : `Your goal "${g.title}" is due on ${g.dueDate.toLocaleDateString()}.`;

      const dispatched = await this.safeDispatch({
        userId: g.employee.userId,
        organizationId: user.organizationId,
        title,
        message,
        type: isOverdue ? 'WARNING' : 'INFO',
        link: '/progress?tab=goals',
        idempotencyKey: `remind-goal-${g.id}-${dateKey}`,
      });

      if (dispatched) goalsReminded++;
    }

    // 2. Scan Review Cycles (Avoid closed/archived cycles)
    const cycles = await this.prisma.reviewCycle.findMany({
      where: {
        organizationId: user.organizationId,
        status: { in: ['SELF_ASSESSMENT', 'MANAGER_REVIEW'] },
        ...(dto?.cycleId ? { id: dto.cycleId } : {}),
      },
      include: {
        participants: {
          where: { status: 'ENROLLED' }, // Skip EXEMPTED participants!
          include: {
            employee: { select: { userId: true, displayName: true } },
            manager: { select: { userId: true, displayName: true } },
            reviews: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    for (const c of cycles) {
      // A. Self-Assessment Reminders (if deadline within window)
      if (c.selfAssessmentDeadline && c.selfAssessmentDeadline <= thresholdDate) {
        const dateKey = this.formatDateKey(c.selfAssessmentDeadline);
        const isOverdue = now > c.selfAssessmentDeadline;

        for (const p of c.participants) {
          const review = p.reviews[0] || null;
          // Skip if already submitted or finalized!
          if (review && review.status !== 'NOT_STARTED' && review.status !== 'REOPENED') {
            continue;
          }

          if (!p.employee?.userId) continue;

          const title = isOverdue
            ? `Action Required: Self-Assessment Overdue (${c.name})`
            : `Reminder: Self-Assessment Due Soon (${c.name})`;
          const message = isOverdue
            ? `Your self-assessment for ${c.name} was due on ${c.selfAssessmentDeadline.toLocaleDateString()}. Please submit promptly.`
            : `Please complete your self-assessment for ${c.name} before ${c.selfAssessmentDeadline.toLocaleDateString()}.`;

          const dispatched = await this.safeDispatch({
            userId: p.employee.userId,
            organizationId: user.organizationId,
            title,
            message,
            type: isOverdue ? 'WARNING' : 'INFO',
            link: '/progress?tab=self-assessment',
            idempotencyKey: `remind-self-assess-${c.id}-${p.employeeId}-${dateKey}`,
          });

          if (dispatched) selfAssessmentsReminded++;
        }
      }

      // B. Manager Review Reminders (if manager deadline within window)
      if (c.managerReviewDeadline && c.managerReviewDeadline <= thresholdDate) {
        const dateKey = this.formatDateKey(c.managerReviewDeadline);
        const isOverdue = now > c.managerReviewDeadline;

        for (const p of c.participants) {
          const review = p.reviews[0] || null;
          // Only remind if waiting for manager evaluation!
          if (
            !review ||
            (review.status !== 'SELF_ASSESSMENT_SUBMITTED' &&
              review.status !== 'MANAGER_REVIEW_DRAFT')
          ) {
            continue; // Skip finalized, not started, or already manager-submitted reviews!
          }

          if (!p.manager?.userId) continue;

          const title = isOverdue
            ? `Action Required: Manager Review Overdue (${c.name})`
            : `Reminder: Manager Review Due Soon (${c.name})`;
          const message = isOverdue
            ? `Manager evaluation for ${p.employee?.displayName || 'direct report'} was due on ${c.managerReviewDeadline.toLocaleDateString()}.`
            : `Please submit evaluation for ${p.employee?.displayName || 'direct report'} before ${c.managerReviewDeadline.toLocaleDateString()}.`;

          const dispatched = await this.safeDispatch({
            userId: p.manager.userId,
            organizationId: user.organizationId,
            title,
            message,
            type: isOverdue ? 'WARNING' : 'INFO',
            link: '/progress?tab=manager-reviews',
            idempotencyKey: `remind-mgr-review-${c.id}-${review.id}-${dateKey}`,
          });

          if (dispatched) managerReviewsReminded++;
        }
      }
    }

    this.logger.log(
      `[Performance Reminders Scan Completed] Goals=${goalsReminded}, SelfAssessments=${selfAssessmentsReminded}, ManagerReviews=${managerReviewsReminded}`,
    );

    return {
      goalsReminded,
      selfAssessmentsReminded,
      managerReviewsReminded,
      message: `Performance reminders processed successfully (${goalsReminded} goals, ${selfAssessmentsReminded} self-assessments, ${managerReviewsReminded} manager evaluations).`,
    };
  }

  // =========================================================================
  // 3. TARGETED ON-DEMAND NUDGES
  // =========================================================================

  /**
   * Send on-demand nudge to an employee for a specific goal
   */
  async sendGoalNudge(
    user: AuthenticatedUser,
    goalId: string,
  ): Promise<{ success: boolean; message: string }> {
    const goal = await this.prisma.performanceGoal.findUnique({
      where: { id: goalId },
      include: {
        employee: { select: { id: true, userId: true, displayName: true } },
      },
    });

    if (!goal || goal.organizationId !== user.organizationId) {
      throw new NotFoundException('Goal record not found.');
    }

    if (goal.status === 'COMPLETED' || goal.status === 'CANCELLED') {
      return {
        success: false,
        message: 'Goal is already completed or cancelled; reminder not sent.',
      };
    }

    // Verify manager/HR permission
    if (!this.isHrOrAdmin(user)) {
      const callerEmp = await this.prisma.employee.findFirst({
        where: { userId: user.id, organizationId: user.organizationId },
      });
      if (!callerEmp) throw new ForbiddenException('Caller record not found.');
      const teamIds = await this.hierarchy.getTeamMemberIds(callerEmp.id, user.organizationId);
      if (!teamIds.includes(goal.employeeId)) {
        throw new ForbiddenException('You do not have authority to nudge this employee.');
      }
    }

    if (!goal.employee.userId) {
      return { success: false, message: 'Employee has no active user account.' };
    }

    const todayKey = this.formatDateKey(new Date());

    await this.safeDispatch({
      userId: goal.employee.userId,
      organizationId: user.organizationId,
      title: `Goal Progress Check: ${goal.title}`,
      message: `Please review and provide a progress check-in for your goal: "${goal.title}".`,
      type: 'INFO',
      link: '/progress?tab=goals',
      idempotencyKey: `goal-nudge-${goal.id}-${todayKey}`,
    });

    return { success: true, message: 'Goal progress reminder sent successfully.' };
  }

  /**
   * Send on-demand nudge to an employee or manager for a specific review
   */
  async sendReviewNudge(
    user: AuthenticatedUser,
    reviewId: string,
  ): Promise<{ success: boolean; message: string }> {
    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        cycle: true,
        employee: { select: { id: true, userId: true, displayName: true } },
        manager: { select: { id: true, userId: true, displayName: true } },
      },
    });

    if (!review || review.organizationId !== user.organizationId) {
      throw new NotFoundException('Performance review record not found.');
    }

    if (review.status === 'FINALIZED') {
      return {
        success: false,
        message: 'Review is already finalized; reminder skipped.',
      };
    }

    const todayKey = this.formatDateKey(new Date());

    // If review is pending self-assessment, nudge employee
    if (review.status === 'NOT_STARTED' || review.status === 'REOPENED') {
      if (!review.employee.userId) {
        return { success: false, message: 'Employee has no active user account.' };
      }

      await this.safeDispatch({
        userId: review.employee.userId,
        organizationId: user.organizationId,
        title: `Self-Assessment Reminder: ${review.cycle.name}`,
        message: `Please complete and submit your self-assessment for ${review.cycle.name}.`,
        type: 'INFO',
        link: '/progress?tab=self-assessment',
        idempotencyKey: `rev-nudge-emp-${review.id}-${todayKey}`,
      });

      return { success: true, message: 'Self-assessment reminder sent to employee.' };
    }

    // If review is pending manager evaluation, nudge manager
    if (review.status === 'SELF_ASSESSMENT_SUBMITTED' || review.status === 'MANAGER_REVIEW_DRAFT') {
      if (!review.manager?.userId) {
        return { success: false, message: 'Manager has no active user account.' };
      }

      await this.safeDispatch({
        userId: review.manager.userId,
        organizationId: user.organizationId,
        title: `Manager Review Reminder: ${review.cycle.name}`,
        message: `Please complete your manager evaluation for ${review.employee.displayName} (${review.cycle.name}).`,
        type: 'INFO',
        link: '/progress?tab=manager-reviews',
        idempotencyKey: `rev-nudge-mgr-${review.id}-${todayKey}`,
      });

      return { success: true, message: 'Manager review reminder sent to evaluator.' };
    }

    return {
      success: false,
      message: `Review is in status ${review.status}; no active pending action to nudge.`,
    };
  }
}
