import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  SaveSelfAssessmentDraftDto,
  SubmitSelfAssessmentDto,
  ReopenSelfAssessmentDto,
  SelfAssessmentAttachmentDto,
  SelfAssessmentItemInputDto,
} from './dto/self-assessment.dto';
import {
  PerformanceReviewStatus,
  PerformanceReviewDto,
  EmployeeActiveReviewContextDto,
  ParticipantStatus,
} from '@hrms/types';

export interface UploadedEvidenceFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface StreamFileResult {
  stream: fs.ReadStream;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

@Injectable()
export class SelfAssessmentService {
  private readonly logger = new Logger(SelfAssessmentService.name);
  private readonly storageRoot: string;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    this.storageRoot =
      process.env.PERFORMANCE_EVIDENCE_STORAGE_DIR ||
      path.resolve(process.cwd(), 'storage/evidence/self-assessments');
    this.ensureStorageDirectoryExists(this.storageRoot);
  }

  private ensureStorageDirectoryExists(dirPath: string): void {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch (err: any) {
      this.logger.error(`Failed to initialize self-assessment evidence storage: ${err.message}`);
    }
  }

  private getCanonicalStoragePath(organizationId: string, fileName: string): string {
    const root = path.resolve(this.storageRoot);
    const orgFolder = path.resolve(root, organizationId);
    this.ensureStorageDirectoryExists(orgFolder);
    const resolvedPath = path.resolve(orgFolder, fileName);

    if (!resolvedPath.startsWith(root)) {
      throw new ForbiddenException('Path traversal attempt detected in evidence storage');
    }

    return resolvedPath;
  }

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
   * 1. Get Employee Active Review Context (Cycle, Goals, Competencies, Deadlines, and Draft Review)
   */
  async getEmployeeActiveContext(
    user: AuthenticatedUser,
    cycleId?: string,
  ): Promise<EmployeeActiveReviewContextDto> {
    const employee = await this.getEmployeeForUser(user.id, user.organizationId);

    // Find participant record
    let participant: any;
    if (cycleId) {
      participant = await this.prisma.reviewCycleParticipant.findFirst({
        where: {
          employeeId: employee.id,
          cycleId,
          cycle: { organizationId: user.organizationId },
        },
        include: {
          cycle: true,
          manager: {
            select: { id: true, employeeCode: true, displayName: true },
          },
        },
      });
    } else {
      // Find the most recent cycle in which employee is enrolled
      participant = await this.prisma.reviewCycleParticipant.findFirst({
        where: {
          employeeId: employee.id,
          cycle: {
            organizationId: user.organizationId,
            status: { not: 'ARCHIVED' },
          },
        },
        include: {
          cycle: true,
          manager: {
            select: { id: true, employeeCode: true, displayName: true },
          },
        },
        orderBy: { cycle: { startDate: 'desc' } },
      });

      // Fallback: any cycle participant record
      if (!participant) {
        participant = await this.prisma.reviewCycleParticipant.findFirst({
          where: {
            employeeId: employee.id,
            cycle: { organizationId: user.organizationId },
          },
          include: {
            cycle: true,
            manager: {
              select: { id: true, employeeCode: true, displayName: true },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        });
      }
    }

    if (!participant) {
      throw new NotFoundException('You are not currently enrolled in any performance review cycle');
    }

    const cycle = participant.cycle;

    // Load existing PerformanceReview if any
    const review = await this.prisma.performanceReview.findFirst({
      where: {
        cycleId: cycle.id,
        employeeId: employee.id,
      },
      include: {
        items: {
          include: {
            goal: true,
            competency: true,
          },
        },
        history: {
          include: {
            actor: {
              select: { id: true, displayName: true, employeeCode: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Load employee's approved goals for this cycle
    const goals = await this.prisma.performanceGoal.findMany({
      where: {
        employeeId: employee.id,
        organizationId: user.organizationId,
        OR: [{ cycleId: cycle.id }, { cycleId: null }],
        status: { in: ['APPROVED', 'COMPLETED', 'IN_PROGRESS'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Load cycle competencies
    const competencies = await this.prisma.performanceCompetency.findMany({
      where: { cycleId: cycle.id },
      orderBy: { name: 'asc' },
    });

    // Determine deadlines & permissions
    const now = new Date();
    const isDeadlinePassed = cycle.selfAssessmentDeadline
      ? now > new Date(cycle.selfAssessmentDeadline)
      : false;

    const isCycleClosed = cycle.status === 'ARCHIVED';
    const isExempted = participant.status === 'EXEMPTED' || participant.status === 'WITHDRAWN';

    const canEdit =
      !isCycleClosed &&
      !isExempted &&
      (!review ||
        review.status === 'NOT_STARTED' ||
        review.status === 'SELF_ASSESSMENT_DRAFT' ||
        review.status === 'REOPENED') &&
      (!isDeadlinePassed || review?.status === 'REOPENED');

    const canSubmit = canEdit;

    return {
      participant: participant as any,
      cycle: cycle as any,
      review: review as any,
      goals: goals as any,
      competencies: competencies as any,
      isDeadlinePassed,
      canEdit,
      canSubmit,
    };
  }

  /**
   * 2. Save Self-Assessment Draft
   */
  async saveDraft(
    user: AuthenticatedUser,
    dto: SaveSelfAssessmentDraftDto,
  ): Promise<PerformanceReviewDto> {
    const employee = await this.getEmployeeForUser(user.id, user.organizationId);

    // Verify participation
    const participant = await this.prisma.reviewCycleParticipant.findUnique({
      where: {
        cycleId_employeeId: {
          cycleId: dto.cycleId,
          employeeId: employee.id,
        },
      },
      include: { cycle: true },
    });

    if (!participant) {
      throw new ForbiddenException('You are not enrolled in this review cycle');
    }

    if (participant.status === 'EXEMPTED') {
      throw new BadRequestException(
        `You have been exempted from this cycle (${participant.exemptionReason || 'Policy Exemption'})`,
      );
    }
    if (participant.status === 'WITHDRAWN') {
      throw new BadRequestException('Your participation in this review cycle has been withdrawn');
    }

    const cycle = participant.cycle;
    if (cycle.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot edit self-assessment: review cycle is closed');
    }

    // Check existing review
    const existingReview = await this.prisma.performanceReview.findUnique({
      where: {
        cycleId_employeeId: {
          cycleId: dto.cycleId,
          employeeId: employee.id,
        },
      },
    });

    const isReopened = existingReview?.status === 'REOPENED';
    const isDeadlinePassed = cycle.selfAssessmentDeadline
      ? new Date() > new Date(cycle.selfAssessmentDeadline)
      : false;

    if (isDeadlinePassed && !isReopened) {
      throw new BadRequestException(
        'Self-assessment deadline has passed. Please contact HR to request a cycle reopening.',
      );
    }

    if (
      existingReview &&
      !['NOT_STARTED', 'SELF_ASSESSMENT_DRAFT', 'REOPENED'].includes(existingReview.status)
    ) {
      throw new BadRequestException(
        'Self-assessment has already been submitted and cannot be modified.',
      );
    }

    const targetStatus: PerformanceReviewStatus = isReopened ? 'REOPENED' : 'SELF_ASSESSMENT_DRAFT';

    // Perform draft update/create within transaction
    const savedReview = await this.prisma.$transaction(async (tx) => {
      const review = await tx.performanceReview.upsert({
        where: {
          cycleId_employeeId: {
            cycleId: dto.cycleId,
            employeeId: employee.id,
          },
        },
        create: {
          organizationId: user.organizationId,
          cycleId: dto.cycleId,
          employeeId: employee.id,
          managerId: participant.managerId,
          participantId: participant.id,
          templateVersion: cycle.templateVersion,
          status: targetStatus,
          selfSummary: dto.selfSummary || null,
          selfAchievements: dto.selfAchievements || null,
          selfChallenges: dto.selfChallenges || null,
          skillsDeveloped: dto.skillsDeveloped || null,
          developmentInterests: dto.developmentInterests || null,
          selfEvidenceAttachments: (dto.selfEvidenceAttachments as any) || null,
        },
        update: {
          status: targetStatus,
          participantId: participant.id,
          templateVersion: cycle.templateVersion,
          selfSummary: dto.selfSummary !== undefined ? dto.selfSummary : undefined,
          selfAchievements: dto.selfAchievements !== undefined ? dto.selfAchievements : undefined,
          selfChallenges: dto.selfChallenges !== undefined ? dto.selfChallenges : undefined,
          skillsDeveloped: dto.skillsDeveloped !== undefined ? dto.skillsDeveloped : undefined,
          developmentInterests:
            dto.developmentInterests !== undefined ? dto.developmentInterests : undefined,
          selfEvidenceAttachments:
            dto.selfEvidenceAttachments !== undefined
              ? (dto.selfEvidenceAttachments as any)
              : undefined,
        },
      });

      // Synchronize review items if provided
      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          // Verify goal ownership if goalId provided
          if (item.goalId) {
            const goal = await tx.performanceGoal.findFirst({
              where: {
                id: item.goalId,
                employeeId: employee.id,
                organizationId: user.organizationId,
              },
            });
            if (!goal) {
              throw new BadRequestException(
                `Goal ${item.goalId} does not belong to the authenticated employee`,
              );
            }

            const existingItem = await tx.performanceReviewItem.findFirst({
              where: { reviewId: review.id, goalId: item.goalId },
            });

            if (existingItem) {
              await tx.performanceReviewItem.update({
                where: { id: existingItem.id },
                data: {
                  selfRating: item.selfRating !== undefined ? item.selfRating : undefined,
                  selfComments: item.selfComments !== undefined ? item.selfComments : undefined,
                  selfEvidenceUrl:
                    item.selfEvidenceUrl !== undefined ? item.selfEvidenceUrl : undefined,
                  isNotApplicable:
                    item.isNotApplicable !== undefined ? item.isNotApplicable : undefined,
                },
              });
            } else {
              await tx.performanceReviewItem.create({
                data: {
                  reviewId: review.id,
                  goalId: item.goalId,
                  selfRating: item.selfRating,
                  selfComments: item.selfComments,
                  selfEvidenceUrl: item.selfEvidenceUrl,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            }
          } else if (item.competencyId) {
            const existingItem = await tx.performanceReviewItem.findFirst({
              where: { reviewId: review.id, competencyId: item.competencyId },
            });

            if (existingItem) {
              await tx.performanceReviewItem.update({
                where: { id: existingItem.id },
                data: {
                  selfRating: item.selfRating !== undefined ? item.selfRating : undefined,
                  selfComments: item.selfComments !== undefined ? item.selfComments : undefined,
                  isNotApplicable:
                    item.isNotApplicable !== undefined ? item.isNotApplicable : undefined,
                },
              });
            } else {
              await tx.performanceReviewItem.create({
                data: {
                  reviewId: review.id,
                  competencyId: item.competencyId,
                  selfRating: item.selfRating,
                  selfComments: item.selfComments,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            }
          }
        }
      }

      // Record audit history
      await tx.performanceReviewHistory.create({
        data: {
          reviewId: review.id,
          actorId: employee.id,
          action: 'SELF_ASSESSMENT_DRAFT_SAVED',
          changeReason: 'Draft autosaved by employee',
          previousState: existingReview
            ? {
                status: existingReview.status,
                templateVersion: existingReview.templateVersion,
              }
            : Prisma.JsonNull,
          newState: {
            status: targetStatus,
            templateVersion: cycle.templateVersion,
            itemsCount: dto.items?.length || 0,
          },
        },
      });

      return review;
    });

    return this.getReviewById(user, savedReview.id);
  }

  /**
   * 3. Submit Self-Assessment (Final Submission)
   */
  async submitSelfAssessment(
    user: AuthenticatedUser,
    dto: SubmitSelfAssessmentDto,
  ): Promise<PerformanceReviewDto> {
    const employee = await this.getEmployeeForUser(user.id, user.organizationId);

    // Verify participation
    const participant = await this.prisma.reviewCycleParticipant.findUnique({
      where: {
        cycleId_employeeId: {
          cycleId: dto.cycleId,
          employeeId: employee.id,
        },
      },
      include: { cycle: true },
    });

    if (!participant) {
      throw new ForbiddenException('You are not enrolled in this review cycle');
    }

    if (participant.status === 'EXEMPTED' || participant.status === 'WITHDRAWN') {
      throw new BadRequestException(
        `Cannot submit self-assessment: participant status is ${participant.status}`,
      );
    }

    const cycle = participant.cycle;
    if (cycle.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot submit self-assessment: review cycle is closed');
    }

    // Required field validation
    if (!dto.selfSummary || dto.selfSummary.trim().length < 10) {
      throw new BadRequestException(
        'Executive summary is required and must contain at least 10 characters',
      );
    }
    if (!dto.selfAchievements || dto.selfAchievements.trim().length < 10) {
      throw new BadRequestException(
        'Key achievements are required and must contain at least 10 characters',
      );
    }

    // Check existing review
    const existingReview = await this.prisma.performanceReview.findUnique({
      where: {
        cycleId_employeeId: {
          cycleId: dto.cycleId,
          employeeId: employee.id,
        },
      },
    });

    const isReopened = existingReview?.status === 'REOPENED';
    const isDeadlinePassed = cycle.selfAssessmentDeadline
      ? new Date() > new Date(cycle.selfAssessmentDeadline)
      : false;

    if (isDeadlinePassed && !isReopened) {
      throw new BadRequestException(
        'Self-assessment deadline has passed. Please contact HR to request a cycle reopening.',
      );
    }

    if (existingReview && existingReview.status === 'SELF_ASSESSMENT_SUBMITTED') {
      throw new BadRequestException(
        'Duplicate submission: your self-assessment has already been submitted and is locked for review.',
      );
    }

    if (
      existingReview &&
      !['NOT_STARTED', 'SELF_ASSESSMENT_DRAFT', 'REOPENED'].includes(existingReview.status)
    ) {
      throw new BadRequestException(
        `Cannot submit self-assessment: review is in status ${existingReview.status}`,
      );
    }

    // Rating value bounds validation
    if (dto.items && dto.items.length > 0) {
      for (const item of dto.items) {
        if (item.selfRating !== undefined && !item.isNotApplicable) {
          if (item.selfRating < 1 || item.selfRating > cycle.ratingScaleMax) {
            throw new BadRequestException(
              `Rating ${item.selfRating} is out of bounds (allowed 1 to ${cycle.ratingScaleMax})`,
            );
          }
        }
      }
    }

    // Execute submission atomically
    const submittedReview = await this.prisma.$transaction(async (tx) => {
      const review = await tx.performanceReview.upsert({
        where: {
          cycleId_employeeId: {
            cycleId: dto.cycleId,
            employeeId: employee.id,
          },
        },
        create: {
          organizationId: user.organizationId,
          cycleId: dto.cycleId,
          employeeId: employee.id,
          managerId: participant.managerId,
          participantId: participant.id,
          templateVersion: cycle.templateVersion,
          status: 'SELF_ASSESSMENT_SUBMITTED',
          selfSummary: dto.selfSummary.trim(),
          selfAchievements: dto.selfAchievements.trim(),
          selfChallenges: dto.selfChallenges?.trim() || null,
          skillsDeveloped: dto.skillsDeveloped?.trim() || null,
          developmentInterests: dto.developmentInterests?.trim() || null,
          selfEvidenceAttachments: (dto.selfEvidenceAttachments as any) || null,
          selfSubmittedAt: new Date(),
        },
        update: {
          status: 'SELF_ASSESSMENT_SUBMITTED',
          participantId: participant.id,
          templateVersion: cycle.templateVersion,
          selfSummary: dto.selfSummary.trim(),
          selfAchievements: dto.selfAchievements.trim(),
          selfChallenges: dto.selfChallenges?.trim() || null,
          skillsDeveloped: dto.skillsDeveloped?.trim() || null,
          developmentInterests: dto.developmentInterests?.trim() || null,
          selfEvidenceAttachments: (dto.selfEvidenceAttachments as any) || null,
          selfSubmittedAt: new Date(),
        },
      });

      // Synchronize items
      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          if (item.goalId) {
            const goal = await tx.performanceGoal.findFirst({
              where: {
                id: item.goalId,
                employeeId: employee.id,
                organizationId: user.organizationId,
              },
            });
            if (!goal) {
              throw new BadRequestException(
                `Goal ${item.goalId} does not belong to the authenticated employee`,
              );
            }

            const existingItem = await tx.performanceReviewItem.findFirst({
              where: { reviewId: review.id, goalId: item.goalId },
            });

            if (existingItem) {
              await tx.performanceReviewItem.update({
                where: { id: existingItem.id },
                data: {
                  selfRating: item.selfRating !== undefined ? item.selfRating : undefined,
                  selfComments: item.selfComments !== undefined ? item.selfComments : undefined,
                  selfEvidenceUrl:
                    item.selfEvidenceUrl !== undefined ? item.selfEvidenceUrl : undefined,
                  isNotApplicable:
                    item.isNotApplicable !== undefined ? item.isNotApplicable : undefined,
                },
              });
            } else {
              await tx.performanceReviewItem.create({
                data: {
                  reviewId: review.id,
                  goalId: item.goalId,
                  selfRating: item.selfRating,
                  selfComments: item.selfComments,
                  selfEvidenceUrl: item.selfEvidenceUrl,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            }
          } else if (item.competencyId) {
            const existingItem = await tx.performanceReviewItem.findFirst({
              where: { reviewId: review.id, competencyId: item.competencyId },
            });

            if (existingItem) {
              await tx.performanceReviewItem.update({
                where: { id: existingItem.id },
                data: {
                  selfRating: item.selfRating !== undefined ? item.selfRating : undefined,
                  selfComments: item.selfComments !== undefined ? item.selfComments : undefined,
                  isNotApplicable:
                    item.isNotApplicable !== undefined ? item.isNotApplicable : undefined,
                },
              });
            } else {
              await tx.performanceReviewItem.create({
                data: {
                  reviewId: review.id,
                  competencyId: item.competencyId,
                  selfRating: item.selfRating,
                  selfComments: item.selfComments,
                  isNotApplicable: item.isNotApplicable || false,
                },
              });
            }
          }
        }
      }

      // Record audit history
      await tx.performanceReviewHistory.create({
        data: {
          reviewId: review.id,
          actorId: employee.id,
          action: 'SELF_ASSESSMENT_SUBMITTED',
          changeReason: 'Self-assessment formally submitted for manager review',
          previousState: existingReview
            ? {
                status: existingReview.status,
                templateVersion: existingReview.templateVersion,
              }
            : Prisma.JsonNull,
          newState: {
            status: 'SELF_ASSESSMENT_SUBMITTED',
            templateVersion: cycle.templateVersion,
            submittedAt: new Date().toISOString(),
          },
        },
      });

      return review;
    });

    // Record system audit log
    await this.audit.record({
      action: 'SELF_ASSESSMENT_SUBMITTED',
      entity: 'PerformanceReview',
      entityId: submittedReview.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        cycleId: dto.cycleId,
        employeeId: employee.id,
        templateVersion: cycle.templateVersion,
      },
    });

    // Notify manager if assigned
    if (participant.managerId) {
      try {
        await this.notifications.createNotification({
          userId: participant.managerId,
          organizationId: user.organizationId,
          title: 'Self-Assessment Submitted',
          message: `${employee.displayName} has submitted their self-assessment for cycle ${cycle.name}.`,
          type: 'INFO',
          link: `/progress?cycleId=${cycle.id}&employeeId=${employee.id}`,
        });
      } catch (err: any) {
        this.logger.warn(`Could not dispatch manager notification: ${err.message}`);
      }
    }

    return this.getReviewById(user, submittedReview.id);
  }

  /**
   * 4. Get Performance Review by ID (with strict RBAC)
   */
  async getReviewById(user: AuthenticatedUser, reviewId: string): Promise<PerformanceReviewDto> {
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
        history: {
          include: {
            actor: {
              select: { id: true, displayName: true, employeeCode: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!review || review.organizationId !== user.organizationId) {
      throw new NotFoundException('Performance review record not found');
    }

    // Role check
    if (!this.isHrOrAdmin(user)) {
      const employee = await this.getEmployeeForUser(user.id, user.organizationId);
      const isOwner = review.employeeId === employee.id;
      const isManager = review.managerId === employee.id;

      if (!isOwner && !isManager) {
        throw new ForbiddenException(
          'You are not authorized to view or edit this performance review',
        );
      }
    }

    return review as any;
  }

  /**
   * 5. Reopen Self-Assessment (Authorized HR/Admin Workflow)
   */
  async reopenSelfAssessment(
    user: AuthenticatedUser,
    reviewId: string,
    dto: ReopenSelfAssessmentDto,
  ): Promise<PerformanceReviewDto> {
    if (!this.isHrOrAdmin(user)) {
      throw new ForbiddenException('Only HR or Administrators can reopen a self-assessment');
    }

    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('A valid reopening reason is required (min 5 characters)');
    }

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

    if (review.status !== 'SELF_ASSESSMENT_SUBMITTED' && review.status !== 'MANAGER_REVIEW_DRAFT') {
      throw new BadRequestException(
        `Cannot reopen self-assessment: review status is ${review.status}. Only submitted self-assessments can be reopened.`,
      );
    }

    const hrEmployee = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId },
      select: { id: true },
    });

    const reopenedReview = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.performanceReview.update({
        where: { id: reviewId },
        data: {
          status: 'REOPENED',
          reopenedAt: new Date(),
          reopenedById: hrEmployee?.id || user.id,
          reopenReason: dto.reason.trim(),
        },
      });

      await tx.performanceReviewHistory.create({
        data: {
          reviewId: review.id,
          actorId: hrEmployee?.id || review.employeeId,
          action: 'SELF_ASSESSMENT_REOPENED',
          changeReason: dto.reason.trim(),
          previousState: {
            status: review.status,
            selfSubmittedAt: review.selfSubmittedAt,
          },
          newState: {
            status: 'REOPENED',
            reopenedAt: new Date().toISOString(),
            reopenedById: user.id,
          },
        },
      });

      return updated;
    });

    // Record audit log
    await this.audit.record({
      action: 'SELF_ASSESSMENT_REOPENED',
      entity: 'PerformanceReview',
      entityId: reviewId,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        employeeId: review.employeeId,
        reopenReason: dto.reason,
      },
    });

    // Notify employee that review has been reopened for editing
    if (review.employee.userId) {
      try {
        await this.notifications.createNotification({
          userId: review.employee.userId,
          organizationId: user.organizationId,
          title: 'Self-Assessment Reopened',
          message: `Your self-assessment for ${review.cycle.name} has been reopened for edits. Reason: ${dto.reason}`,
          type: 'WARNING',
          link: `/progress?cycleId=${review.cycleId}`,
        });
      } catch (err: any) {
        this.logger.warn(`Could not dispatch employee reopening notification: ${err.message}`);
      }
    }

    return this.getReviewById(user, reopenedReview.id);
  }

  /**
   * 6. Upload Supporting Evidence Attachment
   */
  async uploadEvidence(
    user: AuthenticatedUser,
    file: UploadedEvidenceFile,
  ): Promise<SelfAssessmentAttachmentDto> {
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }

    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException('Evidence attachment exceeds maximum permitted size (10MB)');
    }

    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not permitted. Allowed: PDF, PNG, JPG, DOCX, TXT.`,
      );
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const safeBaseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 50);

    const uniqueFileName = `${Date.now()}_${safeBaseName}${ext}`;
    const targetPath = this.getCanonicalStoragePath(user.organizationId, uniqueFileName);

    await fs.promises.writeFile(targetPath, file.buffer);

    return {
      url: `/api/performance/self-assessment/evidence/${encodeURIComponent(uniqueFileName)}`,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * 7. Stream Evidence Attachment Safely
   */
  async streamEvidence(user: AuthenticatedUser, fileName: string): Promise<StreamFileResult> {
    const safeName = path.basename(fileName);
    const filePath = this.getCanonicalStoragePath(user.organizationId, safeName);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Evidence file not found');
    }

    const stat = await fs.promises.stat(filePath);
    const ext = path.extname(safeName).toLowerCase();

    let mimeType = 'application/octet-stream';
    if (ext === '.pdf') mimeType = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.txt') mimeType = 'text/plain';

    return {
      stream: fs.createReadStream(filePath),
      mimeType,
      fileName: safeName,
      fileSize: stat.size,
    };
  }
}
