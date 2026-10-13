import { Body, Controller, Get, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import {
  ApprovePayrollRunDto,
  CorrectionPayrollRunDto,
  CreatePayrollRunDto,
  LockPayrollRunDto,
  PreviewScopeDto,
  QueryPayrollRunsDto,
  RejectPayrollRunDto,
  ReturnForCorrectionDto,
} from '../dto/payroll-run.dto';
import { PayrollRunsService } from '../services/payroll-runs.service';

@ApiTags('Payroll - Runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payroll/runs')
export class PayrollRunsController {
  constructor(private readonly runsService: PayrollRunsService) {}

  @Post('scope/preview')
  @RequirePermissions('PAYROLL_VIEW', 'PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Preview eligible employee scope count and validation status' })
  async previewScope(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreviewScopeDto) {
    const data = await this.runsService.previewScope(user.organizationId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Scope preview calculated successfully',
      data,
    };
  }

  @Post()
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Create new payroll run in DRAFT status' })
  @ApiResponse({ status: 201, description: 'Payroll run initialized' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollRunDto) {
    const data = await this.runsService.create(user.organizationId, dto, user.id);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Payroll run created successfully',
      data,
    };
  }

  @Get()
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'List payroll runs with pagination, status, and period filters' })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPayrollRunsDto) {
    const result = await this.runsService.findAll(user.organizationId, query);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll runs retrieved successfully',
      ...result,
    };
  }

  @Get(':id')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get payroll run detail with approval history and totals' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.runsService.findById(user.organizationId, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll run details retrieved successfully',
      data,
    };
  }

  @Get(':id/snapshots')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get paginated employee payroll calculation snapshots for a run' })
  async getSnapshots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('isException') isException?: string,
  ) {
    const isEx = isException === 'true' ? true : isException === 'false' ? false : undefined;
    const result = await this.runsService.getSnapshots(user.organizationId, id, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
      isException: isEx,
    });
    return {
      statusCode: HttpStatus.OK,
      message: 'Employee snapshots retrieved successfully',
      ...result,
    };
  }

  @Post(':id/calculate')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Initiate calculation orchestration for a payroll run' })
  async calculate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.runsService.calculate(user.organizationId, id, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll calculation completed successfully',
      data,
    };
  }

  @Post(':id/retry')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Safely retry failed calculation orchestration' })
  async retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.runsService.retry(user.organizationId, id, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Calculation retried successfully',
      data,
    };
  }

  @Post(':id/recalculate')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Recalculate pre-lock payroll run with new version' })
  async recalculate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.runsService.recalculate(user.organizationId, id, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Run recalculated successfully',
      data,
    };
  }

  @Get(':id/review-summary')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get comprehensive payroll review summary and audit statistics' })
  async getReviewSummary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.runsService.getReviewSummary(user.organizationId, id, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll review summary retrieved successfully',
      data,
    };
  }

  @Post(':id/approve')
  @RequirePermissions('PAYROLL_APPROVE')
  @ApiOperation({ summary: 'Approve payroll run (transitions REVIEW_PENDING -> APPROVED)' })
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApprovePayrollRunDto,
  ) {
    const data = await this.runsService.approve(
      user.organizationId,
      id,
      dto,
      user.id,
      user.permissions,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll run approved successfully',
      data,
    };
  }

  @Post(':id/reject')
  @RequirePermissions('PAYROLL_APPROVE')
  @ApiOperation({ summary: 'Reject payroll run back to DRAFT with remarks' })
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectPayrollRunDto,
  ) {
    const data = await this.runsService.reject(user.organizationId, id, dto, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll run sent back to DRAFT',
      data,
    };
  }

  @Post(':id/return-for-correction')
  @RequirePermissions('PAYROLL_APPROVE')
  @ApiOperation({ summary: 'Return approved run for correction back to REVIEW_PENDING (pre-lock)' })
  async returnForCorrection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReturnForCorrectionDto,
  ) {
    const data = await this.runsService.returnForCorrection(user.organizationId, id, dto, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll run returned for correction successfully',
      data,
    };
  }

  @Post(':id/lock')
  @RequirePermissions('PAYROLL_APPROVE')
  @ApiOperation({ summary: 'Lock payroll run permanently (APPROVED -> LOCKED)' })
  async lock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LockPayrollRunDto,
  ) {
    const data = await this.runsService.lock(user.organizationId, id, dto, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll run locked successfully',
      data,
    };
  }

  @Post(':id/publish')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Publish payslips to employees (LOCKED -> PUBLISHED)' })
  async publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.runsService.publish(user.organizationId, id, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payslips published successfully',
      data,
    };
  }

  @Post(':id/cancel')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Cancel unfinalized payroll run' })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    const data = await this.runsService.cancel(
      user.organizationId,
      id,
      reason || 'Cancelled by user',
      user.id,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll run cancelled successfully',
      data,
    };
  }

  @Post(':id/correction')
  @RequirePermissions('PAYROLL_APPROVE')
  @ApiOperation({ summary: 'Initiate authorized post-lock correction run' })
  async createCorrectionRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CorrectionPayrollRunDto,
  ) {
    const data = await this.runsService.createCorrectionRun(user.organizationId, id, dto, user.id);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Correction payroll run created successfully',
      data,
    };
  }

  @Get(':id/snapshots/:snapshotId/calculation-detail')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get restricted itemized calculation detail and input snapshot' })
  async getSnapshotCalculationDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    const data = await this.runsService.getSnapshotCalculationDetail(
      user.organizationId,
      runId,
      snapshotId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Calculation detail retrieved successfully',
      data,
    };
  }

  @Get(':id/attendance-reconciliation')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get period attendance, leave, WFH, and visit reconciliation' })
  async getAttendanceReconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
  ) {
    const data = await this.runsService.getAttendanceReconciliation(user.organizationId, runId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Attendance and leave reconciliation retrieved successfully',
      data,
    };
  }

  @Get(':id/late-changes')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Detect late changes to attendance and leave since run calculation' })
  async getLateSourceChanges(@CurrentUser() user: AuthenticatedUser, @Param('id') runId: string) {
    const data = await this.runsService.getLateSourceChanges(user.organizationId, runId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Late source changes report generated successfully',
      data,
    };
  }

  @Post(':id/revalidate')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Re-run validation rules on an active payroll run' })
  async revalidate(@CurrentUser() user: AuthenticatedUser, @Param('id') runId: string) {
    const data = await this.runsService.revalidate(user.organizationId, runId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll run validation re-executed successfully',
      data,
    };
  }
}
