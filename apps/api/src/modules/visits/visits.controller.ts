import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { VisitsService } from './visits.service';
import { CreateOfficialVisitDto } from './dto/create-official-visit.dto';
import { UpdateOfficialVisitDto } from './dto/update-official-visit.dto';
import { CancelOfficialVisitDto } from './dto/cancel-official-visit.dto';
import { QueryOfficialVisitsDto } from './dto/query-official-visits.dto';

@ApiTags('Official Visits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post()
  @RequirePermissions('VISIT_APPLY')
  @ApiOperation({ summary: 'Create an official visit / outdoor duty request' })
  @ApiResponse({ status: 201, description: 'Official visit created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failure or invalid dates' })
  @ApiResponse({ status: 409, description: 'Conflicting overlapping active visit' })
  async createVisit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOfficialVisitDto) {
    return this.visitsService.createVisit(user, dto);
  }

  @Get('my')
  @RequirePermissions('VISIT_VIEW')
  @ApiOperation({ summary: 'List visits submitted by current employee' })
  async getMyVisits(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryOfficialVisitsDto,
  ) {
    return this.visitsService.getVisits(user, { ...query, scope: 'my' });
  }

  @Get()
  @RequirePermissions('VISIT_VIEW')
  @ApiOperation({
    summary: 'List official visits with scope (my, team, organization), pagination and filters',
  })
  async getVisits(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryOfficialVisitsDto) {
    return this.visitsService.getVisits(user, query);
  }

  @Get(':id')
  @RequirePermissions('VISIT_VIEW')
  @ApiOperation({
    summary: 'Get detailed official visit view with destinations and approvals',
  })
  @ApiResponse({ status: 200, description: 'Official visit details' })
  @ApiResponse({ status: 403, description: 'Access outside user scope' })
  @ApiResponse({ status: 404, description: 'Visit not found' })
  async getVisitById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.visitsService.getVisitById(user, id);
  }

  @Patch(':id')
  @RequirePermissions('VISIT_APPLY')
  @ApiOperation({
    summary:
      'Update official visit. Material changes to an APPROVED visit reset it to SUBMITTED for re-approval.',
  })
  @ApiResponse({ status: 200, description: 'Visit updated or returned for re-approval' })
  @ApiResponse({ status: 400, description: 'Invalid transition or invalid fields' })
  @ApiResponse({ status: 409, description: 'Updated dates conflict with existing active visit' })
  async updateVisit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOfficialVisitDto,
  ) {
    return this.visitsService.updateVisit(user, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('VISIT_APPLY')
  @ApiOperation({ summary: 'Cancel an upcoming official visit with documented reason' })
  @ApiResponse({ status: 200, description: 'Visit cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Visit already cancelled or terminal' })
  @ApiResponse({ status: 403, description: 'Unauthorized or visit has already commenced' })
  async cancelVisit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelOfficialVisitDto,
  ) {
    return this.visitsService.cancelVisit(user, id, dto);
  }
}
