import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { CreateReviewCycleDto } from './dto/create-review-cycle.dto';
import { UpdateReviewCycleDto } from './dto/update-review-cycle.dto';
import { TransitionCycleStageDto } from './dto/transition-cycle.dto';
import { ReopenCycleDto } from './dto/reopen-cycle.dto';
import { ReassignManagerDto, ExemptParticipantDto } from './dto/manage-participant.dto';
import { ReviewCycleStatus, ParticipantStatus, Prisma } from '@prisma/client';

@Injectable()
export class ReviewCyclesService {
  private readonly logger = new Logger(ReviewCyclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private isHrOrAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes('ADMIN') || user.roles.includes('HR');
  }

  private assertHrOrAdmin(user: AuthenticatedUser): void {
    if (!this.isHrOrAdmin(user)) {
      throw new ForbiddenException(
        'Only Human Resources or System Administrators can manage performance review cycles',
      );
    }
  }

  /**
   * Helper: Validates chronological sequence of dates and deadlines
   */
  private validateCycleDates(
    startDateStr: string,
    endDateStr: string,
    deadlines?: {
      goalSetting?: string | null;
      selfAssessment?: string | null;
      managerReview?: string | null;
      finalization?: string | null;
    },
  ) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (end <= start) {
      throw new BadRequestException('Review cycle end date must be strictly after start date');
    }

    if (deadlines) {
      const { goalSetting, selfAssessment, managerReview, finalization } = deadlines;

      if (goalSetting) {
        const d = new Date(goalSetting);
        if (d < start || d > end) {
          throw new BadRequestException(
            'Goal-setting deadline must be within the review cycle evaluation window',
          );
        }
      }

      if (selfAssessment) {
        const d = new Date(selfAssessment);
        if (d < start || d > end) {
          throw new BadRequestException(
            'Self-assessment deadline must be within the review cycle evaluation window',
          );
        }
        if (goalSetting && d < new Date(goalSetting)) {
          throw new BadRequestException(
            'Self-assessment deadline cannot be earlier than goal-setting deadline',
          );
        }
      }

      if (managerReview) {
        const d = new Date(managerReview);
        if (d < start || d > end) {
          throw new BadRequestException(
            'Manager-review deadline must be within the review cycle evaluation window',
          );
        }
        if (selfAssessment && d < new Date(selfAssessment)) {
          throw new BadRequestException(
            'Manager-review deadline cannot be earlier than self-assessment deadline',
          );
        }
      }

      if (finalization) {
        const d = new Date(finalization);
        if (managerReview && d < new Date(managerReview)) {
          throw new BadRequestException(
            'Finalization deadline cannot be earlier than manager-review deadline',
          );
        }
      }
    }
  }

  /**
   * 1. CREATE REVIEW CYCLE
   */
  async createCycle(user: AuthenticatedUser, dto: CreateReviewCycleDto) {
    this.assertHrOrAdmin(user);

    // Validate dates
    this.validateCycleDates(dto.startDate, dto.endDate, {
      goalSetting: dto.goalSettingDeadline,
      selfAssessment: dto.selfAssessmentDeadline,
      managerReview: dto.managerReviewDeadline,
      finalization: dto.finalizationDeadline,
    });

    // Validate weights sum to 100%
    const goalsWeight = dto.goalsWeightPercentage ?? 70.0;
    const compsWeight = dto.competenciesWeightPercentage ?? 30.0;
    if (Math.round((goalsWeight + compsWeight) * 100) / 100 !== 100.0) {
      throw new BadRequestException(
        `Goal and Competency weights must sum exactly to 100% (Current sum: ${goalsWeight + compsWeight}%)`,
      );
    }

    // Check code uniqueness within org
    const existing = await this.prisma.reviewCycle.findFirst({
      where: { organizationId: user.organizationId, code: dto.code.trim().toUpperCase() },
    });
    if (existing) {
      throw new BadRequestException(
        `Review cycle with code "${dto.code.trim().toUpperCase()}" already exists in this organization`,
      );
    }

    const cycle = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reviewCycle.create({
        data: {
          organizationId: user.organizationId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          description: dto.description?.trim() || null,
          type: dto.type,
          status: ReviewCycleStatus.DRAFT,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          goalSettingDeadline: dto.goalSettingDeadline ? new Date(dto.goalSettingDeadline) : null,
          selfAssessmentDeadline: dto.selfAssessmentDeadline
            ? new Date(dto.selfAssessmentDeadline)
            : null,
          managerReviewDeadline: dto.managerReviewDeadline
            ? new Date(dto.managerReviewDeadline)
            : null,
          finalizationDeadline: dto.finalizationDeadline
            ? new Date(dto.finalizationDeadline)
            : null,
          goalsWeightPercentage: goalsWeight,
          competenciesWeightPercentage: compsWeight,
          allowEmployeeGoalCreation: dto.allowEmployeeGoalCreation ?? true,
          requireGoalApproval: dto.requireGoalApproval ?? true,
          ratingScaleMax: dto.ratingScaleMax ?? 5,
          eligibleDepartmentIds: dto.eligibleDepartmentIds
            ? (dto.eligibleDepartmentIds as any)
            : null,
          eligibleBranchIds: dto.eligibleBranchIds ? (dto.eligibleBranchIds as any) : null,
          eligibleEmploymentStatuses: dto.eligibleEmploymentStatuses
            ? (dto.eligibleEmploymentStatuses as any)
            : null,
          joiningDateCutoff: dto.joiningDateCutoff ? new Date(dto.joiningDateCutoff) : null,
          ratingScaleRubric: dto.ratingScaleRubric ? (dto.ratingScaleRubric as any) : null,
          instructions: dto.instructions?.trim() || null,
          templateVersion: 1,
        },
      });

      // Record History
      await tx.reviewCycleHistory.create({
        data: {
          cycleId: created.id,
          actorId: user.id,
          action: 'CREATED',
          changeReason: 'Review cycle created in DRAFT status',
          newState: {
            name: created.name,
            code: created.code,
            type: created.type,
            status: created.status,
            goalsWeight: created.goalsWeightPercentage,
            competenciesWeight: created.competenciesWeightPercentage,
          },
        },
      });

      return created;
    });

    await this.audit.record({
      action: 'REVIEW_CYCLE_CREATED',
      entity: 'ReviewCycle',
      entityId: cycle.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { name: cycle.name, code: cycle.code, type: cycle.type },
    });

    // Auto-enroll if requested
    if (dto.autoEnroll) {
      await this.enrollParticipants(user, cycle.id);
    }

    return cycle;
  }

  /**
   * 2. UPDATE REVIEW CYCLE
   */
  async updateCycle(user: AuthenticatedUser, cycleId: string, dto: UpdateReviewCycleDto) {
    this.assertHrOrAdmin(user);

    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: cycleId, organizationId: user.organizationId },
    });
    if (!cycle) {
      throw new NotFoundException(`Review cycle #${cycleId} not found`);
    }

    if (cycle.status === 'ARCHIVED') {
      throw new BadRequestException('Archived review cycles cannot be modified');
    }

    if (cycle.status === 'FINALIZED' && !cycle.reopenedAt) {
      throw new BadRequestException(
        'Cannot modify a finalized review cycle without using the explicit reopening workflow',
      );
    }

    // Date validation
    const effectiveStart = dto.startDate || cycle.startDate.toISOString();
    const effectiveEnd = dto.endDate || cycle.endDate.toISOString();
    this.validateCycleDates(effectiveStart, effectiveEnd, {
      goalSetting: dto.goalSettingDeadline ?? cycle.goalSettingDeadline?.toISOString(),
      selfAssessment: dto.selfAssessmentDeadline ?? cycle.selfAssessmentDeadline?.toISOString(),
      managerReview: dto.managerReviewDeadline ?? cycle.managerReviewDeadline?.toISOString(),
      finalization: dto.finalizationDeadline ?? cycle.finalizationDeadline?.toISOString(),
    });

    // Weight validation if either changed
    const newGoalsWeight = dto.goalsWeightPercentage ?? cycle.goalsWeightPercentage;
    const newCompsWeight = dto.competenciesWeightPercentage ?? cycle.competenciesWeightPercentage;
    if (Math.round((newGoalsWeight + newCompsWeight) * 100) / 100 !== 100.0) {
      throw new BadRequestException(
        `Goal and Competency weights must sum exactly to 100% (Sum: ${newGoalsWeight + newCompsWeight}%)`,
      );
    }

    // Determine if template version needs incrementing (preserves historical reviews)
    const templateChanged =
      (dto.goalsWeightPercentage !== undefined &&
        dto.goalsWeightPercentage !== cycle.goalsWeightPercentage) ||
      (dto.competenciesWeightPercentage !== undefined &&
        dto.competenciesWeightPercentage !== cycle.competenciesWeightPercentage) ||
      (dto.ratingScaleMax !== undefined && dto.ratingScaleMax !== cycle.ratingScaleMax) ||
      dto.ratingScaleRubric !== undefined;

    const newTemplateVersion = templateChanged ? cycle.templateVersion + 1 : cycle.templateVersion;

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.reviewCycle.update({
        where: { id: cycleId },
        data: {
          name: dto.name?.trim() ?? cycle.name,
          description:
            dto.description !== undefined ? dto.description.trim() || null : cycle.description,
          startDate: dto.startDate ? new Date(dto.startDate) : cycle.startDate,
          endDate: dto.endDate ? new Date(dto.endDate) : cycle.endDate,
          goalSettingDeadline:
            dto.goalSettingDeadline !== undefined
              ? dto.goalSettingDeadline
                ? new Date(dto.goalSettingDeadline)
                : null
              : cycle.goalSettingDeadline,
          selfAssessmentDeadline:
            dto.selfAssessmentDeadline !== undefined
              ? dto.selfAssessmentDeadline
                ? new Date(dto.selfAssessmentDeadline)
                : null
              : cycle.selfAssessmentDeadline,
          managerReviewDeadline:
            dto.managerReviewDeadline !== undefined
              ? dto.managerReviewDeadline
                ? new Date(dto.managerReviewDeadline)
                : null
              : cycle.managerReviewDeadline,
          finalizationDeadline:
            dto.finalizationDeadline !== undefined
              ? dto.finalizationDeadline
                ? new Date(dto.finalizationDeadline)
                : null
              : cycle.finalizationDeadline,
          goalsWeightPercentage: newGoalsWeight,
          competenciesWeightPercentage: newCompsWeight,
          allowEmployeeGoalCreation:
            dto.allowEmployeeGoalCreation ?? cycle.allowEmployeeGoalCreation,
          requireGoalApproval: dto.requireGoalApproval ?? cycle.requireGoalApproval,
          ratingScaleMax: dto.ratingScaleMax ?? cycle.ratingScaleMax,
          eligibleDepartmentIds:
            dto.eligibleDepartmentIds !== undefined
              ? (dto.eligibleDepartmentIds as any)
              : cycle.eligibleDepartmentIds,
          eligibleBranchIds:
            dto.eligibleBranchIds !== undefined
              ? (dto.eligibleBranchIds as any)
              : cycle.eligibleBranchIds,
          eligibleEmploymentStatuses:
            dto.eligibleEmploymentStatuses !== undefined
              ? (dto.eligibleEmploymentStatuses as any)
              : cycle.eligibleEmploymentStatuses,
          joiningDateCutoff:
            dto.joiningDateCutoff !== undefined
              ? dto.joiningDateCutoff
                ? new Date(dto.joiningDateCutoff)
                : null
              : cycle.joiningDateCutoff,
          ratingScaleRubric:
            dto.ratingScaleRubric !== undefined
              ? (dto.ratingScaleRubric as any)
              : cycle.ratingScaleRubric,
          instructions:
            dto.instructions !== undefined ? dto.instructions.trim() || null : cycle.instructions,
          templateVersion: newTemplateVersion,
        },
      });

      await tx.reviewCycleHistory.create({
        data: {
          cycleId,
          actorId: user.id,
          action: 'UPDATED',
          changeReason:
            dto.changeReason ||
            (templateChanged ? 'Template and policy version bumped' : 'Cycle settings updated'),
          previousState: {
            name: cycle.name,
            templateVersion: cycle.templateVersion,
            goalsWeight: cycle.goalsWeightPercentage,
            competenciesWeight: cycle.competenciesWeightPercentage,
          },
          newState: {
            name: res.name,
            templateVersion: res.templateVersion,
            goalsWeight: res.goalsWeightPercentage,
            competenciesWeight: res.competenciesWeightPercentage,
          },
        },
      });

      return res;
    });

    await this.audit.record({
      action: 'REVIEW_CYCLE_UPDATED',
      entity: 'ReviewCycle',
      entityId: cycle.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { changes: dto, newTemplateVersion },
    });

    return updated;
  }

  /**
   * 3. PREVIEW ELIGIBILITY
   */
  async previewEligibility(user: AuthenticatedUser, cycleId: string) {
    this.assertHrOrAdmin(user);

    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: cycleId, organizationId: user.organizationId },
    });
    if (!cycle) {
      throw new NotFoundException(`Review cycle #${cycleId} not found`);
    }

    const where: Prisma.EmployeeWhereInput = {
      organizationId: user.organizationId,
      isActive: true,
      deletedAt: null,
    };

    // Department filter
    const deptIds = cycle.eligibleDepartmentIds as string[] | null;
    if (deptIds && deptIds.length > 0) {
      where.employment = {
        departmentId: { in: deptIds },
      };
    }

    // Branch filter
    const branchIds = cycle.eligibleBranchIds as string[] | null;
    if (branchIds && branchIds.length > 0) {
      where.employment = {
        ...(where.employment ? (where.employment as any) : {}),
        branchId: { in: branchIds },
      };
    }

    // Employment Status filter
    const statuses = cycle.eligibleEmploymentStatuses as string[] | null;
    if (statuses && statuses.length > 0) {
      where.status = { in: statuses as any };
    }

    // Joining date cutoff
    if (cycle.joiningDateCutoff) {
      where.joiningDate = { lte: cycle.joiningDateCutoff };
    }

    const [eligibleEmployees, enrolledParticipants] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: {
          id: true,
          employeeCode: true,
          displayName: true,
          joiningDate: true,
          managerId: true,
          employment: {
            select: {
              department: { select: { name: true } },
              designation: { select: { title: true } },
              manager: { select: { displayName: true } },
            },
          },
        },
      }),
      this.prisma.reviewCycleParticipant.findMany({
        where: { cycleId },
        select: { employeeId: true },
      }),
    ]);

    const enrolledSet = new Set(enrolledParticipants.map((p) => p.employeeId));
    const totalEligible = eligibleEmployees.length;
    const alreadyEnrolled = eligibleEmployees.filter((e) => enrolledSet.has(e.id)).length;
    const newlyEligible = totalEligible - alreadyEnrolled;

    const sampleEmployees = eligibleEmployees.slice(0, 50).map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      displayName: e.displayName,
      department: e.employment?.department?.name || null,
      designation: e.employment?.designation?.title || null,
      manager: e.employment?.manager?.displayName || null,
      joiningDate: e.joiningDate ? e.joiningDate.toISOString() : null,
    }));

    return {
      totalEligible,
      alreadyEnrolled,
      newlyEligible,
      sampleEmployees,
    };
  }

  /**
   * 4. ENROLL ELIGIBLE PARTICIPANTS
   */
  async enrollParticipants(user: AuthenticatedUser, cycleId: string) {
    this.assertHrOrAdmin(user);

    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: cycleId, organizationId: user.organizationId },
    });
    if (!cycle) {
      throw new NotFoundException(`Review cycle #${cycleId} not found`);
    }

    if (cycle.status === 'FINALIZED' || cycle.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Cannot enroll participants into a finalized or archived cycle',
      );
    }

    const preview = await this.previewEligibility(user, cycleId);

    // Build immutable versioned policy snapshot
    const policySnapshot = {
      templateVersion: cycle.templateVersion,
      goalsWeightPercentage: cycle.goalsWeightPercentage,
      competenciesWeightPercentage: cycle.competenciesWeightPercentage,
      ratingScaleMax: cycle.ratingScaleMax,
      ratingScaleRubric: cycle.ratingScaleRubric,
      instructions: cycle.instructions,
      deadlines: {
        goalSetting: cycle.goalSettingDeadline,
        selfAssessment: cycle.selfAssessmentDeadline,
        managerReview: cycle.managerReviewDeadline,
        finalization: cycle.finalizationDeadline,
      },
    };

    // Find all full eligible employee records with manager and department info
    const eligibleEmployees = await this.prisma.employee.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        deletedAt: null,
        ...(cycle.eligibleDepartmentIds
          ? { employment: { departmentId: { in: cycle.eligibleDepartmentIds as string[] } } }
          : {}),
        ...(cycle.joiningDateCutoff ? { joiningDate: { lte: cycle.joiningDateCutoff } } : {}),
      },
      select: {
        id: true,
        managerId: true,
        employment: {
          select: {
            managerId: true,
            departmentId: true,
            branchId: true,
            designationId: true,
          },
        },
      },
    });

    const enrolled = await this.prisma.$transaction(async (tx) => {
      let newlyCreated = 0;

      for (const emp of eligibleEmployees) {
        const mgrId = emp.managerId || emp.employment?.managerId || null;

        const record = await tx.reviewCycleParticipant.upsert({
          where: {
            cycleId_employeeId: {
              cycleId,
              employeeId: emp.id,
            },
          },
          create: {
            cycleId,
            employeeId: emp.id,
            managerId: mgrId,
            departmentId: emp.employment?.departmentId || null,
            branchId: emp.employment?.branchId || null,
            designationId: emp.employment?.designationId || null,
            status: ParticipantStatus.ENROLLED,
            policySnapshot,
          },
          update: {
            // Preserve existing enrollment status and updates
            policySnapshot,
          },
        });

        newlyCreated++;
      }

      await tx.reviewCycleHistory.create({
        data: {
          cycleId,
          actorId: user.id,
          action: 'ENROLLMENT_COMPLETED',
          changeReason: `Enrolled ${newlyCreated} eligible employees with policy snapshot v${cycle.templateVersion}`,
          newState: { totalEnrolled: newlyCreated },
        },
      });

      return newlyCreated;
    });

    await this.audit.record({
      action: 'REVIEW_CYCLE_ENROLLED',
      entity: 'ReviewCycle',
      entityId: cycle.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { count: enrolled },
    });

    return {
      success: true,
      enrolledCount: enrolled,
      message: `Successfully enrolled ${enrolled} participants into ${cycle.name}`,
    };
  }

  /**
   * 5. REASSIGN PARTICIPANT MANAGER
   */
  async reassignManager(
    user: AuthenticatedUser,
    cycleId: string,
    participantId: string,
    dto: ReassignManagerDto,
  ) {
    this.assertHrOrAdmin(user);

    const participant = await this.prisma.reviewCycleParticipant.findFirst({
      where: { id: participantId, cycleId },
      include: {
        employee: { select: { id: true, displayName: true } },
      },
    });

    if (!participant) {
      throw new NotFoundException(`Participant #${participantId} not found in this cycle`);
    }

    const newManager = await this.prisma.employee.findFirst({
      where: { id: dto.newManagerId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, displayName: true },
    });

    if (!newManager) {
      throw new NotFoundException(`New manager #${dto.newManagerId} not found`);
    }

    if (newManager.id === participant.employeeId) {
      throw new BadRequestException(
        'An employee cannot be assigned as their own evaluating manager',
      );
    }

    const previousManagerId = participant.managerId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.reviewCycleParticipant.update({
        where: { id: participantId },
        data: {
          managerId: newManager.id,
          previousManagerId,
          managerReassignedAt: new Date(),
          reassignmentReason: dto.reason.trim(),
        },
      });

      // If a review record already exists, also update its manager relation
      await tx.performanceReview.updateMany({
        where: { cycleId, employeeId: participant.employeeId },
        data: { managerId: newManager.id },
      });

      await tx.reviewCycleHistory.create({
        data: {
          cycleId,
          actorId: user.id,
          action: 'MANAGER_REASSIGNED',
          changeReason: `Reassigned evaluator for ${participant.employee?.displayName}: ${dto.reason.trim()}`,
          previousState: { managerId: previousManagerId },
          newState: { managerId: newManager.id },
        },
      });

      return res;
    });

    await this.audit.record({
      action: 'CYCLE_PARTICIPANT_MANAGER_REASSIGNED',
      entity: 'ReviewCycleParticipant',
      entityId: participant.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        employeeId: participant.employeeId,
        previousManagerId,
        newManagerId: newManager.id,
        reason: dto.reason,
      },
    });

    return updated;
  }

  /**
   * 6. EXEMPT PARTICIPANT (Leave of Absence, Sabbatical, Sickness)
   */
  async exemptParticipant(
    user: AuthenticatedUser,
    cycleId: string,
    participantId: string,
    dto: ExemptParticipantDto,
  ) {
    this.assertHrOrAdmin(user);

    const participant = await this.prisma.reviewCycleParticipant.findFirst({
      where: { id: participantId, cycleId },
    });
    if (!participant) {
      throw new NotFoundException(`Participant #${participantId} not found in this cycle`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.reviewCycleParticipant.update({
        where: { id: participantId },
        data: {
          status: ParticipantStatus.EXEMPTED,
          exemptionReason: dto.exemptionReason.trim(),
        },
      });

      await tx.reviewCycleHistory.create({
        data: {
          cycleId,
          actorId: user.id,
          action: 'PARTICIPANT_EXEMPTED',
          changeReason: `Exempted employee from cycle: ${dto.exemptionReason.trim()}`,
          newState: { status: ParticipantStatus.EXEMPTED, reason: dto.exemptionReason },
        },
      });

      return res;
    });

    await this.audit.record({
      action: 'CYCLE_PARTICIPANT_EXEMPTED',
      entity: 'ReviewCycleParticipant',
      entityId: participant.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { reason: dto.exemptionReason },
    });

    return updated;
  }

  /**
   * 7. TRANSITION WORKFLOW STAGE
   */
  async transitionStage(user: AuthenticatedUser, cycleId: string, dto: TransitionCycleStageDto) {
    this.assertHrOrAdmin(user);

    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: cycleId, organizationId: user.organizationId },
    });
    if (!cycle) {
      throw new NotFoundException(`Review cycle #${cycleId} not found`);
    }

    const permittedSequence: Record<ReviewCycleStatus, ReviewCycleStatus[]> = {
      [ReviewCycleStatus.DRAFT]: [
        ReviewCycleStatus.GOAL_SETTING,
        ReviewCycleStatus.SELF_ASSESSMENT,
      ],
      [ReviewCycleStatus.GOAL_SETTING]: [ReviewCycleStatus.SELF_ASSESSMENT],
      [ReviewCycleStatus.SELF_ASSESSMENT]: [ReviewCycleStatus.MANAGER_REVIEW],
      [ReviewCycleStatus.MANAGER_REVIEW]: [
        ReviewCycleStatus.HR_CALIBRATION,
        ReviewCycleStatus.FINALIZED,
      ],
      [ReviewCycleStatus.HR_CALIBRATION]: [ReviewCycleStatus.FINALIZED],
      [ReviewCycleStatus.FINALIZED]: [ReviewCycleStatus.ARCHIVED],
      [ReviewCycleStatus.ARCHIVED]: [],
    };

    const allowed = permittedSequence[cycle.status] || [];
    if (!allowed.includes(dto.targetStatus)) {
      throw new BadRequestException(
        `Invalid workflow stage transition: Cannot move from ${cycle.status} to ${dto.targetStatus}`,
      );
    }

    // Check prerequisites
    if (
      dto.targetStatus === ReviewCycleStatus.SELF_ASSESSMENT ||
      dto.targetStatus === ReviewCycleStatus.MANAGER_REVIEW
    ) {
      const participantCount = await this.prisma.reviewCycleParticipant.count({
        where: { cycleId, status: ParticipantStatus.ENROLLED },
      });
      if (participantCount === 0) {
        throw new BadRequestException(
          'Cannot advance review cycle stage: Zero eligible participants are enrolled',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.reviewCycle.update({
        where: { id: cycleId },
        data: { status: dto.targetStatus },
      });

      await tx.reviewCycleHistory.create({
        data: {
          cycleId,
          actorId: user.id,
          action: 'STAGE_TRANSITIONED',
          changeReason:
            dto.reason || `Advanced workflow stage from ${cycle.status} to ${dto.targetStatus}`,
          previousState: { status: cycle.status },
          newState: { status: dto.targetStatus },
        },
      });

      return res;
    });

    await this.audit.record({
      action: 'CYCLE_STAGE_TRANSITIONED',
      entity: 'ReviewCycle',
      entityId: cycle.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { from: cycle.status, to: dto.targetStatus, reason: dto.reason },
    });

    return updated;
  }

  /**
   * 8. REOPEN CYCLE (Audited Workflow)
   */
  async reopenCycle(user: AuthenticatedUser, cycleId: string, dto: ReopenCycleDto) {
    this.assertHrOrAdmin(user);

    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: cycleId, organizationId: user.organizationId },
    });
    if (!cycle) {
      throw new NotFoundException(`Review cycle #${cycleId} not found`);
    }

    if (cycle.status !== ReviewCycleStatus.FINALIZED) {
      throw new BadRequestException(
        `Only finalized review cycles can be reopened (Current status: ${cycle.status})`,
      );
    }

    if (!dto.reopenReason || !dto.reopenReason.trim()) {
      throw new BadRequestException(
        'A formal justification reason is required to reopen a finalized cycle',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.reviewCycle.update({
        where: { id: cycleId },
        data: {
          status: ReviewCycleStatus.HR_CALIBRATION,
          reopenedAt: new Date(),
          reopenedById: user.id,
          reopenReason: dto.reopenReason.trim(),
          ...(dto.extendedFinalizationDeadline
            ? { finalizationDeadline: new Date(dto.extendedFinalizationDeadline) }
            : {}),
        },
      });

      await tx.reviewCycleHistory.create({
        data: {
          cycleId,
          actorId: user.id,
          action: 'REOPENED',
          changeReason: `Reopened finalized cycle: ${dto.reopenReason.trim()}`,
          previousState: { status: ReviewCycleStatus.FINALIZED },
          newState: {
            status: ReviewCycleStatus.HR_CALIBRATION,
            reopenReason: dto.reopenReason.trim(),
          },
        },
      });

      return res;
    });

    await this.audit.record({
      action: 'CYCLE_REOPENED',
      entity: 'ReviewCycle',
      entityId: cycle.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { reason: dto.reopenReason },
    });

    return updated;
  }

  /**
   * 9. GET CYCLES
   */
  async getCycles(user: AuthenticatedUser, query?: { status?: string; search?: string }) {
    const where: Prisma.ReviewCycleWhereInput = {
      organizationId: user.organizationId,
      ...(query?.status && query.status !== 'ALL'
        ? { status: query.status as ReviewCycleStatus }
        : {}),
      ...(query?.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.reviewCycle.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            goals: true,
            reviews: true,
            participants: true,
          },
        },
      },
    });
  }

  /**
   * 10. GET CYCLE BY ID
   */
  async getCycleById(user: AuthenticatedUser, cycleId: string) {
    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: cycleId, organizationId: user.organizationId },
      include: {
        competencies: true,
        history: {
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        _count: {
          select: {
            goals: true,
            reviews: true,
            participants: true,
          },
        },
      },
    });

    if (!cycle) {
      throw new NotFoundException(`Review cycle #${cycleId} not found`);
    }

    return cycle;
  }

  /**
   * 11. GET CYCLE PARTICIPANTS
   */
  async getCycleParticipants(
    user: AuthenticatedUser,
    cycleId: string,
    query?: { status?: string; search?: string; page?: number; limit?: number },
  ) {
    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: cycleId, organizationId: user.organizationId },
    });
    if (!cycle) {
      throw new NotFoundException(`Review cycle #${cycleId} not found`);
    }

    const where: Prisma.ReviewCycleParticipantWhereInput = {
      cycleId,
      ...(query?.status && query.status !== 'ALL'
        ? { status: query.status as ParticipantStatus }
        : {}),
      ...(query?.search
        ? {
            employee: {
              OR: [
                { displayName: { contains: query.search, mode: 'insensitive' } },
                { employeeCode: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.reviewCycleParticipant.count({ where }),
      this.prisma.reviewCycleParticipant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { enrolledAt: 'desc' },
        include: {
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
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
