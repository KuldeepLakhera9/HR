import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ManagerService } from './manager.service';
import { ManagerDashboardQueryDto } from './dto/manager-dashboard-query.dto';
import { TeamDirectoryQueryDto } from './dto/team-directory-query.dto';

@ApiTags('Manager Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('manager')
export class ManagerController {
  constructor(private readonly managerService: ManagerService) {}

  @Get('dashboard/overview')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary:
      'Get authorized manager dashboard metrics, today presence roster, pending approvals breakdown, exceptions, and upcoming absences',
  })
  @ApiResponse({
    status: 200,
    description: 'Manager dashboard aggregated overview',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if caller lacks manager role or reporting scope',
  })
  async getDashboardOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ManagerDashboardQueryDto,
  ) {
    return this.managerService.getDashboardOverview(user, query);
  }

  @Get('team/directory')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @RequirePermissions('EMPLOYEE_VIEW')
  @ApiOperation({
    summary:
      'Get paginated and searchable team directory within the authorized reporting hierarchy with real-time availability',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated team directory with attendance availability',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if caller lacks manager role or reporting scope',
  })
  async getTeamDirectory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TeamDirectoryQueryDto,
  ) {
    return this.managerService.getTeamDirectory(user, query);
  }

  @Get('team/members/:id')
  @Roles('ADMIN', 'HR', 'MANAGER')
  @RequirePermissions('EMPLOYEE_VIEW')
  @ApiOperation({
    summary: 'Get authorized detail view of a team member within manager reporting hierarchy scope',
  })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({
    status: 200,
    description: 'Authorized employee details, balances, and recent attendance',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if target employee is outside manager reporting hierarchy',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found if employee does not exist',
  })
  async getTeamMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.managerService.getTeamMember(user, id);
  }
}
