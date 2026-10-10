import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ManagerService } from './manager.service';
import { ManagerDashboardQueryDto } from './dto/manager-dashboard-query.dto';

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
}
