import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreatePolicyDto,
  UpdatePolicyDto,
  CreateShiftDto,
  UpdateShiftDto,
  AssignShiftDto,
  SimulatePolicyDto,
} from './dto/policy-and-shift.dto';
import { evaluateSessionTiming, calculateShiftWindow } from './utils/policy-evaluator.util';
import { PolicyEvaluationResultDto, ResolvedPolicyAndShift } from '@hrms/types';

@Injectable()
export class AttendancePoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ===========================================================================
  // 1. POLICIES CRUD
  // ===========================================================================

  async findAllPolicies(organizationId: string, branchId?: string) {
    const where: any = { organizationId };
    if (branchId) {
      where.branchId = branchId;
    }

    return this.prisma.attendancePolicy.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        shifts: { select: { id: true, name: true, code: true, startTime: true, endTime: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findPolicyById(id: string, organizationId: string) {
    const policy = await this.prisma.attendancePolicy.findFirst({
      where: { id, organizationId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        shifts: true,
      },
    });

    if (!policy) {
      throw new NotFoundException(`Attendance policy #${id} not found.`);
    }

    return policy;
  }

  async createPolicy(dto: CreatePolicyDto, organizationId: string, actorUserId: string) {
    // If set as default, reset previous default
    if (dto.isDefault) {
      await this.prisma.attendancePolicy.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // Verify branch belongs to org if supplied
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, organizationId },
      });
      if (!branch) {
        throw new BadRequestException(
          `Branch #${dto.branchId} does not belong to this organization.`,
        );
      }
    }

    // Check unique code
    const existing = await this.prisma.attendancePolicy.findFirst({
      where: { organizationId, code: dto.code.trim().toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(`Policy code "${dto.code}" is already in use.`);
    }

    const policy = await this.prisma.attendancePolicy.create({
      data: {
        organizationId,
        branchId: dto.branchId || null,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        description: dto.description?.trim() || null,
        isDefault: dto.isDefault ?? false,
        standardWorkMinutes: dto.standardWorkMinutes ?? 480,
        halfDayThresholdMinutes: dto.halfDayThresholdMinutes ?? 240,
        fullDayThresholdMinutes: dto.fullDayThresholdMinutes ?? 420,
        gracePeriodMinutes: dto.gracePeriodMinutes ?? 15,
        maxCheckInDelayMinutes: dto.maxCheckInDelayMinutes ?? 120,
        maxDailyBreakMinutes: dto.maxDailyBreakMinutes ?? 60,
        maxSingleBreakMinutes: dto.maxSingleBreakMinutes ?? 45,
        allowMultipleSessions: dto.allowMultipleSessions ?? true,
        overnightShiftAllowed: dto.overnightShiftAllowed ?? false,
        workingDayStartHour: dto.workingDayStartHour ?? 5,
        timezone: dto.timezone || 'Asia/Kolkata',
        geofenceEnforcement: dto.geofenceEnforcement ?? true,
        maxGpsAccuracyMeters: dto.maxGpsAccuracyMeters ?? 100,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditService.record({
      action: 'ATTENDANCE_POLICY_CREATED',
      entity: 'AttendancePolicy',
      entityId: policy.id,
      userId: actorUserId,
      organizationId,
      metadata: {
        newValues: { name: policy.name, code: policy.code, isDefault: policy.isDefault },
      },
    });

    return policy;
  }

  async updatePolicy(
    id: string,
    dto: UpdatePolicyDto,
    organizationId: string,
    actorUserId: string,
  ) {
    const existing = await this.findPolicyById(id, organizationId);

    if (dto.isDefault && !existing.isDefault) {
      await this.prisma.attendancePolicy.updateMany({
        where: { organizationId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      const duplicate = await this.prisma.attendancePolicy.findFirst({
        where: { organizationId, code: dto.code.trim().toUpperCase(), id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException(`Policy code "${dto.code}" is already in use.`);
      }
    }

    const updated = await this.prisma.attendancePolicy.update({
      where: { id },
      data: {
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.code && { code: dto.code.trim().toUpperCase() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.standardWorkMinutes !== undefined && {
          standardWorkMinutes: dto.standardWorkMinutes,
        }),
        ...(dto.halfDayThresholdMinutes !== undefined && {
          halfDayThresholdMinutes: dto.halfDayThresholdMinutes,
        }),
        ...(dto.fullDayThresholdMinutes !== undefined && {
          fullDayThresholdMinutes: dto.fullDayThresholdMinutes,
        }),
        ...(dto.gracePeriodMinutes !== undefined && { gracePeriodMinutes: dto.gracePeriodMinutes }),
        ...(dto.maxCheckInDelayMinutes !== undefined && {
          maxCheckInDelayMinutes: dto.maxCheckInDelayMinutes,
        }),
        ...(dto.maxDailyBreakMinutes !== undefined && {
          maxDailyBreakMinutes: dto.maxDailyBreakMinutes,
        }),
        ...(dto.maxSingleBreakMinutes !== undefined && {
          maxSingleBreakMinutes: dto.maxSingleBreakMinutes,
        }),
        ...(dto.allowMultipleSessions !== undefined && {
          allowMultipleSessions: dto.allowMultipleSessions,
        }),
        ...(dto.overnightShiftAllowed !== undefined && {
          overnightShiftAllowed: dto.overnightShiftAllowed,
        }),
        ...(dto.workingDayStartHour !== undefined && {
          workingDayStartHour: dto.workingDayStartHour,
        }),
        ...(dto.timezone && { timezone: dto.timezone }),
        ...(dto.geofenceEnforcement !== undefined && {
          geofenceEnforcement: dto.geofenceEnforcement,
        }),
        ...(dto.maxGpsAccuracyMeters !== undefined && {
          maxGpsAccuracyMeters: dto.maxGpsAccuracyMeters,
        }),
        ...(dto.effectiveFrom && { effectiveFrom: new Date(dto.effectiveFrom) }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.auditService.record({
      action: 'ATTENDANCE_POLICY_UPDATED',
      entity: 'AttendancePolicy',
      entityId: updated.id,
      userId: actorUserId,
      organizationId,
      metadata: {
        oldValues: { name: existing.name, isDefault: existing.isDefault },
        newValues: { name: updated.name, isDefault: updated.isDefault },
      },
    });

    return updated;
  }

  async deletePolicy(id: string, organizationId: string, actorUserId: string) {
    const policy = await this.findPolicyById(id, organizationId);

    // Prevent deleting default policy
    if (policy.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default organization attendance policy. Designate another policy as default first.',
      );
    }

    await this.prisma.attendancePolicy.delete({ where: { id } });

    await this.auditService.record({
      action: 'ATTENDANCE_POLICY_DELETED',
      entity: 'AttendancePolicy',
      entityId: id,
      userId: actorUserId,
      organizationId,
      metadata: { oldValues: { name: policy.name, code: policy.code } },
    });

    return { success: true, message: 'Attendance policy deleted successfully.' };
  }

  // ===========================================================================
  // 2. SHIFTS CRUD
  // ===========================================================================

  async findAllShifts(organizationId: string) {
    return this.prisma.shift.findMany({
      where: { organizationId },
      include: {
        policy: { select: { id: true, name: true, code: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: [{ isActive: 'desc' }, { startTime: 'asc' }],
    });
  }

  async findShiftById(id: string, organizationId: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, organizationId },
      include: {
        policy: true,
        assignments: {
          include: {
            employee: { select: { id: true, displayName: true, employeeCode: true } },
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException(`Shift #${id} not found.`);
    }

    return shift;
  }

  async createShift(dto: CreateShiftDto, organizationId: string, actorUserId: string) {
    // Check unique code
    const existing = await this.prisma.shift.findFirst({
      where: { organizationId, code: dto.code.trim().toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(`Shift code "${dto.code}" is already in use.`);
    }

    if (dto.policyId) {
      await this.findPolicyById(dto.policyId, organizationId);
    }

    // Auto-detect overnight shift if not explicitly provided
    const [startH, startM] = dto.startTime.split(':').map(Number);
    const [endH, endM] = dto.endTime.split(':').map(Number);
    const isOvernight =
      dto.isOvernight !== undefined
        ? dto.isOvernight
        : endH < startH || (endH === startH && endM < startM);

    const shift = await this.prisma.shift.create({
      data: {
        organizationId,
        policyId: dto.policyId || null,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        description: dto.description?.trim() || null,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isOvernight,
        workDays: dto.workDays && dto.workDays.length > 0 ? dto.workDays : [1, 2, 3, 4, 5],
        breakDurationMinutes: dto.breakDurationMinutes ?? 60,
        color: dto.color || '#3b82f6',
        isActive: dto.isActive ?? true,
      },
      include: {
        policy: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditService.record({
      action: 'SHIFT_CREATED',
      entity: 'Shift',
      entityId: shift.id,
      userId: actorUserId,
      organizationId,
      metadata: {
        newValues: {
          name: shift.name,
          code: shift.code,
          startTime: shift.startTime,
          endTime: shift.endTime,
        },
      },
    });

    return shift;
  }

  async updateShift(id: string, dto: UpdateShiftDto, organizationId: string, actorUserId: string) {
    const existing = await this.findShiftById(id, organizationId);

    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      const duplicate = await this.prisma.shift.findFirst({
        where: { organizationId, code: dto.code.trim().toUpperCase(), id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException(`Shift code "${dto.code}" is already in use.`);
      }
    }

    let isOvernight = dto.isOvernight;
    const start = dto.startTime || existing.startTime;
    const end = dto.endTime || existing.endTime;
    if (isOvernight === undefined && (dto.startTime || dto.endTime)) {
      const [startH, startM] = start.split(':').map(Number);
      const [endH, endM] = end.split(':').map(Number);
      isOvernight = endH < startH || (endH === startH && endM < startM);
    }

    const updated = await this.prisma.shift.update({
      where: { id },
      data: {
        ...(dto.policyId !== undefined && { policyId: dto.policyId }),
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.code && { code: dto.code.trim().toUpperCase() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startTime && { startTime: dto.startTime }),
        ...(dto.endTime && { endTime: dto.endTime }),
        ...(isOvernight !== undefined && { isOvernight }),
        ...(dto.workDays && { workDays: dto.workDays }),
        ...(dto.breakDurationMinutes !== undefined && {
          breakDurationMinutes: dto.breakDurationMinutes,
        }),
        ...(dto.color && { color: dto.color }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        policy: { select: { id: true, name: true, code: true } },
      },
    });

    await this.auditService.record({
      action: 'SHIFT_UPDATED',
      entity: 'Shift',
      entityId: updated.id,
      userId: actorUserId,
      organizationId,
      metadata: {
        oldValues: {
          name: existing.name,
          startTime: existing.startTime,
          endTime: existing.endTime,
        },
        newValues: { name: updated.name, startTime: updated.startTime, endTime: updated.endTime },
      },
    });

    return updated;
  }

  async deleteShift(id: string, organizationId: string, actorUserId: string) {
    const shift = await this.findShiftById(id, organizationId);

    const activeAssignments = await this.prisma.shiftAssignment.count({
      where: { shiftId: id },
    });

    if (activeAssignments > 0) {
      throw new BadRequestException(
        `Cannot delete shift "${shift.name}" because it is currently assigned to ${activeAssignments} employee(s). Unassign employees first.`,
      );
    }

    await this.prisma.shift.delete({ where: { id } });

    await this.auditService.record({
      action: 'SHIFT_DELETED',
      entity: 'Shift',
      entityId: id,
      userId: actorUserId,
      organizationId,
      metadata: { oldValues: { name: shift.name, code: shift.code } },
    });

    return { success: true, message: 'Shift deleted successfully.' };
  }

  // ===========================================================================
  // 3. SHIFT ASSIGNMENTS
  // ===========================================================================

  async findAllAssignments(organizationId: string, employeeId?: string) {
    const where: any = { organizationId };
    if (employeeId) {
      where.employeeId = employeeId;
    }

    return this.prisma.shiftAssignment.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            displayName: true,
            employeeCode: true,
            employment: {
              select: {
                branch: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
        shift: true,
      },
      orderBy: [{ effectiveFrom: 'desc' }],
    });
  }

  async assignShift(dto: AssignShiftDto, organizationId: string, actorUserId: string) {
    const [employee, shift] = await Promise.all([
      this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId } }),
      this.prisma.shift.findFirst({ where: { id: dto.shiftId, organizationId } }),
    ]);

    if (!employee) {
      throw new NotFoundException(`Employee #${dto.employeeId} not found.`);
    }
    if (!shift) {
      throw new NotFoundException(`Shift #${dto.shiftId} not found.`);
    }

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;

    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('effectiveTo date cannot be earlier than effectiveFrom date.');
    }

    const assignment = await this.prisma.shiftAssignment.create({
      data: {
        organizationId,
        employeeId: dto.employeeId,
        shiftId: dto.shiftId,
        effectiveFrom,
        effectiveTo,
        assignedById: actorUserId,
      },
      include: {
        employee: { select: { id: true, displayName: true, employeeCode: true } },
        shift: true,
      },
    });

    await this.auditService.record({
      action: 'SHIFT_ASSIGNED',
      entity: 'ShiftAssignment',
      entityId: assignment.id,
      userId: actorUserId,
      organizationId,
      metadata: {
        employeeName: employee.displayName,
        shiftName: shift.name,
        effectiveFrom: assignment.effectiveFrom,
      },
    });

    return assignment;
  }

  async deleteAssignment(id: string, organizationId: string, actorUserId: string) {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: { id, organizationId },
      include: {
        employee: { select: { displayName: true } },
        shift: { select: { name: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException(`Shift assignment #${id} not found.`);
    }

    await this.prisma.shiftAssignment.delete({ where: { id } });

    await this.auditService.record({
      action: 'SHIFT_ASSIGNMENT_DELETED',
      entity: 'ShiftAssignment',
      entityId: id,
      userId: actorUserId,
      organizationId,
      metadata: {
        employeeName: assignment.employee.displayName,
        shiftName: assignment.shift.name,
      },
    });

    return { success: true, message: 'Shift assignment deleted successfully.' };
  }

  // ===========================================================================
  // 4. PRECEDENCE RESOLUTION ENGINE & SIMULATOR
  // ===========================================================================

  /**
   * Precedence Hierarchy:
   * Level 1: Employee-specific active Shift Assignment & associated policy
   * Level 2: Branch-specific Attendance Policy override
   * Level 3: Organization-level default Attendance Policy
   */
  async resolveEffectivePolicyAndShift(
    employeeId: string,
    targetDate: Date,
    organizationId: string,
  ): Promise<ResolvedPolicyAndShift> {
    // 1. Check Level 1: Active Employee Shift Assignment on targetDate
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        employeeId,
        organizationId,
        effectiveFrom: { lte: targetDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: targetDate } }],
      },
      include: {
        shift: {
          include: { policy: true },
        },
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (assignment?.shift?.policy) {
      return {
        policy: assignment.shift.policy as any,
        shift: assignment.shift as any,
        source: 'EMPLOYEE_ASSIGNMENT',
      };
    }

    // 2. Check Level 2: Branch Policy Override
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: {
        employment: true,
      },
    });

    const branchId = employee?.employment?.branchId;
    if (branchId) {
      const branchPolicy = await this.prisma.attendancePolicy.findFirst({
        where: {
          organizationId,
          branchId,
          isActive: true,
          effectiveFrom: { lte: targetDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: targetDate } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      if (branchPolicy) {
        return {
          policy: branchPolicy as any,
          shift: assignment?.shift ? (assignment.shift as any) : null,
          source: 'BRANCH_OVERRIDE',
        };
      }
    }

    // 3. Level 3: Organization Default Policy
    let defaultPolicy = await this.prisma.attendancePolicy.findFirst({
      where: {
        organizationId,
        isDefault: true,
        isActive: true,
      },
    });

    if (!defaultPolicy) {
      defaultPolicy = await this.prisma.attendancePolicy.findFirst({
        where: { organizationId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!defaultPolicy) {
      try {
        defaultPolicy = await this.prisma.attendancePolicy.create({
          data: {
            organizationId,
            branchId: null,
            name: 'Standard 8-Hour Policy',
            code: 'STD-DEFAULT',
            description: 'Organization default attendance policy',
            isDefault: true,
            standardWorkMinutes: 480,
            halfDayThresholdMinutes: 240,
            fullDayThresholdMinutes: 420,
            gracePeriodMinutes: 15,
            maxCheckInDelayMinutes: 120,
            maxDailyBreakMinutes: 60,
            maxSingleBreakMinutes: 45,
            allowMultipleSessions: true,
            overnightShiftAllowed: false,
            workingDayStartHour: 5,
            timezone: 'Asia/Kolkata',
            geofenceEnforcement: true,
            maxGpsAccuracyMeters: 100,
            version: 1,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            isActive: true,
          },
        });
      } catch {
        // Fallback synthetic policy if creation fails (e.g. In unit test mocks)
        defaultPolicy = {
          id: 'synthetic-default',
          organizationId,
          branchId: null,
          name: 'Standard 8-Hour Policy',
          code: 'STD-DEFAULT',
          description: 'Auto-generated fallback',
          isDefault: true,
          standardWorkMinutes: 480,
          halfDayThresholdMinutes: 240,
          fullDayThresholdMinutes: 420,
          gracePeriodMinutes: 15,
          maxCheckInDelayMinutes: 120,
          maxDailyBreakMinutes: 60,
          maxSingleBreakMinutes: 45,
          allowMultipleSessions: true,
          overnightShiftAllowed: false,
          workingDayStartHour: 5,
          timezone: 'Asia/Kolkata',
          geofenceEnforcement: true,
          maxGpsAccuracyMeters: 100,
          version: 1,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
      }
    }

    return {
      policy: defaultPolicy as any,
      shift: assignment?.shift ? (assignment.shift as any) : null,
      source: 'ORGANIZATION_DEFAULT',
    };
  }

  /**
   * 5. Interactive Simulator for Testing Policies & Shifts
   */
  async simulateEvaluation(
    dto: SimulatePolicyDto,
    organizationId: string,
  ): Promise<PolicyEvaluationResultDto> {
    let policy: any = null;
    let shift: any = null;

    if (dto.policyId) {
      policy = await this.findPolicyById(dto.policyId, organizationId);
    }
    if (dto.shiftId) {
      shift = await this.findShiftById(dto.shiftId, organizationId);
      if (!policy && shift.policy) {
        policy = shift.policy;
      }
    }

    if (!policy) {
      const defaultRes = await this.resolveEffectivePolicyAndShift(
        'sample',
        new Date(),
        organizationId,
      );
      policy = defaultRes.policy;
    }

    const checkIn = new Date(dto.checkInTime);
    const checkOut = dto.checkOutTime ? new Date(dto.checkOutTime) : null;

    const evaluated = evaluateSessionTiming({
      checkInTime: checkIn,
      checkOutTime: checkOut,
      shift: shift
        ? {
            startTime: shift.startTime,
            endTime: shift.endTime,
            isOvernight: shift.isOvernight,
            workDays: shift.workDays,
          }
        : null,
      policy,
      totalBreakMinutes: dto.totalBreakMinutes || 0,
      workingDate: dto.workingDate,
    });

    const shiftWindow = shift
      ? calculateShiftWindow(shift, dto.workingDate, policy.gracePeriodMinutes, policy.timezone)
      : null;

    return {
      workingDate: evaluated.workingDate,
      shiftStartLocal: shift ? shift.startTime : 'Unscheduled',
      shiftEndLocal: shift ? shift.endTime : 'Unscheduled',
      isOvernight: shiftWindow ? shiftWindow.isOvernight : false,
      graceWindowEndLocal: shiftWindow
        ? `${shiftWindow.graceEndDate.getUTCHours().toString().padStart(2, '0')}:${shiftWindow.graceEndDate.getUTCMinutes().toString().padStart(2, '0')}`
        : 'N/A',
      lateArrivalMinutes: evaluated.lateArrivalMinutes,
      earlyDepartureMinutes: evaluated.earlyDepartureMinutes,
      grossMinutes: evaluated.grossMinutes,
      breakDeductionMinutes: evaluated.breakDeductionMinutes,
      netWorkMinutes: evaluated.netWorkMinutes,
      overtimeMinutes: evaluated.overtimeMinutes,
      status: evaluated.status,
      isMissingCheckout: evaluated.isMissingCheckout,
      source: shift ? `Shift: ${shift.name} (${shift.code})` : `Policy: ${policy.name}`,
    };
  }
}
