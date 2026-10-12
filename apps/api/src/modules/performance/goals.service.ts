import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { CreateGoalProgressUpdateDto } from './dto/goal-progress.dto';
import { ApproveGoalDto } from './dto/approve-goal.dto';
import { QueryGoalsDto } from './dto/query-goals.dto';
import { GoalStatus, GoalActionType, GoalMeasurementType, Prisma } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

interface FileUploadPayload {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size: number;
}

interface StreamFileResult {
  stream: fs.ReadStream;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);
  private readonly storageRoot: string;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly hierarchy: HierarchyService,
    private readonly notifications: NotificationsService,
  ) {
    this.storageRoot =
      process.env.PERFORMANCE_EVIDENCE_STORAGE_DIR ||
      path.resolve(process.cwd(), 'storage/evidence');
    this.ensureStorageDirectoryExists(this.storageRoot);
  }

  private ensureStorageDirectoryExists(dirPath: string): void {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch (err: any) {
      this.logger.error(`Failed to initialize evidence storage directory: ${err.message}`);
    }
  }

  private getCanonicalStoragePath(
    organizationId: string,
    goalId: string,
    updateId: string,
    ext: string,
  ): string {
    const root = path.resolve(this.storageRoot);
    const resolvedPath = path.resolve(root, organizationId, goalId, `${updateId}${ext}`);

    if (!resolvedPath.startsWith(root)) {
      throw new ForbiddenException('Path traversal attempt detected in evidence storage');
    }

    return resolvedPath;
  }

  /**
   * Resolve active employee for authenticated user
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
   * Helper: Check if caller is authorized manager for an employee
   */
  private async isAuthorizedManager(
    managerEmployeeId: string,
    targetEmployeeId: string,
    organizationId: string,
  ): Promise<boolean> {
    if (managerEmployeeId === targetEmployeeId) {
      return false; // Self-management not allowed
    }
    return this.hierarchy.isManagerOf(managerEmployeeId, targetEmployeeId, organizationId);
  }

  /**
   * 1. CREATE GOAL
   */
  async createGoal(user: AuthenticatedUser, dto: CreateGoalDto) {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);
    let targetEmployeeId = callerEmployee.id;

    // Target employee resolution & authorization
    if (dto.employeeId && dto.employeeId !== callerEmployee.id) {
      if (this.isHrOrAdmin(user)) {
        targetEmployeeId = dto.employeeId;
      } else if (user.roles.includes('MANAGER')) {
        const isMgr = await this.isAuthorizedManager(
          callerEmployee.id,
          dto.employeeId,
          user.organizationId,
        );
        if (!isMgr) {
          throw new ForbiddenException('You are not authorized to assign goals to this employee');
        }
        targetEmployeeId = dto.employeeId;
      } else {
        throw new ForbiddenException('Employees cannot create goals for other colleagues');
      }
    }

    // Verify target employee exists in org
    const targetEmployee = await this.prisma.employee.findFirst({
      where: { id: targetEmployeeId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!targetEmployee) {
      throw new NotFoundException(`Target employee #${targetEmployeeId} not found`);
    }

    // Date range validation
    if (dto.startDate && dto.dueDate) {
      const start = new Date(dto.startDate);
      const due = new Date(dto.dueDate);
      if (due < start) {
        throw new BadRequestException('Due date cannot be earlier than start date');
      }
    }

    // Review Cycle validation
    if (dto.cycleId) {
      const cycle = await this.prisma.reviewCycle.findFirst({
        where: { id: dto.cycleId, organizationId: user.organizationId },
      });
      if (!cycle) {
        throw new NotFoundException(`Review cycle #${dto.cycleId} not found`);
      }
      if (cycle.status === 'FINALIZED' || cycle.status === 'ARCHIVED') {
        throw new BadRequestException('Cannot add goals to a finalized or archived review cycle');
      }
    }

    // Weight validation (0 to 100)
    if (dto.weight < 0 || dto.weight > 100) {
      throw new BadRequestException('Goal weight must be between 0 and 100%');
    }

    // Check sum of existing weights for target employee in this cycle
    const existingGoals = await this.prisma.performanceGoal.findMany({
      where: {
        employeeId: targetEmployeeId,
        organizationId: user.organizationId,
        ...(dto.cycleId ? { cycleId: dto.cycleId } : {}),
        status: { notIn: ['CANCELLED'] },
      },
      select: { weight: true },
    });

    const currentTotalWeight = existingGoals.reduce((sum, g) => sum + g.weight, 0);
    if (currentTotalWeight + dto.weight > 100) {
      throw new BadRequestException(
        `Total active goal weight would exceed 100% (Current: ${currentTotalWeight}%, New Goal: ${dto.weight}%)`,
      );
    }

    const initialStatus = dto.submitForApproval ? GoalStatus.PENDING_APPROVAL : GoalStatus.DRAFT;

    const goal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.performanceGoal.create({
        data: {
          organizationId: user.organizationId,
          cycleId: dto.cycleId || null,
          employeeId: targetEmployeeId,
          assignedById: targetEmployeeId !== callerEmployee.id ? callerEmployee.id : null,
          title: dto.title.trim(),
          description: dto.description.trim(),
          businessRationale: dto.businessRationale?.trim() || null,
          alignmentKey: dto.alignmentKey?.trim() || null,
          category: dto.category || 'QUANTITATIVE',
          measurementType: dto.measurementType || 'NUMERIC',
          unit: dto.unit?.trim() || null,
          baselineValue: dto.baselineValue ?? 0,
          targetValue: dto.targetValue ?? null,
          currentValue: dto.baselineValue ?? 0,
          evaluationCriteria: dto.evaluationCriteria?.trim() || null,
          weight: dto.weight,
          status: initialStatus,
          progressPercentage: 0.0,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          policyReference: dto.policyReference?.trim() || null,
        },
        include: {
          employee: {
            select: { id: true, employeeCode: true, displayName: true },
          },
          cycle: {
            select: { id: true, name: true, code: true, status: true },
          },
        },
      });

      // Record initial history
      await tx.goalHistory.create({
        data: {
          goalId: created.id,
          actorId: callerEmployee.id,
          action: dto.submitForApproval ? GoalActionType.SUBMITTED : GoalActionType.CREATED,
          changeReason: dto.submitForApproval
            ? 'Goal created and submitted for manager approval'
            : 'Goal draft created',
          newState: {
            title: created.title,
            weight: created.weight,
            status: created.status,
            targetValue: created.targetValue,
          },
        },
      });

      return created;
    });

    await this.audit.record({
      action: 'GOAL_CREATED',
      entity: 'PerformanceGoal',
      entityId: goal.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        title: goal.title,
        weight: goal.weight,
        employeeId: targetEmployeeId,
        status: goal.status,
      },
    });

    return goal;
  }

  /**
   * 2. UPDATE GOAL
   */
  async updateGoal(user: AuthenticatedUser, goalId: string, dto: UpdateGoalDto) {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);

    const goal = await this.prisma.performanceGoal.findFirst({
      where: { id: goalId, organizationId: user.organizationId },
      include: {
        employee: { select: { id: true, managerId: true, displayName: true } },
      },
    });

    if (!goal) {
      throw new NotFoundException(`Goal #${goalId} not found`);
    }

    const isOwner = goal.employeeId === callerEmployee.id;
    const isHrAdmin = this.isHrOrAdmin(user);
    const isMgr = await this.isAuthorizedManager(
      callerEmployee.id,
      goal.employeeId,
      user.organizationId,
    );

    if (!isOwner && !isHrAdmin && !isMgr) {
      throw new ForbiddenException('You do not have permission to edit this goal');
    }

    // Status constraints on edit
    if (isOwner && !isHrAdmin && !isMgr) {
      if (goal.status === 'COMPLETED' || goal.status === 'CANCELLED') {
        throw new BadRequestException(`Cannot edit goal in ${goal.status} status`);
      }
    }

    // Date range validation
    const effectiveStart = dto.startDate ? new Date(dto.startDate) : goal.startDate;
    const effectiveDue = dto.dueDate ? new Date(dto.dueDate) : goal.dueDate;
    if (effectiveStart && effectiveDue && effectiveDue < effectiveStart) {
      throw new BadRequestException('Due date cannot be earlier than start date');
    }

    // Weight validation if changed
    if (dto.weight !== undefined && dto.weight !== goal.weight) {
      if (dto.weight < 0 || dto.weight > 100) {
        throw new BadRequestException('Goal weight must be between 0 and 100%');
      }

      const otherGoals = await this.prisma.performanceGoal.findMany({
        where: {
          employeeId: goal.employeeId,
          organizationId: user.organizationId,
          id: { not: goal.id },
          ...(goal.cycleId ? { cycleId: goal.cycleId } : {}),
          status: { notIn: ['CANCELLED'] },
        },
        select: { weight: true },
      });

      const otherTotalWeight = otherGoals.reduce((sum, g) => sum + g.weight, 0);
      if (otherTotalWeight + dto.weight > 100) {
        throw new BadRequestException(
          `Total active goal weight would exceed 100% (Other goals: ${otherTotalWeight}%, New weight: ${dto.weight}%)`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const previousState = {
        title: goal.title,
        description: goal.description,
        targetValue: goal.targetValue,
        weight: goal.weight,
        status: goal.status,
      };

      const res = await tx.performanceGoal.update({
        where: { id: goalId },
        data: {
          title: dto.title?.trim() ?? goal.title,
          description: dto.description?.trim() ?? goal.description,
          businessRationale:
            dto.businessRationale !== undefined
              ? dto.businessRationale.trim() || null
              : goal.businessRationale,
          alignmentKey:
            dto.alignmentKey !== undefined ? dto.alignmentKey.trim() || null : goal.alignmentKey,
          category: dto.category ?? goal.category,
          measurementType: dto.measurementType ?? goal.measurementType,
          unit: dto.unit !== undefined ? dto.unit.trim() || null : goal.unit,
          baselineValue: dto.baselineValue ?? goal.baselineValue,
          targetValue: dto.targetValue !== undefined ? dto.targetValue : goal.targetValue,
          currentValue: dto.currentValue ?? goal.currentValue,
          evaluationCriteria:
            dto.evaluationCriteria !== undefined
              ? dto.evaluationCriteria.trim() || null
              : goal.evaluationCriteria,
          weight: dto.weight ?? goal.weight,
          status: isHrAdmin || isMgr ? (dto.status ?? goal.status) : goal.status,
          startDate: dto.startDate ? new Date(dto.startDate) : goal.startDate,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : goal.dueDate,
          policyReference:
            dto.policyReference !== undefined
              ? dto.policyReference.trim() || null
              : goal.policyReference,
        },
        include: {
          employee: {
            select: { id: true, employeeCode: true, displayName: true },
          },
          cycle: {
            select: { id: true, name: true, code: true, status: true },
          },
        },
      });

      // Track target or weight changes explicitly in history
      if (dto.targetValue !== undefined && dto.targetValue !== goal.targetValue) {
        await tx.goalHistory.create({
          data: {
            goalId,
            actorId: callerEmployee.id,
            action: GoalActionType.TARGET_CHANGED,
            changeReason: dto.changeReason || 'Target value adjusted',
            previousState: { targetValue: goal.targetValue },
            newState: { targetValue: dto.targetValue },
          },
        });
      }

      if (dto.weight !== undefined && dto.weight !== goal.weight) {
        await tx.goalHistory.create({
          data: {
            goalId,
            actorId: callerEmployee.id,
            action: GoalActionType.WEIGHT_CHANGED,
            changeReason: dto.changeReason || 'Goal weight adjusted',
            previousState: { weight: goal.weight },
            newState: { weight: dto.weight },
          },
        });
      }

      if (dto.title || dto.description) {
        await tx.goalHistory.create({
          data: {
            goalId,
            actorId: callerEmployee.id,
            action: GoalActionType.UPDATED,
            changeReason: dto.changeReason || 'Goal details updated',
            previousState,
            newState: {
              title: res.title,
              description: res.description,
            },
          },
        });
      }

      return res;
    });

    await this.audit.record({
      action: 'GOAL_UPDATED',
      entity: 'PerformanceGoal',
      entityId: goal.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        goalId: goal.id,
        changes: dto,
      },
    });

    return updated;
  }

  /**
   * 3. SUBMIT GOAL FOR APPROVAL
   */
  async submitGoal(user: AuthenticatedUser, goalId: string) {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);

    const goal = await this.prisma.performanceGoal.findFirst({
      where: { id: goalId, organizationId: user.organizationId },
    });

    if (!goal) {
      throw new NotFoundException(`Goal #${goalId} not found`);
    }

    if (goal.employeeId !== callerEmployee.id && !this.isHrOrAdmin(user)) {
      throw new ForbiddenException('Only the goal owner or HR can submit this goal for approval');
    }

    if (goal.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot submit goal currently in ${goal.status} status`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.performanceGoal.update({
        where: { id: goalId },
        data: { status: GoalStatus.PENDING_APPROVAL },
      });

      await tx.goalHistory.create({
        data: {
          goalId,
          actorId: callerEmployee.id,
          action: GoalActionType.SUBMITTED,
          changeReason: 'Submitted for manager approval',
          previousState: { status: GoalStatus.DRAFT },
          newState: { status: GoalStatus.PENDING_APPROVAL },
        },
      });

      return res;
    });

    await this.audit.record({
      action: 'GOAL_SUBMITTED',
      entity: 'PerformanceGoal',
      entityId: goal.id,
      userId: user.id,
      organizationId: user.organizationId,
    });

    return updated;
  }

  /**
   * 4. APPROVE OR REJECT GOAL
   */
  async approveGoal(user: AuthenticatedUser, goalId: string, dto: ApproveGoalDto) {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);

    const goal = await this.prisma.performanceGoal.findFirst({
      where: { id: goalId, organizationId: user.organizationId },
    });

    if (!goal) {
      throw new NotFoundException(`Goal #${goalId} not found`);
    }

    // Critical authorization check: Cannot approve own goal
    if (goal.employeeId === callerEmployee.id) {
      throw new ForbiddenException('Employees and managers cannot approve their own goals');
    }

    const isHrAdmin = this.isHrOrAdmin(user);
    const isMgr = await this.isAuthorizedManager(
      callerEmployee.id,
      goal.employeeId,
      user.organizationId,
    );

    if (!isHrAdmin && !isMgr) {
      throw new ForbiddenException('Only authorized line managers or HR can approve this goal');
    }

    if (goal.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Goal must be in PENDING_APPROVAL status to be decided (Current: ${goal.status})`,
      );
    }

    const newStatus = dto.approved ? GoalStatus.APPROVED : GoalStatus.DRAFT;
    const action = dto.approved ? GoalActionType.APPROVED : GoalActionType.REJECTED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.performanceGoal.update({
        where: { id: goalId },
        data: {
          status: newStatus,
          approvedById: dto.approved ? callerEmployee.id : null,
          approvedAt: dto.approved ? new Date() : null,
          rejectionReason: dto.approved ? null : dto.rejectionReason || 'Returned by reviewer',
        },
        include: {
          employee: { select: { id: true, displayName: true } },
          approvedBy: { select: { id: true, displayName: true } },
        },
      });

      await tx.goalHistory.create({
        data: {
          goalId,
          actorId: callerEmployee.id,
          action,
          changeReason: dto.rejectionReason || (dto.approved ? 'Goal approved' : 'Goal rejected'),
          previousState: { status: GoalStatus.PENDING_APPROVAL },
          newState: {
            status: newStatus,
            rejectionReason: dto.rejectionReason || null,
          },
        },
      });

      return res;
    });

    await this.audit.record({
      action: dto.approved ? 'GOAL_APPROVED' : 'GOAL_REJECTED',
      entity: 'PerformanceGoal',
      entityId: goal.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        decision: dto.approved,
        reason: dto.rejectionReason,
      },
    });

    return updated;
  }

  /**
   * 5. RECORD PROGRESS UPDATE WITH DETERMINISTIC CALCULATION & EVIDENCE VAULT
   */
  async updateProgress(
    user: AuthenticatedUser,
    goalId: string,
    dto: CreateGoalProgressUpdateDto,
    file?: FileUploadPayload,
  ) {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);

    const goal = await this.prisma.performanceGoal.findFirst({
      where: { id: goalId, organizationId: user.organizationId },
    });

    if (!goal) {
      throw new NotFoundException(`Goal #${goalId} not found`);
    }

    const isOwner = goal.employeeId === callerEmployee.id;
    const isHrAdmin = this.isHrOrAdmin(user);
    const isMgr = await this.isAuthorizedManager(
      callerEmployee.id,
      goal.employeeId,
      user.organizationId,
    );

    if (!isOwner && !isHrAdmin && !isMgr) {
      throw new ForbiddenException('You do not have permission to update progress on this goal');
    }

    if (goal.status === 'DRAFT' || goal.status === 'PENDING_APPROVAL') {
      throw new BadRequestException('Cannot record progress updates on an unapproved goal');
    }

    if (goal.status === 'CANCELLED') {
      throw new BadRequestException('Cannot update progress on a cancelled goal');
    }

    // Authoritative Server Calculation of Progress Percentage
    let calculatedProgress = goal.progressPercentage;
    const newCurrentValue = dto.currentValue !== undefined ? dto.currentValue : goal.currentValue;

    if (
      (goal.measurementType === 'NUMERIC' ||
        goal.measurementType === 'PERCENTAGE' ||
        goal.measurementType === 'CURRENCY') &&
      goal.targetValue !== null &&
      goal.targetValue !== undefined &&
      newCurrentValue !== null &&
      newCurrentValue !== undefined
    ) {
      const baseline = goal.baselineValue ?? 0;
      const target = goal.targetValue;
      if (target !== baseline) {
        const raw = ((newCurrentValue - baseline) / (target - baseline)) * 100;
        calculatedProgress = Math.min(100, Math.max(0, Math.round(raw * 100) / 100));
      }
    } else if (goal.measurementType === 'BOOLEAN') {
      calculatedProgress = (newCurrentValue ?? 0) >= 1 ? 100 : 0;
    } else if (dto.progressPercentage !== undefined) {
      calculatedProgress = Math.min(
        100,
        Math.max(0, Math.round(dto.progressPercentage * 100) / 100),
      );
    }

    // Secure File Storage for Evidence if present
    let evidenceUrl: string | null = null;
    let evidenceFileName: string | null = null;
    let evidenceFileSize: number | null = null;
    let evidenceMimeType: string | null = null;

    if (file && file.buffer) {
      if (file.buffer.length > this.MAX_FILE_SIZE) {
        throw new BadRequestException('Evidence attachment exceeds 10MB limit');
      }

      const updateId = crypto.randomUUID();
      const cleanExt = path.extname(file.originalname).toLowerCase() || '.bin';
      const targetDir = path.resolve(this.storageRoot, user.organizationId, goalId);

      this.ensureStorageDirectoryExists(targetDir);
      const filePath = this.getCanonicalStoragePath(
        user.organizationId,
        goalId,
        updateId,
        cleanExt,
      );

      fs.writeFileSync(filePath, file.buffer);

      evidenceUrl = `${user.organizationId}/${goalId}/${updateId}${cleanExt}`;
      evidenceFileName = file.originalname.slice(0, 200);
      evidenceFileSize = file.size;
      evidenceMimeType = file.mimetype || 'application/octet-stream';
    } else if (dto.evidenceUrl) {
      evidenceUrl = dto.evidenceUrl;
      evidenceFileName = dto.evidenceFileName || 'Supporting Link';
    }

    // Determine target status
    let nextStatus = goal.status;
    if (calculatedProgress >= 100) {
      nextStatus = GoalStatus.COMPLETED;
    } else if (calculatedProgress > 0 && goal.status === 'APPROVED') {
      nextStatus = GoalStatus.IN_PROGRESS;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create progress update item
      const progressRecord = await tx.goalProgressUpdate.create({
        data: {
          goalId,
          updatedById: callerEmployee.id,
          previousValue: goal.currentValue,
          newValue: newCurrentValue,
          previousProgress: goal.progressPercentage,
          newProgress: calculatedProgress,
          note: dto.note.trim(),
          evidenceUrl,
          evidenceFileName,
          evidenceFileSize,
          evidenceMimeType,
        },
        include: {
          updatedBy: {
            select: { id: true, displayName: true, employeeCode: true },
          },
        },
      });

      // 2. Update Goal
      const updatedGoal = await tx.performanceGoal.update({
        where: { id: goalId },
        data: {
          currentValue: newCurrentValue,
          progressPercentage: calculatedProgress,
          status: nextStatus,
        },
      });

      // 3. Goal History
      await tx.goalHistory.create({
        data: {
          goalId,
          actorId: callerEmployee.id,
          action: GoalActionType.PROGRESS_UPDATED,
          changeReason: `Progress updated from ${goal.progressPercentage}% to ${calculatedProgress}%`,
          previousState: {
            currentValue: goal.currentValue,
            progressPercentage: goal.progressPercentage,
            status: goal.status,
          },
          newState: {
            currentValue: newCurrentValue,
            progressPercentage: calculatedProgress,
            status: nextStatus,
          },
        },
      });

      return { progressRecord, updatedGoal };
    });

    await this.audit.record({
      action: 'GOAL_PROGRESS_UPDATED',
      entity: 'GoalProgressUpdate',
      entityId: result.progressRecord.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        goalId,
        newProgress: calculatedProgress,
        status: nextStatus,
      },
    });

    return result;
  }

  /**
   * 6. STREAM EVIDENCE ATTACHMENT
   */
  async streamEvidence(
    user: AuthenticatedUser,
    goalId: string,
    updateId: string,
  ): Promise<StreamFileResult> {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);

    const goal = await this.prisma.performanceGoal.findFirst({
      where: { id: goalId, organizationId: user.organizationId },
    });

    if (!goal) {
      throw new NotFoundException(`Goal #${goalId} not found`);
    }

    const isOwner = goal.employeeId === callerEmployee.id;
    const isHrAdmin = this.isHrOrAdmin(user);
    const isMgr = await this.isAuthorizedManager(
      callerEmployee.id,
      goal.employeeId,
      user.organizationId,
    );

    if (!isOwner && !isHrAdmin && !isMgr) {
      throw new ForbiddenException('You do not have permission to view evidence for this goal');
    }

    const update = await this.prisma.goalProgressUpdate.findFirst({
      where: { id: updateId, goalId },
    });

    if (!update || !update.evidenceUrl) {
      throw new NotFoundException('Evidence attachment not found');
    }

    const relativePath = update.evidenceUrl;
    const resolvedPath = path.resolve(this.storageRoot, relativePath);

    if (!resolvedPath.startsWith(path.resolve(this.storageRoot))) {
      throw new ForbiddenException('Path traversal attempt detected');
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new NotFoundException('Evidence file not found on disk');
    }

    const stats = fs.statSync(resolvedPath);

    return {
      stream: fs.createReadStream(resolvedPath),
      mimeType: update.evidenceMimeType || 'application/octet-stream',
      fileName: update.evidenceFileName || 'evidence.bin',
      fileSize: stats.size,
    };
  }

  /**
   * 7. GET GOALS (Scoped Query)
   */
  async getGoals(user: AuthenticatedUser, query: QueryGoalsDto) {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);

    const where: Prisma.PerformanceGoalWhereInput = {
      organizationId: user.organizationId,
    };

    // Scoped visibility
    if (this.isHrOrAdmin(user)) {
      // HR/Admin can query any employee
      if (query.employeeId) {
        where.employeeId = query.employeeId;
      }
    } else if (user.roles.includes('MANAGER')) {
      // Manager can view self or reports
      if (query.employeeId) {
        if (query.employeeId === callerEmployee.id) {
          where.employeeId = callerEmployee.id;
        } else {
          const isMgr = await this.isAuthorizedManager(
            callerEmployee.id,
            query.employeeId,
            user.organizationId,
          );
          if (!isMgr) {
            throw new ForbiddenException('You are not authorized to view goals for this employee');
          }
          where.employeeId = query.employeeId;
        }
      } else {
        // Default manager scope: self + all direct/indirect reports
        const teamResult = await this.hierarchy.getTeam(callerEmployee.id, user.organizationId);
        const authorizedIds = [callerEmployee.id, ...teamResult.allMemberIds];
        where.employeeId = { in: authorizedIds };
      }
    } else {
      // Regular employee can only access self
      where.employeeId = callerEmployee.id;
    }

    if (query.cycleId) {
      where.cycleId = query.cycleId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { employee: { displayName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.performanceGoal.count({ where }),
      this.prisma.performanceGoal.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
              profilePhoto: true,
              employment: {
                select: {
                  designation: { select: { title: true } },
                  department: { select: { name: true } },
                },
              },
            },
          },
          cycle: {
            select: { id: true, name: true, code: true, status: true },
          },
          approvedBy: {
            select: { id: true, displayName: true },
          },
          _count: {
            select: { progressUpdates: true },
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

  /**
   * 8. GET GOAL BY ID
   */
  async getGoalById(user: AuthenticatedUser, goalId: string) {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);

    const goal = await this.prisma.performanceGoal.findFirst({
      where: { id: goalId, organizationId: user.organizationId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            displayName: true,
            profilePhoto: true,
            employment: {
              select: {
                designation: { select: { title: true } },
                department: { select: { name: true } },
              },
            },
          },
        },
        cycle: {
          select: { id: true, name: true, code: true, status: true },
        },
        approvedBy: {
          select: { id: true, displayName: true },
        },
        progressUpdates: {
          orderBy: { createdAt: 'desc' },
          include: {
            updatedBy: {
              select: { id: true, displayName: true, employeeCode: true },
            },
          },
        },
        history: {
          orderBy: { createdAt: 'desc' },
          include: {
            actor: {
              select: { id: true, displayName: true },
            },
          },
        },
      },
    });

    if (!goal) {
      throw new NotFoundException(`Goal #${goalId} not found`);
    }

    const isOwner = goal.employeeId === callerEmployee.id;
    const isHrAdmin = this.isHrOrAdmin(user);
    const isMgr = await this.isAuthorizedManager(
      callerEmployee.id,
      goal.employeeId,
      user.organizationId,
    );

    if (!isOwner && !isHrAdmin && !isMgr) {
      throw new ForbiddenException('You do not have permission to view this goal');
    }

    return goal;
  }

  /**
   * 9. GET GOAL SUMMARY STATS
   */
  async getGoalStats(user: AuthenticatedUser, cycleId?: string) {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);

    const where: Prisma.PerformanceGoalWhereInput = {
      organizationId: user.organizationId,
      ...(cycleId ? { cycleId } : {}),
    };

    if (!this.isHrOrAdmin(user)) {
      if (user.roles.includes('MANAGER')) {
        const teamResult = await this.hierarchy.getTeam(callerEmployee.id, user.organizationId);
        where.employeeId = { in: [callerEmployee.id, ...teamResult.allMemberIds] };
      } else {
        where.employeeId = callerEmployee.id;
      }
    }

    const goals = await this.prisma.performanceGoal.findMany({
      where,
      select: {
        id: true,
        status: true,
        weight: true,
        progressPercentage: true,
      },
    });

    const totalGoals = goals.length;
    const draft = goals.filter((g) => g.status === 'DRAFT').length;
    const pendingApproval = goals.filter((g) => g.status === 'PENDING_APPROVAL').length;
    const approved = goals.filter((g) => g.status === 'APPROVED').length;
    const inProgress = goals.filter(
      (g) => g.status === 'IN_PROGRESS' || g.status === 'ON_TRACK',
    ).length;
    const completed = goals.filter((g) => g.status === 'COMPLETED').length;
    const cancelled = goals.filter((g) => g.status === 'CANCELLED').length;

    const totalWeight = goals
      .filter((g) => g.status !== 'CANCELLED')
      .reduce((sum, g) => sum + g.weight, 0);

    const activeGoals = goals.filter((g) => g.status !== 'CANCELLED' && g.status !== 'DRAFT');
    const averageProgress =
      activeGoals.length > 0
        ? Math.round(
            (activeGoals.reduce((sum, g) => sum + g.progressPercentage, 0) / activeGoals.length) *
              100,
          ) / 100
        : 0;

    return {
      totalGoals,
      draft,
      pendingApproval,
      approved,
      inProgress,
      completed,
      cancelled,
      averageProgress,
      totalWeight,
    };
  }

  /**
   * 10. DELETE DRAFT GOAL
   */
  async deleteGoal(user: AuthenticatedUser, goalId: string) {
    const callerEmployee = await this.getEmployeeForUser(user.id, user.organizationId);

    const goal = await this.prisma.performanceGoal.findFirst({
      where: { id: goalId, organizationId: user.organizationId },
    });

    if (!goal) {
      throw new NotFoundException(`Goal #${goalId} not found`);
    }

    const isOwner = goal.employeeId === callerEmployee.id;
    const isHrAdmin = this.isHrOrAdmin(user);

    if (!isOwner && !isHrAdmin) {
      throw new ForbiddenException('Only the owner or HR can delete this goal');
    }

    if (goal.status !== 'DRAFT' && !isHrAdmin) {
      throw new BadRequestException('Employees can only delete goals in DRAFT status');
    }

    await this.prisma.performanceGoal.delete({
      where: { id: goalId },
    });

    await this.audit.record({
      action: 'GOAL_DELETED',
      entity: 'PerformanceGoal',
      entityId: goalId,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { title: goal.title },
    });

    return { success: true, message: 'Goal deleted successfully' };
  }
}
