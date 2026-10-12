import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { EmployeeCompensationService } from '../services/employee-compensation.service';
import {
  CreateEmployeeCompensationDto,
  ApproveCompensationDto,
  RejectCompensationDto,
  ApplicableCompensationQueryDto,
} from '../dto/employee-compensation.dto';

@ApiTags('Payroll - Employee Compensation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payroll')
export class EmployeeCompensationController {
  constructor(private readonly compensationService: EmployeeCompensationService) {}

  @Get('employees/:employeeId/compensation')
  @RequirePermissions('PAYROLL_VIEW', 'PAYROLL_COMPENSATION')
  @ApiOperation({ summary: 'Get employee compensation history and current applicable assignment' })
  @ApiResponse({
    status: 200,
    description: 'Chronological compensation history and current assignment',
  })
  async getEmployeeCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    const data = await this.compensationService.getEmployeeCompensationHistory(user, employeeId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Employee compensation retrieved successfully',
      data,
    };
  }

  @Post('employees/:employeeId/compensation')
  @RequirePermissions('PAYROLL_COMPENSATION', 'PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Create new compensation assignment or schedule future revision' })
  @ApiResponse({ status: 201, description: 'Compensation assignment created' })
  async createCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateEmployeeCompensationDto,
  ) {
    const data = await this.compensationService.createAssignment(user, employeeId, dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Compensation assignment created successfully',
      data,
    };
  }

  @Post('compensations/:id/approve')
  @RequirePermissions('PAYROLL_APPROVE', 'PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Approve a pending compensation change' })
  @ApiResponse({ status: 200, description: 'Compensation approved and activated' })
  async approveCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveCompensationDto,
  ) {
    const data = await this.compensationService.approve(user, id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Compensation approved successfully',
      data,
    };
  }

  @Post('compensations/:id/reject')
  @RequirePermissions('PAYROLL_APPROVE', 'PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Reject a pending compensation change' })
  @ApiResponse({ status: 200, description: 'Compensation change rejected' })
  async rejectCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectCompensationDto,
  ) {
    const data = await this.compensationService.reject(user, id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Compensation change rejected',
      data,
    };
  }

  @Post('compensations/:id/cancel')
  @RequirePermissions('PAYROLL_COMPENSATION', 'PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Cancel a draft or pending compensation assignment' })
  @ApiResponse({ status: 200, description: 'Compensation cancelled' })
  async cancelCompensation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.compensationService.cancel(user, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Compensation assignment cancelled',
      data,
    };
  }

  @Get('employees/:employeeId/compensation/applicable')
  @RequirePermissions('PAYROLL_VIEW', 'PAYROLL_COMPENSATION')
  @ApiOperation({
    summary: 'Determine applicable compensation and mid-period segments for a payroll period',
  })
  @ApiResponse({
    status: 200,
    description: 'Effective compensation segments and proration factors',
  })
  async getApplicableCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Query() query: ApplicableCompensationQueryDto,
  ) {
    const data = await this.compensationService.getApplicableForPeriod(user, employeeId, query);
    return {
      statusCode: HttpStatus.OK,
      message: 'Applicable compensation evaluated',
      data,
    };
  }

  @Get('employees/:employeeId/compensation/export')
  @RequirePermissions('PAYROLL_EXPORT', 'PAYROLL_COMPENSATION')
  @ApiOperation({ summary: 'Secure export of employee compensation history' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const csv = await this.compensationService.exportCompensationHistory(user, employeeId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="compensation_history_${employeeId}_${new Date().toISOString().split('T')[0]}.csv"`,
    );
    res.send(csv);
  }
}
