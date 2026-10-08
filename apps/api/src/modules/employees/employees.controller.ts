import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  TransitionStatusDto,
  EmployeeFilterDto,
} from './dto/employee.dto';
import { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

// -----------------------------------------------------------------------------
// 1. Employees Controller
// -----------------------------------------------------------------------------

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('EMPLOYEE_VIEW')
  @ApiOperation({ summary: 'List employees with role-scoped filtering, search and pagination' })
  async findAll(@Req() req: AuthenticatedRequest, @Query() query: EmployeeFilterDto) {
    const data = await this.employeesService.findAll(req.user, query);
    return {
      success: true,
      message: 'Employees retrieved successfully',
      data: data.items,
      meta: data.meta,
    };
  }

  @Get('export')
  @RequirePermissions('EMPLOYEE_EXPORT')
  @ApiOperation({ summary: 'Export scoped employees in CSV or Excel format' })
  async export(
    @Req() req: AuthenticatedRequest,
    @Query('format') format: 'csv' | 'xlsx' = 'csv',
    @Query() query: EmployeeFilterDto,
    @Res() res: Response,
  ) {
    const fileResult = await this.employeesService.exportEmployees(req.user, format, query);

    res.set({
      'Content-Type': fileResult.contentType,
      'Content-Disposition': `attachment; filename="${fileResult.filename}"`,
    });

    res.send(fileResult.buffer);
  }

  @Post('import/preview')
  @RequirePermissions('EMPLOYEE_IMPORT')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Preview and validate bulk employee upload (CSV/Excel)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async previewImport(@Req() req: AuthenticatedRequest, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file || !file.buffer) {
      throw new BadRequestException('A valid CSV or Excel file is required');
    }

    const data = await this.employeesService.previewImport(file.buffer, req.user.organizationId);

    return {
      success: true,
      message: 'Import file validated and preview generated',
      data,
    };
  }

  @Post('import/confirm')
  @RequirePermissions('EMPLOYEE_IMPORT')
  @ApiOperation({ summary: 'Confirm and commit validated bulk employee import' })
  async confirmImport(@Req() req: AuthenticatedRequest, @Body('rows') rows: any[]) {
    const result = await this.employeesService.confirmImport(rows, req.user);
    return {
      success: true,
      message: result.message,
      data: { count: result.count },
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current logged-in employee profile' })
  async findMe(@Req() req: AuthenticatedRequest) {
    const data = await this.employeesService.findMe(req.user);
    return {
      success: true,
      message: 'Current employee profile retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @RequirePermissions('EMPLOYEE_VIEW')
  @ApiOperation({ summary: 'Get full employee profile details (scoped)' })
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const data = await this.employeesService.findOne(id, req.user);
    return {
      success: true,
      message: 'Employee details retrieved successfully',
      data,
    };
  }

  @Post()
  @RequirePermissions('EMPLOYEE_CREATE')
  @ApiOperation({
    summary: 'Create new employee with multi-step normalized details (transactional)',
  })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateEmployeeDto) {
    const data = await this.employeesService.create(dto, req.user);
    return {
      success: true,
      message: 'Employee created successfully',
      data,
    };
  }

  @Put(':id')
  @RequirePermissions('EMPLOYEE_UPDATE')
  @ApiOperation({ summary: 'Update employee details and track organizational history' })
  async update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const data = await this.employeesService.update(id, dto, req.user);
    return {
      success: true,
      message: 'Employee updated successfully',
      data,
    };
  }

  @Patch(':id/status')
  @RequirePermissions('EMPLOYEE_UPDATE')
  @ApiOperation({ summary: 'Transition employee status along controlled lifecycle' })
  async transitionStatus(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: TransitionStatusDto,
  ) {
    const data = await this.employeesService.transitionStatus(id, dto, req.user);
    return {
      success: true,
      message: 'Employee status transitioned successfully',
      data,
    };
  }

  @Delete(':id')
  @RequirePermissions('EMPLOYEE_DELETE')
  @ApiOperation({ summary: 'Deactivate employee (soft status transition)' })
  async deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const result = await this.employeesService.deactivate(id, req.user);
    return {
      success: true,
      message: result.message,
    };
  }

  @Get(':id/history')
  @RequirePermissions('EMPLOYEE_HISTORY_VIEW')
  @ApiOperation({ summary: 'Get chronological history audit trail for an employee' })
  async getHistory(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const data = await this.employeesService.getHistory(id, req.user);
    return {
      success: true,
      message: 'Employee history retrieved successfully',
      data,
      meta: { total: data.length },
    };
  }
}

// -----------------------------------------------------------------------------
// 2. Org Chart Controller (/api/v1/org-chart)
// -----------------------------------------------------------------------------

@ApiTags('Org Chart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('org-chart')
export class OrgChartController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('ORG_CHART_VIEW')
  @ApiOperation({ summary: 'Get hierarchical organization chart tree' })
  async getOrgChart(
    @Req() req: AuthenticatedRequest,
    @Query('departmentId') departmentId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const data = await this.employeesService.getOrgChart({
      organizationId: req.user.organizationId,
      departmentId,
      branchId,
    });

    return {
      success: true,
      message: 'Organization chart retrieved successfully',
      data,
    };
  }
}
