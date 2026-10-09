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
import { WfhService } from './wfh.service';
import { CreateWfhRequestDto } from './dto/create-wfh-request.dto';
import { UpdateWfhRequestDto } from './dto/update-wfh-request.dto';
import { CancelWfhRequestDto } from './dto/cancel-wfh-request.dto';
import { QueryWfhRequestsDto } from './dto/query-wfh-requests.dto';
import { DecideWfhRequestDto } from './dto/decide-wfh-request.dto';

@ApiTags('Work From Home (WFH)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('wfh')
export class WfhController {
  constructor(private readonly wfhService: WfhService) {}

  @Post()
  @RequirePermissions('WFH_APPLY')
  @ApiOperation({ summary: 'Submit a new work from home (WFH) request' })
  @ApiResponse({ status: 201, description: 'WFH request submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date range or duration type alignment' })
  @ApiResponse({
    status: 409,
    description: 'Conflicting active WFH, official visit, or leave request',
  })
  async createWfhRequest(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWfhRequestDto) {
    return this.wfhService.createWfhRequest(user, dto);
  }

  @Get('my')
  @RequirePermissions('WFH_VIEW')
  @ApiOperation({ summary: 'List WFH requests submitted by current authenticated employee' })
  @ApiResponse({ status: 200, description: 'Paginated list of current user WFH requests' })
  async getMyWfhRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryWfhRequestsDto,
  ) {
    return this.wfhService.getWfhRequests(user, { ...query, scope: 'my' });
  }

  @Get('manager/pending')
  @RequirePermissions('WFH_APPROVE')
  @ApiOperation({ summary: 'List pending WFH requests submitted by reporting team members' })
  @ApiResponse({ status: 200, description: 'Pending team WFH requests' })
  async getManagerPendingWfh(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryWfhRequestsDto,
  ) {
    return this.wfhService.getManagerPendingWfh(user, query);
  }

  @Get()
  @RequirePermissions('WFH_VIEW')
  @ApiOperation({
    summary: 'List WFH requests with scope (my, team, organization), status, and search filters',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of WFH requests' })
  async getWfhRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryWfhRequestsDto,
  ) {
    return this.wfhService.getWfhRequests(user, query);
  }

  @Get(':id')
  @RequirePermissions('WFH_VIEW')
  @ApiOperation({ summary: 'Get detailed WFH request with approval history' })
  @ApiResponse({ status: 200, description: 'Detailed WFH request' })
  @ApiResponse({ status: 403, description: 'Unauthorized scope access' })
  @ApiResponse({ status: 404, description: 'WFH request not found' })
  async getWfhRequestById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.wfhService.getWfhRequestById(user, id);
  }

  @Patch(':id')
  @RequirePermissions('WFH_APPLY')
  @ApiOperation({
    summary:
      'Update WFH request. Material changes (dates, duration) to APPROVED requests trigger automatic re-approval.',
  })
  @ApiResponse({
    status: 200,
    description: 'WFH request updated or reset to SUBMITTED for re-approval',
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition or invalid dates' })
  @ApiResponse({ status: 409, description: 'Updated dates conflict with existing active request' })
  async updateWfhRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWfhRequestDto,
  ) {
    return this.wfhService.updateWfhRequest(user, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('WFH_APPLY')
  @ApiOperation({ summary: 'Cancel an upcoming WFH request with documented reason' })
  @ApiResponse({ status: 200, description: 'WFH request cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Request already cancelled or terminal' })
  @ApiResponse({ status: 403, description: 'Commenced request requires manager/HR authorization' })
  async cancelWfhRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelWfhRequestDto,
  ) {
    return this.wfhService.cancelWfhRequest(user, id, dto);
  }

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('WFH_APPROVE')
  @ApiOperation({ summary: 'Approve or reject a reporting subordinate WFH request' })
  @ApiResponse({ status: 200, description: 'WFH request approved or rejected' })
  @ApiResponse({ status: 403, description: 'Self-approval disallowed or outside hierarchy chain' })
  @ApiResponse({ status: 409, description: 'Concurrent review conflict' })
  async decideWfhRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideWfhRequestDto,
  ) {
    return this.wfhService.decideWfhRequest(user, id, dto);
  }
}
