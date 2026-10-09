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
import { Roles } from '../../common/decorators/roles.decorator';
import { OfficeLocationsService } from './office-locations.service';
import {
  CreateOfficeLocationDto,
  UpdateOfficeLocationDto,
  OfficeLocationFilterDto,
  ValidateLocationDto,
} from './dto/office-location.dto';
import { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

@ApiTags('Office Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('attendance/locations')
export class OfficeLocationsController {
  constructor(private readonly officeLocationsService: OfficeLocationsService) {}

  @Get()
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'List office locations with search, filters, and pagination' })
  async findAll(@Req() req: AuthenticatedRequest, @Query() query: OfficeLocationFilterDto) {
    const result = await this.officeLocationsService.findAll({
      organizationId: req.user.organizationId,
      branchId: query.branchId,
      search: query.search,
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });

    return {
      success: true,
      message: 'Office locations retrieved successfully.',
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'Get office location by ID' })
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const data = await this.officeLocationsService.findById(id, req.user.organizationId);
    return {
      success: true,
      message: 'Office location retrieved successfully.',
      data,
    };
  }

  @Post()
  @Roles('ADMIN', 'HR')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Create new office location with geofence perimeter' })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateOfficeLocationDto) {
    const data = await this.officeLocationsService.create(
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: 'Office location created successfully.',
      data,
    };
  }

  @Put(':id')
  @Roles('ADMIN', 'HR')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Update office location details and geofence coordinates' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOfficeLocationDto,
  ) {
    const data = await this.officeLocationsService.update(
      id,
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: 'Office location updated successfully.',
      data,
    };
  }

  @Delete(':id')
  @Roles('ADMIN', 'HR')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Delete or deactivate office location' })
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const result = await this.officeLocationsService.delete(
      id,
      req.user.organizationId,
      req.user.id,
    );
    return result;
  }

  @Post('validate')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'Test/validate coordinates against designated office geofence' })
  async validateLocation(@Req() req: AuthenticatedRequest, @Body() dto: ValidateLocationDto) {
    const data = await this.officeLocationsService.validateLocation(
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: data.message,
      data,
    };
  }
}

/**
 * Top-level alias controller for direct `/api/v1/office-locations` routing
 */
@ApiTags('Office Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('office-locations')
export class OfficeLocationsAliasController {
  constructor(private readonly officeLocationsService: OfficeLocationsService) {}

  @Get()
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'List office locations (alias)' })
  async findAll(@Req() req: AuthenticatedRequest, @Query() query: OfficeLocationFilterDto) {
    const result = await this.officeLocationsService.findAll({
      organizationId: req.user.organizationId,
      branchId: query.branchId,
      search: query.search,
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });
    return {
      success: true,
      message: 'Office locations retrieved successfully.',
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'Get office location by ID (alias)' })
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const data = await this.officeLocationsService.findById(id, req.user.organizationId);
    return {
      success: true,
      message: 'Office location retrieved successfully.',
      data,
    };
  }

  @Post()
  @Roles('ADMIN', 'HR')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Create new office location (alias)' })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateOfficeLocationDto) {
    const data = await this.officeLocationsService.create(
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: 'Office location created successfully.',
      data,
    };
  }

  @Put(':id')
  @Roles('ADMIN', 'HR')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Update office location (alias)' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOfficeLocationDto,
  ) {
    const data = await this.officeLocationsService.update(
      id,
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: 'Office location updated successfully.',
      data,
    };
  }

  @Delete(':id')
  @Roles('ADMIN', 'HR')
  @RequirePermissions('ATTENDANCE_UPDATE')
  @ApiOperation({ summary: 'Delete or deactivate office location (alias)' })
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.officeLocationsService.delete(id, req.user.organizationId, req.user.id);
  }

  @Post('validate')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'Test/validate coordinates against office geofence (alias)' })
  async validateLocation(@Req() req: AuthenticatedRequest, @Body() dto: ValidateLocationDto) {
    const data = await this.officeLocationsService.validateLocation(
      dto,
      req.user.organizationId,
      req.user.id,
    );
    return {
      success: true,
      message: data.message,
      data,
    };
  }
}
