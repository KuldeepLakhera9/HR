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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { SalaryComponentsService } from '../services/salary-components.service';
import {
  CreateSalaryComponentDto,
  UpdateSalaryComponentDto,
  QuerySalaryComponentDto,
} from '../dto/salary-component.dto';

@ApiTags('Payroll - Salary Components')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payroll/components')
export class SalaryComponentsController {
  constructor(private readonly componentsService: SalaryComponentsService) {}

  @Get()
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'List all salary components with filters' })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QuerySalaryComponentDto) {
    return this.componentsService.findAll(user, query);
  }

  @Get(':id')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get single salary component by ID' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.componentsService.findById(user, id);
  }

  @Post()
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Create new salary component definition' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSalaryComponentDto) {
    return this.componentsService.create(user, dto);
  }

  @Put(':id')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Update salary component definition' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalaryComponentDto,
  ) {
    return this.componentsService.update(user, id, dto);
  }

  @Delete(':id/retire')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Retire / Deactivate salary component' })
  async retire(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.componentsService.retire(user, id);
  }
}
