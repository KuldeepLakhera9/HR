import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
import { SalaryStructuresService } from '../services/salary-structures.service';
import {
  CreateSalaryStructureDto,
  UpdateSalaryStructureDto,
  CloneSalaryStructureDto,
  PreviewSalaryStructureDto,
  QuerySalaryStructureDto,
} from '../dto/salary-structure.dto';

@ApiTags('Payroll - Salary Structures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payroll/structures')
export class SalaryStructuresController {
  constructor(private readonly structuresService: SalaryStructuresService) {}

  @Get()
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'List salary structures with versions' })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QuerySalaryStructureDto) {
    return this.structuresService.findAll(user, query);
  }

  @Get(':id')
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Get salary structure by ID' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.structuresService.findById(user, id);
  }

  @Post()
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Create new salary structure' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSalaryStructureDto) {
    return this.structuresService.create(user, dto);
  }

  @Put(':id')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Update salary structure' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalaryStructureDto,
  ) {
    return this.structuresService.update(user, id, dto);
  }

  @Post(':id/clone')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Clone salary structure to new version or new code' })
  async clone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloneSalaryStructureDto,
  ) {
    return this.structuresService.clone(user, id, dto);
  }

  @Patch(':id/activate')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Activate salary structure' })
  async activate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.structuresService.activate(user, id);
  }

  @Patch(':id/retire')
  @RequirePermissions('PAYROLL_MANAGE')
  @ApiOperation({ summary: 'Retire salary structure' })
  async retire(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.structuresService.retire(user, id);
  }

  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('PAYROLL_VIEW')
  @ApiOperation({ summary: 'Simulate and preview salary breakdown for sample CTC' })
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PreviewSalaryStructureDto,
  ) {
    return this.structuresService.preview(user, id, dto);
  }
}
