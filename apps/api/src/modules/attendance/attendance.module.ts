import { Body, Controller, Get, Headers, Ip, Module, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import {
  OfficeLocationsController,
  OfficeLocationsAliasController,
} from './office-locations.controller';
import { OfficeLocationsService } from './office-locations.service';
import {
  AttendancePoliciesController,
  AttendanceShiftsController,
} from './attendance-policies.controller';
import { AttendancePoliciesService } from './attendance-policies.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  @RequirePermissions('ATTENDANCE_MARK')
  @ApiOperation({
    summary:
      'Office check-in with GPS geofence verification, shift calculation & atomic session creation',
  })
  async checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckInDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.attendanceService.checkIn(user, dto, ipAddress, userAgent);
  }

  @Get('today')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get current user attendance status, active session, and policy rules for today',
  })
  async getToday(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getToday(user);
  }

  @Get('summary')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({ summary: 'Get current daily attendance summary across organization' })
  async getTodaySummary() {
    const data = await this.attendanceService.getTodaySummary();
    return {
      message: 'Attendance summary retrieved',
      data,
    };
  }

  @Get('policy')
  @RequirePermissions('ATTENDANCE_VIEW')
  @ApiOperation({
    summary: 'Get organization attendance mode policy (Office/Official Visit/WFH)',
  })
  async getAttendancePolicy() {
    const data = await this.attendanceService.getAttendancePolicy();
    return {
      message: 'Attendance policy retrieved',
      data,
    };
  }
}

@Module({
  controllers: [
    AttendanceController,
    OfficeLocationsController,
    OfficeLocationsAliasController,
    AttendancePoliciesController,
    AttendanceShiftsController,
  ],
  providers: [AttendanceService, OfficeLocationsService, AttendancePoliciesService],
  exports: [AttendanceService, OfficeLocationsService, AttendancePoliciesService],
})
export class AttendanceModule {}
