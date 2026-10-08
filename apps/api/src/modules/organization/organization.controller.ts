import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
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
import { OrganizationService } from './organization.service';
import {
  UpdateOrganizationDto,
  CreateBranchDto,
  UpdateBranchDto,
  BranchFilterDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  DepartmentFilterDto,
  CreateDesignationDto,
  UpdateDesignationDto,
  DesignationFilterDto,
  DeactivateEntityDto,
} from './dto/organization.dto';
import { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

// -----------------------------------------------------------------------------
// 1. Organization Controller
// -----------------------------------------------------------------------------

@ApiTags('Organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('overview')
  @RequirePermissions('ORGANIZATION_VIEW')
  @ApiOperation({ summary: 'Get organization hierarchy and structure overview' })
  async getOverview(@Req() req: AuthenticatedRequest) {
    const data = await this.organizationService.getOverview(req.user.organizationId);
    return {
      success: true,
      message: 'Organization overview retrieved successfully',
      data,
    };
  }

  @Get('current')
  @RequirePermissions('ORGANIZATION_VIEW')
  @ApiOperation({ summary: 'Get current organization details' })
  async getCurrent(@Req() req: AuthenticatedRequest) {
    const data = await this.organizationService.getOrganization(req.user.organizationId);
    return {
      success: true,
      message: 'Organization details retrieved successfully',
      data,
    };
  }

  @Put('current')
  @RequirePermissions('ORGANIZATION_UPDATE')
  @ApiOperation({ summary: 'Update organization details (PUT)' })
  async updateCurrent(@Req() req: AuthenticatedRequest, @Body() dto: UpdateOrganizationDto) {
    const data = await this.organizationService.updateOrganization(
      req.user.organizationId,
      dto,
      req.user.id,
    );
    return {
      success: true,
      message: 'Organization details updated successfully',
      data,
    };
  }

  @Patch('current')
  @RequirePermissions('ORGANIZATION_UPDATE')
  @ApiOperation({ summary: 'Partially update organization details (PATCH)' })
  async patchCurrent(@Req() req: AuthenticatedRequest, @Body() dto: UpdateOrganizationDto) {
    const data = await this.organizationService.updateOrganization(
      req.user.organizationId,
      dto,
      req.user.id,
    );
    return {
      success: true,
      message: 'Organization details updated successfully',
      data,
    };
  }
}

// Legacy alias controller to maintain compatibility with Phase 1 `/organization`
@ApiTags('Organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('organization')
export class OrganizationLegacyController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('overview')
  @RequirePermissions('ORGANIZATION_VIEW')
  @ApiOperation({ summary: 'Get organization hierarchy overview' })
  async getOverview(@Req() req: AuthenticatedRequest) {
    const data = await this.organizationService.getOverview(req.user.organizationId);
    return {
      success: true,
      message: 'Organization overview retrieved successfully',
      data,
    };
  }
}

// -----------------------------------------------------------------------------
// 2. Branches Controller
// -----------------------------------------------------------------------------

@ApiTags('Branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @RequirePermissions('BRANCH_VIEW')
  @ApiOperation({ summary: 'List all branches with pagination, search, status, and sorting' })
  async findAll(@Req() req: AuthenticatedRequest, @Query() query: BranchFilterDto) {
    const result = await this.organizationService.findAllBranches({
      organizationId: req.user.organizationId,
      ...query,
    });
    return {
      success: true,
      message: 'Branches retrieved successfully',
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @RequirePermissions('BRANCH_VIEW')
  @ApiOperation({ summary: 'Get branch details by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.organizationService.findBranchById(id);
    return {
      success: true,
      message: 'Branch details retrieved successfully',
      data,
    };
  }

  @Post()
  @RequirePermissions('BRANCH_CREATE')
  @ApiOperation({ summary: 'Create new branch' })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateBranchDto) {
    const data = await this.organizationService.createBranch(
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: 'Branch created successfully',
      data,
    };
  }

  @Put(':id')
  @RequirePermissions('BRANCH_UPDATE')
  @ApiOperation({ summary: 'Update branch details (PUT)' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    const data = await this.organizationService.updateBranch(id, dto, req.user.id);
    return {
      success: true,
      message: 'Branch updated successfully',
      data,
    };
  }

  @Patch(':id')
  @RequirePermissions('BRANCH_UPDATE')
  @ApiOperation({ summary: 'Partially update branch details (PATCH)' })
  async patch(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    const data = await this.organizationService.updateBranch(id, dto, req.user.id);
    return {
      success: true,
      message: 'Branch updated successfully',
      data,
    };
  }

  @Patch(':id/deactivate')
  @RequirePermissions('BRANCH_DELETE')
  @ApiOperation({ summary: 'Soft-deactivate branch (PATCH)' })
  async patchDeactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() _dto?: DeactivateEntityDto,
  ) {
    const data = await this.organizationService.deactivateBranch(id, req.user.id);
    return {
      success: true,
      message: 'Branch deactivated successfully',
      data,
    };
  }

  @Delete(':id')
  @RequirePermissions('BRANCH_DELETE')
  @ApiOperation({ summary: 'Deactivate branch (DELETE)' })
  async deactivate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const data = await this.organizationService.deactivateBranch(id, req.user.id);
    return {
      success: true,
      message: 'Branch deactivated successfully',
      data,
    };
  }
}

// -----------------------------------------------------------------------------
// 3. Departments Controller
// -----------------------------------------------------------------------------

@ApiTags('Departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @RequirePermissions('DEPARTMENT_VIEW')
  @ApiOperation({ summary: 'List all departments with pagination, search, status, and sorting' })
  async findAll(@Req() req: AuthenticatedRequest, @Query() query: DepartmentFilterDto) {
    const result = await this.organizationService.findAllDepartments({
      organizationId: req.user.organizationId,
      ...query,
    });
    return {
      success: true,
      message: 'Departments retrieved successfully',
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @RequirePermissions('DEPARTMENT_VIEW')
  @ApiOperation({ summary: 'Get department details by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.organizationService.findDepartmentById(id);
    return {
      success: true,
      message: 'Department details retrieved successfully',
      data,
    };
  }

  @Post()
  @RequirePermissions('DEPARTMENT_CREATE')
  @ApiOperation({ summary: 'Create new department' })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateDepartmentDto) {
    const data = await this.organizationService.createDepartment(
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: 'Department created successfully',
      data,
    };
  }

  @Put(':id')
  @RequirePermissions('DEPARTMENT_UPDATE')
  @ApiOperation({ summary: 'Update department details (PUT)' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    const data = await this.organizationService.updateDepartment(id, dto, req.user.id);
    return {
      success: true,
      message: 'Department updated successfully',
      data,
    };
  }

  @Patch(':id')
  @RequirePermissions('DEPARTMENT_UPDATE')
  @ApiOperation({ summary: 'Partially update department details (PATCH)' })
  async patch(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    const data = await this.organizationService.updateDepartment(id, dto, req.user.id);
    return {
      success: true,
      message: 'Department updated successfully',
      data,
    };
  }

  @Patch(':id/deactivate')
  @RequirePermissions('DEPARTMENT_DELETE')
  @ApiOperation({ summary: 'Soft-deactivate department (PATCH)' })
  async patchDeactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() _dto?: DeactivateEntityDto,
  ) {
    const data = await this.organizationService.deactivateDepartment(id, req.user.id);
    return {
      success: true,
      message: 'Department deactivated successfully',
      data,
    };
  }

  @Delete(':id')
  @RequirePermissions('DEPARTMENT_DELETE')
  @ApiOperation({ summary: 'Deactivate department (DELETE)' })
  async deactivate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const data = await this.organizationService.deactivateDepartment(id, req.user.id);
    return {
      success: true,
      message: 'Department deactivated successfully',
      data,
    };
  }
}

// -----------------------------------------------------------------------------
// 4. Designations Controller
// -----------------------------------------------------------------------------

@ApiTags('Designations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('designations')
export class DesignationsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @RequirePermissions('DESIGNATION_VIEW')
  @ApiOperation({ summary: 'List all designations with pagination, search, status, and sorting' })
  async findAll(@Req() req: AuthenticatedRequest, @Query() query: DesignationFilterDto) {
    const result = await this.organizationService.findAllDesignations({
      organizationId: req.user.organizationId,
      ...query,
    });
    return {
      success: true,
      message: 'Designations retrieved successfully',
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @RequirePermissions('DESIGNATION_VIEW')
  @ApiOperation({ summary: 'Get designation details by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.organizationService.findDesignationById(id);
    return {
      success: true,
      message: 'Designation details retrieved successfully',
      data,
    };
  }

  @Post()
  @RequirePermissions('DESIGNATION_CREATE')
  @ApiOperation({ summary: 'Create new designation' })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateDesignationDto) {
    const data = await this.organizationService.createDesignation(
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: 'Designation created successfully',
      data,
    };
  }

  @Put(':id')
  @RequirePermissions('DESIGNATION_UPDATE')
  @ApiOperation({ summary: 'Update designation details (PUT)' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDesignationDto,
  ) {
    const data = await this.organizationService.updateDesignation(id, dto, req.user.id);
    return {
      success: true,
      message: 'Designation updated successfully',
      data,
    };
  }

  @Patch(':id')
  @RequirePermissions('DESIGNATION_UPDATE')
  @ApiOperation({ summary: 'Partially update designation details (PATCH)' })
  async patch(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDesignationDto,
  ) {
    const data = await this.organizationService.updateDesignation(id, dto, req.user.id);
    return {
      success: true,
      message: 'Designation updated successfully',
      data,
    };
  }

  @Patch(':id/deactivate')
  @RequirePermissions('DESIGNATION_DELETE')
  @ApiOperation({ summary: 'Soft-deactivate designation (PATCH)' })
  async patchDeactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() _dto?: DeactivateEntityDto,
  ) {
    const data = await this.organizationService.deactivateDesignation(id, req.user.id);
    return {
      success: true,
      message: 'Designation deactivated successfully',
      data,
    };
  }

  @Delete(':id')
  @RequirePermissions('DESIGNATION_DELETE')
  @ApiOperation({ summary: 'Deactivate designation (DELETE)' })
  async deactivate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const data = await this.organizationService.deactivateDesignation(id, req.user.id);
    return {
      success: true,
      message: 'Designation deactivated successfully',
      data,
    };
  }
}
