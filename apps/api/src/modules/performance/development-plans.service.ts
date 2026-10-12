import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, FeedbackVisibility, DevelopmentPlanStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  CreateDevelopmentPlanDto,
  UpdateDevelopmentPlanDto,
  CreateFeedbackDto,
  UpdateFeedbackDto,
} from './dto/development-plan.dto';
import {
  DevelopmentPlanDto,
  PerformanceFeedbackDto,
  DevelopmentPlansOverviewDto,
} from '@hrms/types';

@Injectable()
export class DevelopmentPlansService {
  private readonly logger = new Logger(DevelopmentPlansService.name);

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
        status: true,
        user: { select: { id: true, email: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException(
        'Active employee record not found for authenticated user in this organization',
      );
    }
    return employee;
  }

  private isHrOrAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes('ADMIN') || user.roles.includes('HR');
  }

  private isManagerRole(user: AuthenticatedUser): boolean {
    return user.roles.includes('MANAGER') || this.isHrOrAdmin(user);
  }

  /**
   * Check whether actor has authorized supervisory management over target employee
   */
  async isAuthorizedManager(
    actorEmpId: string,
    targetEmpId: string,
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    if (this.isHrOrAdmin(user)) return true;
    if (!user.roles.includes('MANAGER')) return false;

    if (actorEmpId === targetEmpId) return false; // Self-supervision prohibited

    try {
      const teamIds = await this.hierarchy.getTeamMemberIds(actorEmpId, orgId);
      if (teamIds.includes(targetEmpId)) return true;
    } catch (err) {
      this.logger.warn(`Hierarchy lookup error for manager ${actorEmpId}: ${err}`);
    }

    // Also check direct cycle participant manager assignment
    const participant = await this.prisma.reviewCycleParticipant.findFirst({
      where: { employeeId: targetEmpId, managerId: actorEmpId },
    });
    return !!participant;
  }

  /**
   * Get employee development overview (active plans, completed plans, feedback, strengths, improvements)
   */
  async getOverview(
    user: AuthenticatedUser,
    targetEmployeeId?: string,
  ): Promise<DevelopmentPlansOverviewDto> {
    const actorEmp = await this.getEmployeeForUser(user.id, user.organizationId);
    const targetId =
      targetEmployeeId && targetEmployeeId.trim() !== '' ? targetEmployeeId : actorEmp.id;

    const isSelf = actorEmp.id === targetId;
    let canManage = this.isHrOrAdmin(user);

    if (!isSelf) {
      const isManager = await this.isAuthorizedManager(
        actorEmp.id,
        targetId,
        user.organizationId,
        user,
      );
      if (!isManager && !canManage) {
        throw new ForbiddenException(
          'Access denied: You do not have supervisory authority to view this employee’s development plans.',
        );
      }
      canManage = canManage || isManager;
    }

    // Verify target employee exists in org
    const targetEmployee = await this.prisma.employee.findFirst({
      where: { id: targetId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, displayName: true, employeeCode: true },
    });
    if (!targetEmployee) {
      throw new NotFoundException('Target employee not found in organization');
    }

    // Fetch development plans
    const plans = await this.prisma.developmentPlan.findMany({
      where: { employeeId: targetId },
      include: {
        review: {
          select: {
            id: true,
            cycle: { select: { id: true, name: true, code: true } },
          },
        },
        employee: {
          select: { id: true, displayName: true, employeeCode: true },
        },
      },
      orderBy: [{ targetDate: 'asc' }, { createdAt: 'desc' }],
    });

    const activePlans: DevelopmentPlanDto[] = [];
    const completedPlans: DevelopmentPlanDto[] = [];

    for (const p of plans) {
      const dto: DevelopmentPlanDto = {
        id: p.id,
        reviewId: p.reviewId,
        employeeId: p.employeeId,
        employee: {
          id: p.employee.id,
          displayName: p.employee.displayName,
          employeeCode: p.employee.employeeCode,
        },
        objective: p.objective,
        actionSteps: p.actionSteps,
        successCriteria: p.successCriteria,
        targetDate: p.targetDate ? p.targetDate.toISOString() : null,
        status: p.status as any,
        responsiblePerson: p.responsiblePerson,
        trainingNeeds: p.trainingNeeds,
        followUpNotes: p.followUpNotes,
        completionEvidence: p.completionEvidence,
        cycleName: p.review?.cycle?.name,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };

      if (p.status === 'COMPLETED' || p.status === 'CANCELLED') {
        completedPlans.push(dto);
      } else {
        activePlans.push(dto);
      }
    }

    // Fetch recent review for strengths / improvements
    const recentReview = await this.prisma.performanceReview.findFirst({
      where: { employeeId: targetId, organizationId: user.organizationId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        managerStrengths: true,
        managerImprovements: true,
      },
    });

    // Fetch feedbacks with strict role visibility filtering
    let visibilityFilter: FeedbackVisibility[] = [];
    if (this.isHrOrAdmin(user)) {
      visibilityFilter = [
        FeedbackVisibility.EMPLOYEE_VISIBLE,
        FeedbackVisibility.MANAGER_ONLY,
        FeedbackVisibility.HR_CONFIDENTIAL,
      ];
    } else if (canManage) {
      visibilityFilter = [FeedbackVisibility.EMPLOYEE_VISIBLE, FeedbackVisibility.MANAGER_ONLY];
    } else {
      // Employee self-view: strictly EMPLOYEE_VISIBLE
      visibilityFilter = [FeedbackVisibility.EMPLOYEE_VISIBLE];
    }

    const feedbacksRaw = recentReview
      ? await this.prisma.performanceFeedback.findMany({
          where: {
            reviewId: recentReview.id,
            visibility: { in: visibilityFilter },
          },
          include: {
            author: { select: { id: true, displayName: true, employeeCode: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const feedbacks: PerformanceFeedbackDto[] = feedbacksRaw.map((f) => ({
      id: f.id,
      reviewId: f.reviewId,
      authorId: f.authorId,
      author: {
        id: f.author.id,
        displayName: f.author.displayName,
        employeeCode: f.author.employeeCode,
      },
      visibility: f.visibility as any,
      title: f.title,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    }));

    return {
      activePlans,
      completedPlans,
      feedbacks,
      strengthsSummary: recentReview?.managerStrengths || null,
      improvementsSummary: recentReview?.managerImprovements || null,
      canManage,
    };
  }

  /**
   * Create a new development plan
   */
  async createPlan(
    user: AuthenticatedUser,
    dto: CreateDevelopmentPlanDto,
  ): Promise<DevelopmentPlanDto> {
    const actorEmp = await this.getEmployeeForUser(user.id, user.organizationId);

    // Verify review
    const review = await this.prisma.performanceReview.findFirst({
      where: { id: dto.reviewId, organizationId: user.organizationId },
      include: {
        employee: { select: { id: true, displayName: true, employeeCode: true, userId: true } },
        cycle: { select: { id: true, name: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('Performance review record not found in organization');
    }

    const targetEmpId = review.employeeId;

    // Authorization: Only authorized manager, HR, or Admin can create development plans
    const isManager = await this.isAuthorizedManager(
      actorEmp.id,
      targetEmpId,
      user.organizationId,
      user,
    );
    const isHrOrAdmin = this.isHrOrAdmin(user);

    if (!isManager && !isHrOrAdmin) {
      throw new ForbiddenException(
        'Only authorized managers or HR administrators can create and assign employee development plans.',
      );
    }

    // Validate target date
    let parsedTargetDate: Date | null = null;
    if (dto.targetDate) {
      parsedTargetDate = new Date(dto.targetDate);
      if (isNaN(parsedTargetDate.getTime())) {
        throw new BadRequestException('Invalid target date format');
      }
    }

    const created = await this.prisma.developmentPlan.create({
      data: {
        reviewId: review.id,
        employeeId: targetEmpId,
        objective: dto.objective.trim(),
        actionSteps: dto.actionSteps.trim(),
        successCriteria: dto.successCriteria?.trim() || null,
        targetDate: parsedTargetDate,
        responsiblePerson: dto.responsiblePerson?.trim() || actorEmp.displayName,
        trainingNeeds: dto.trainingNeeds?.trim() || null,
        status: dto.status || DevelopmentPlanStatus.PLANNED,
      },
      include: {
        employee: { select: { id: true, displayName: true, employeeCode: true } },
        review: { select: { cycle: { select: { name: true } } } },
      },
    });

    // Record audit trail
    await this.prisma.performanceReviewHistory.create({
      data: {
        reviewId: review.id,
        actorId: actorEmp.id,
        action: 'DEVELOPMENT_PLAN_CREATED',
        changeReason: `Created development objective: "${created.objective}"`,
        newState: {
          planId: created.id,
          objective: created.objective,
          targetDate: created.targetDate,
          status: created.status,
        },
      },
    });

    await this.audit.record({
      action: 'PERFORMANCE_DEVELOPMENT_PLAN_CREATED',
      entity: 'DevelopmentPlan',
      entityId: created.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        reviewId: review.id,
        targetEmployeeId: targetEmpId,
        actorEmployeeId: actorEmp.id,
        objective: created.objective,
      },
    });

    // Send in-app notification to employee
    try {
      await this.notifications.createNotification({
        userId: review.employee.userId,
        organizationId: user.organizationId,
        title: 'New Development Plan Assigned',
        message: `Your manager has assigned a new development plan: "${created.objective}".`,
        type: 'DEVELOPMENT_PLAN',
        link: '/progress?tab=development',
        idempotencyKey: `dev_plan_created_${created.id}`,
      });
    } catch (notifyErr) {
      this.logger.warn(`Failed to send notification for dev plan ${created.id}: ${notifyErr}`);
    }

    return {
      id: created.id,
      reviewId: created.reviewId,
      employeeId: created.employeeId,
      employee: {
        id: created.employee.id,
        displayName: created.employee.displayName,
        employeeCode: created.employee.employeeCode,
      },
      objective: created.objective,
      actionSteps: created.actionSteps,
      successCriteria: created.successCriteria,
      targetDate: created.targetDate ? created.targetDate.toISOString() : null,
      status: created.status as any,
      responsiblePerson: created.responsiblePerson,
      trainingNeeds: created.trainingNeeds,
      followUpNotes: created.followUpNotes,
      completionEvidence: created.completionEvidence,
      cycleName: created.review?.cycle?.name,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * Update development plan (progress, notes, criteria, completion)
   */
  async updatePlan(
    user: AuthenticatedUser,
    planId: string,
    dto: UpdateDevelopmentPlanDto,
  ): Promise<DevelopmentPlanDto> {
    const actorEmp = await this.getEmployeeForUser(user.id, user.organizationId);

    const plan = await this.prisma.developmentPlan.findFirst({
      where: { id: planId },
      include: {
        review: {
          select: {
            id: true,
            organizationId: true,
            managerId: true,
            cycle: { select: { name: true } },
          },
        },
        employee: { select: { id: true, displayName: true, employeeCode: true, userId: true } },
      },
    });

    if (!plan || plan.review.organizationId !== user.organizationId) {
      throw new NotFoundException('Development plan not found in organization');
    }

    const isSelf = actorEmp.id === plan.employeeId;
    const isManager = await this.isAuthorizedManager(
      actorEmp.id,
      plan.employeeId,
      user.organizationId,
      user,
    );
    const isHrOrAdmin = this.isHrOrAdmin(user);

    if (!isSelf && !isManager && !isHrOrAdmin) {
      throw new ForbiddenException(
        'Access denied: You are not authorized to update this development plan.',
      );
    }

    // Role-specific field authorization:
    // If employee is updating their own plan, they can update progress notes, evidence, and status,
    // but CANNOT rewrite assigned objectives or criteria!
    const dataToUpdate: Prisma.DevelopmentPlanUpdateInput = {};

    if (isSelf && !isManager && !isHrOrAdmin) {
      if (
        dto.objective !== undefined ||
        dto.actionSteps !== undefined ||
        dto.successCriteria !== undefined
      ) {
        throw new ForbiddenException(
          'Employees cannot alter manager-assigned development objectives or action steps. You may update progress status, follow-up notes, and completion evidence.',
        );
      }
      if (dto.status !== undefined) dataToUpdate.status = dto.status;
      if (dto.followUpNotes !== undefined) dataToUpdate.followUpNotes = dto.followUpNotes;
      if (dto.completionEvidence !== undefined)
        dataToUpdate.completionEvidence = dto.completionEvidence;
    } else {
      // Manager or HR/Admin updating
      if (dto.objective !== undefined) dataToUpdate.objective = dto.objective.trim();
      if (dto.actionSteps !== undefined) dataToUpdate.actionSteps = dto.actionSteps.trim();
      if (dto.successCriteria !== undefined)
        dataToUpdate.successCriteria = dto.successCriteria?.trim() || null;
      if (dto.status !== undefined) dataToUpdate.status = dto.status;
      if (dto.responsiblePerson !== undefined)
        dataToUpdate.responsiblePerson = dto.responsiblePerson?.trim() || null;
      if (dto.trainingNeeds !== undefined)
        dataToUpdate.trainingNeeds = dto.trainingNeeds?.trim() || null;
      if (dto.followUpNotes !== undefined) dataToUpdate.followUpNotes = dto.followUpNotes;
      if (dto.completionEvidence !== undefined)
        dataToUpdate.completionEvidence = dto.completionEvidence;
      if (dto.targetDate !== undefined) {
        const d = new Date(dto.targetDate);
        if (isNaN(d.getTime())) throw new BadRequestException('Invalid target date');
        dataToUpdate.targetDate = d;
      }
    }

    const updated = await this.prisma.developmentPlan.update({
      where: { id: planId },
      data: dataToUpdate,
      include: {
        employee: { select: { id: true, displayName: true, employeeCode: true } },
        review: { select: { cycle: { select: { name: true } } } },
      },
    });

    // Record audit trail
    await this.prisma.performanceReviewHistory.create({
      data: {
        reviewId: plan.reviewId,
        actorId: actorEmp.id,
        action: 'DEVELOPMENT_PLAN_UPDATED',
        changeReason: `Development plan ${plan.id} updated by ${actorEmp.displayName}`,
        previousState: {
          status: plan.status,
          targetDate: plan.targetDate,
          followUpNotes: plan.followUpNotes,
        },
        newState: {
          status: updated.status,
          targetDate: updated.targetDate,
          followUpNotes: updated.followUpNotes,
          completionEvidence: updated.completionEvidence,
        },
      },
    });

    await this.audit.record({
      action: 'PERFORMANCE_DEVELOPMENT_PLAN_UPDATED',
      entity: 'DevelopmentPlan',
      entityId: updated.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        planId: updated.id,
        status: updated.status,
        actorEmployeeId: actorEmp.id,
      },
    });

    return {
      id: updated.id,
      reviewId: updated.reviewId,
      employeeId: updated.employeeId,
      employee: {
        id: updated.employee.id,
        displayName: updated.employee.displayName,
        employeeCode: updated.employee.employeeCode,
      },
      objective: updated.objective,
      actionSteps: updated.actionSteps,
      successCriteria: updated.successCriteria,
      targetDate: updated.targetDate ? updated.targetDate.toISOString() : null,
      status: updated.status as any,
      responsiblePerson: updated.responsiblePerson,
      trainingNeeds: updated.trainingNeeds,
      followUpNotes: updated.followUpNotes,
      completionEvidence: updated.completionEvidence,
      cycleName: updated.review?.cycle?.name,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Delete development plan (Manager or HR/Admin only)
   */
  async deletePlan(user: AuthenticatedUser, planId: string): Promise<{ success: boolean }> {
    const actorEmp = await this.getEmployeeForUser(user.id, user.organizationId);

    const plan = await this.prisma.developmentPlan.findFirst({
      where: { id: planId },
      include: {
        review: { select: { id: true, organizationId: true } },
        employee: { select: { id: true, displayName: true } },
      },
    });

    if (!plan || plan.review.organizationId !== user.organizationId) {
      throw new NotFoundException('Development plan not found');
    }

    const isManager = await this.isAuthorizedManager(
      actorEmp.id,
      plan.employeeId,
      user.organizationId,
      user,
    );
    const isHrOrAdmin = this.isHrOrAdmin(user);

    if (!isManager && !isHrOrAdmin) {
      throw new ForbiddenException('Only authorized managers or HR can delete development plans.');
    }

    await this.prisma.developmentPlan.delete({ where: { id: planId } });

    await this.prisma.performanceReviewHistory.create({
      data: {
        reviewId: plan.reviewId,
        actorId: actorEmp.id,
        action: 'DEVELOPMENT_PLAN_DELETED',
        changeReason: `Deleted plan "${plan.objective}"`,
        previousState: { planId: plan.id, objective: plan.objective },
      },
    });

    await this.audit.record({
      action: 'PERFORMANCE_DEVELOPMENT_PLAN_DELETED',
      entity: 'DevelopmentPlan',
      entityId: planId,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        planId,
        actorEmployeeId: actorEmp.id,
      },
    });

    return { success: true };
  }

  /**
   * Add structured feedback (with strict visibility enforcement)
   */
  async addFeedback(
    user: AuthenticatedUser,
    dto: CreateFeedbackDto,
  ): Promise<PerformanceFeedbackDto> {
    const actorEmp = await this.getEmployeeForUser(user.id, user.organizationId);

    const review = await this.prisma.performanceReview.findFirst({
      where: { id: dto.reviewId, organizationId: user.organizationId },
      include: {
        employee: { select: { id: true, displayName: true, employeeCode: true, userId: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('Performance review record not found');
    }

    const targetEmpId = review.employeeId;
    const isManager = await this.isAuthorizedManager(
      actorEmp.id,
      targetEmpId,
      user.organizationId,
      user,
    );
    const isHrOrAdmin = this.isHrOrAdmin(user);

    if (!isManager && !isHrOrAdmin) {
      throw new ForbiddenException(
        'Only authorized managers or HR administrators can create performance feedback.',
      );
    }

    const visibility = dto.visibility || FeedbackVisibility.EMPLOYEE_VISIBLE;

    // Strict visibility authorization:
    // HR_CONFIDENTIAL is strictly reserved for HR and Admin!
    if (visibility === FeedbackVisibility.HR_CONFIDENTIAL && !isHrOrAdmin) {
      throw new ForbiddenException('Only HR administrators can create confidential HR-only notes.');
    }

    const created = await this.prisma.performanceFeedback.create({
      data: {
        reviewId: review.id,
        authorId: actorEmp.id,
        visibility,
        title: dto.title.trim(),
        content: dto.content.trim(),
      },
      include: {
        author: { select: { id: true, displayName: true, employeeCode: true } },
      },
    });

    await this.prisma.performanceReviewHistory.create({
      data: {
        reviewId: review.id,
        actorId: actorEmp.id,
        action: 'PERFORMANCE_FEEDBACK_ADDED',
        changeReason: `Added feedback note: "${created.title}" [${created.visibility}]`,
        newState: {
          feedbackId: created.id,
          visibility: created.visibility,
          title: created.title,
        },
      },
    });

    await this.audit.record({
      action: 'PERFORMANCE_FEEDBACK_ADDED',
      entity: 'PerformanceFeedback',
      entityId: created.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        reviewId: review.id,
        visibility,
        title: created.title,
        actorEmployeeId: actorEmp.id,
      },
    });

    // Notify employee if feedback is employee-visible
    if (visibility === FeedbackVisibility.EMPLOYEE_VISIBLE) {
      try {
        await this.notifications.createNotification({
          userId: review.employee.userId,
          organizationId: user.organizationId,
          title: 'New Performance Feedback Received',
          message: `Your manager provided new feedback: "${created.title}".`,
          type: 'PERFORMANCE_FEEDBACK',
          link: '/progress?tab=development',
          idempotencyKey: `feedback_added_${created.id}`,
        });
      } catch (notifyErr) {
        this.logger.warn(`Failed to send notification for feedback ${created.id}: ${notifyErr}`);
      }
    }

    return {
      id: created.id,
      reviewId: created.reviewId,
      authorId: created.authorId,
      author: {
        id: created.author.id,
        displayName: created.author.displayName,
        employeeCode: created.author.employeeCode,
      },
      visibility: created.visibility as any,
      title: created.title,
      content: created.content,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Delete feedback (Author, Manager, or HR/Admin only)
   */
  async deleteFeedback(user: AuthenticatedUser, feedbackId: string): Promise<{ success: boolean }> {
    const actorEmp = await this.getEmployeeForUser(user.id, user.organizationId);

    const feedback = await this.prisma.performanceFeedback.findFirst({
      where: { id: feedbackId },
      include: {
        review: { select: { id: true, organizationId: true, employeeId: true } },
      },
    });

    if (!feedback || feedback.review.organizationId !== user.organizationId) {
      throw new NotFoundException('Feedback record not found');
    }

    const isHrOrAdmin = this.isHrOrAdmin(user);
    const isAuthor = feedback.authorId === actorEmp.id;

    if (feedback.visibility === FeedbackVisibility.HR_CONFIDENTIAL && !isHrOrAdmin) {
      throw new ForbiddenException('Only HR administrators can manage confidential HR notes.');
    }

    if (!isAuthor && !isHrOrAdmin) {
      throw new ForbiddenException('You are not authorized to delete this feedback entry.');
    }

    await this.prisma.performanceFeedback.delete({ where: { id: feedbackId } });

    await this.prisma.performanceReviewHistory.create({
      data: {
        reviewId: feedback.reviewId,
        actorId: actorEmp.id,
        action: 'PERFORMANCE_FEEDBACK_DELETED',
        changeReason: `Deleted feedback "${feedback.title}"`,
      },
    });

    await this.audit.record({
      action: 'PERFORMANCE_FEEDBACK_DELETED',
      entity: 'PerformanceFeedback',
      entityId: feedbackId,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        feedbackId,
        title: feedback.title,
        actorEmployeeId: actorEmp.id,
      },
    });

    return { success: true };
  }

  /**
   * Send a progress reminder for an upcoming or overdue development plan
   */
  async sendReminder(
    user: AuthenticatedUser,
    planId: string,
  ): Promise<{ success: boolean; message: string }> {
    const actorEmp = await this.getEmployeeForUser(user.id, user.organizationId);

    const plan = await this.prisma.developmentPlan.findFirst({
      where: { id: planId },
      include: {
        review: { select: { organizationId: true } },
        employee: { select: { id: true, displayName: true, userId: true } },
      },
    });

    if (!plan || plan.review.organizationId !== user.organizationId) {
      throw new NotFoundException('Development plan not found');
    }

    const isManager = await this.isAuthorizedManager(
      actorEmp.id,
      plan.employeeId,
      user.organizationId,
      user,
    );
    const isHrOrAdmin = this.isHrOrAdmin(user);

    if (!isManager && !isHrOrAdmin) {
      throw new ForbiddenException(
        'Only authorized managers or HR can trigger development reminders.',
      );
    }

    await this.notifications.createNotification({
      userId: plan.employee.userId,
      organizationId: user.organizationId,
      title: 'Action Item Reminder: Development Objective',
      message: `Friendly reminder to update progress on your objective: "${plan.objective}".`,
      type: 'DEVELOPMENT_REMINDER',
      link: '/progress?tab=development',
      idempotencyKey: `dev_reminder_${plan.id}_${new Date().toISOString().slice(0, 10)}`,
    });

    return {
      success: true,
      message: `Reminder sent to ${plan.employee.displayName}`,
    };
  }
}
