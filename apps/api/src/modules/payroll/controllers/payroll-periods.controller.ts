import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import {
  CreatePayrollPeriodDto,
  QueryPayrollPeriodsDto,
  UpdatePayrollPeriodDto,
} from '../dto/payroll-period.dto';
import { PayrollPeriodsService } from '../services/payroll-periods.service';

@ApiTags('Payroll - Periods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payroll/periods')
export class PayrollPeriodsController {
  constructor(private readonly periodsService: PayrollPeriodsService) {}

  @Post()
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Create new payroll period with configurable deadlines' })
  @ApiResponse({ status: 201, description: 'Payroll period created' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollPeriodDto) {
    const data = await this.periodsService.create(user.organizationId, dto, user.id);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Payroll period created successfully',
      data,
    };
  }

  @Get()
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'List payroll periods with filters and run counts' })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPayrollPeriodsDto) {
    const data = await this.periodsService.findAll(user.organizationId, query);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll periods retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get payroll period details by ID' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.periodsService.findById(user.organizationId, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll period retrieved successfully',
      data,
    };
  }

  @Patch(':id')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Update payroll period deadlines and dates' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePayrollPeriodDto,
  ) {
    const data = await this.periodsService.update(user.organizationId, id, dto, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll period updated successfully',
      data,
    };
  }

  @Post(':id/close')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Close a payroll period (requires all runs finalized)' })
  async close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.periodsService.close(user.organizationId, id, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Payroll period closed successfully',
      data,
    };
  }
}
