import { Body, Controller, Get, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { PayrollValidationService } from '../services/payroll-validation.service';
import { QueryPayrollExceptionsDto, ResolvePayrollExceptionDto } from '@hrms/types';

@ApiTags('Payroll - Exceptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payroll')
export class PayrollExceptionsController {
  constructor(private readonly validationService: PayrollValidationService) {}

  @Get('exceptions')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({
    summary:
      'Query payroll exceptions with filtering by period, run, employee, department, severity, and status',
  })
  async getExceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPayrollExceptionsDto,
  ) {
    const result = await this.validationService.getExceptions(user.organizationId, query);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll exceptions retrieved successfully',
      ...result,
    };
  }

  @Get('exceptions/summary')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({
    summary: 'Get summary metrics of payroll exceptions (blocking errors, warnings, open)',
  })
  async getExceptionsSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('runId') runId?: string,
  ) {
    const data = await this.validationService.getExceptionsSummary(user.organizationId, runId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll exceptions summary retrieved successfully',
      data,
    };
  }

  @Get('runs/:runId/exceptions')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get exceptions specifically for a payroll run' })
  async getRunExceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
    @Query() query: QueryPayrollExceptionsDto,
  ) {
    const result = await this.validationService.getExceptions(user.organizationId, {
      ...query,
      runId,
    });
    return {
      statusCode: HttpStatus.OK,
      message: 'Run exceptions retrieved successfully',
      ...result,
    };
  }

  @Get('runs/:runId/exceptions/summary')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get exceptions summary specifically for a payroll run' })
  async getRunExceptionsSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
  ) {
    const data = await this.validationService.getExceptionsSummary(user.organizationId, runId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Run exceptions summary retrieved successfully',
      data,
    };
  }

  @Post('exceptions/:id/resolve')
  @RequirePermissions('PAYROLL_MANAGE', 'PAYROLL_APPROVE')
  @ApiOperation({
    summary:
      'Resolve, dismiss, or manually override a payroll exception with mandatory audit notes',
  })
  @ApiResponse({ status: 200, description: 'Payroll exception resolved' })
  async resolveException(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') exceptionId: string,
    @Body() dto: ResolvePayrollExceptionDto,
  ) {
    const data = await this.validationService.resolveException(
      user.organizationId,
      exceptionId,
      dto,
      user.id,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll exception resolved successfully',
      data,
    };
  }
}
