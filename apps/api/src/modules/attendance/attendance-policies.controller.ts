import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AttendancePoliciesService } from './attendance-policies.service';
import {
  CreatePolicyDto,
  UpdatePolicyDto,
  CreateShiftDto,
  UpdateShiftDto,
  AssignShiftDto,
  SimulatePolicyDto,
} from './dto/policy-and-shift.dto';
import { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

@ApiTags('Attendance Policies & Shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('attendance/policies')
export class AttendancePoliciesController {
  constructor(private readonly policiesService: AttendancePoliciesService) {}

  @Get()
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'List all attendance policies for organization' })
  async findAllPolicies(@Req() req: AuthenticatedRequest, @Query('branchId') branchId?: string) {
    const data = await this.policiesService.findAllPolicies(req.user.organizationId, branchId);
    return {
      success: true,
      message: 'Attendance policies retrieved successfully.',
      data,
    };
  }

  @Get(':id')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'Get attendance policy details by ID' })
  async findPolicyById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const data = await this.policiesService.findPolicyById(id, req.user.organizationId);
    return {
      success: true,
      message: 'Attendance policy details retrieved successfully.',
      data,
    };
  }

  @Post()
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Create new attendance policy (Admin only)' })
  async createPolicy(@Req() req: AuthenticatedRequest, @Body() dto: CreatePolicyDto) {
    const data = await this.policiesService.createPolicy(dto, req.user.organizationId, req.user.id);
    return {
      success: true,
      message: 'Attendance policy created successfully.',
      data,
    };
  }

  @Put(':id')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Update attendance policy (Admin only)' })
  async updatePolicy(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    const data = await this.policiesService.updatePolicy(
      id,
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: 'Attendance policy updated successfully.',
      data,
    };
  }

  @Delete(':id')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Delete attendance policy (Admin only)' })
  async deletePolicy(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.policiesService.deletePolicy(id, req.user.organizationId, req.user.id);
  }

  @Post('simulate')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'Simulate policy and shift evaluation for testing' })
  async simulate(@Req() req: AuthenticatedRequest, @Body() dto: SimulatePolicyDto) {
    const data = await this.policiesService.simulateEvaluation(dto, req.user.organizationId);
    return {
      success: true,
      message: 'Policy simulation evaluated successfully.',
      data,
    };
  }
}

@ApiTags('Attendance Shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('attendance/shifts')
export class AttendanceShiftsController {
  constructor(private readonly policiesService: AttendancePoliciesService) {}

  @Get()
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'List all shifts defined for organization' })
  async findAllShifts(@Req() req: AuthenticatedRequest) {
    const data = await this.policiesService.findAllShifts(req.user.organizationId);
    return {
      success: true,
      message: 'Shifts retrieved successfully.',
      data,
    };
  }

  @Get(':id')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'Get shift by ID' })
  async findShiftById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const data = await this.policiesService.findShiftById(id, req.user.organizationId);
    return {
      success: true,
      message: 'Shift details retrieved successfully.',
      data,
    };
  }

  @Post()
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Create new shift schedule (Admin only)' })
  async createShift(@Req() req: AuthenticatedRequest, @Body() dto: CreateShiftDto) {
    const data = await this.policiesService.createShift(dto, req.user.organizationId, req.user.id);
    return {
      success: true,
      message: 'Shift schedule created successfully.',
      data,
    };
  }

  @Put(':id')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Update shift schedule (Admin only)' })
  async updateShift(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    const data = await this.policiesService.updateShift(
      id,
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: 'Shift schedule updated successfully.',
      data,
    };
  }

  @Delete(':id')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Delete shift schedule (Admin only)' })
  async deleteShift(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.policiesService.deleteShift(id, req.user.organizationId, req.user.id);
  }

  // Shift Assignments subroutes
  @Get('assignments/list')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'List shift assignments' })
  async findAllAssignments(
    @Req() req: AuthenticatedRequest,
    @Query('employeeId') employeeId?: string,
  ) {
    const data = await this.policiesService.findAllAssignments(req.user.organizationId, employeeId);
    return {
      success: true,
      message: 'Shift assignments retrieved successfully.',
      data,
    };
  }

  @Post('assignments')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Assign shift schedule to employee' })
  async assignShift(@Req() req: AuthenticatedRequest, @Body() dto: AssignShiftDto) {
    const data = await this.policiesService.assignShift(dto, req.user.organizationId, req.user.id);
    return {
      success: true,
      message: 'Shift assigned to employee successfully.',
      data,
    };
  }

  @Delete('assignments/:id')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Delete shift assignment' })
  async deleteAssignment(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.policiesService.deleteAssignment(id, req.user.organizationId, req.user.id);
  }
}
