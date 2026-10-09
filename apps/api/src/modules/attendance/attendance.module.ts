import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  OfficeLocationsController,
  OfficeLocationsAliasController,
} from './office-locations.controller';
import { OfficeLocationsService } from './office-locations.service';

@Injectable()
export class AttendanceService {
  async getTodaySummary() {
    return {
      date: new Date().toISOString().split('T')[0],
      totalEmployees: 72,
      present: 64,
      onLeave: 5,
      absent: 3,
      modes: {
        office: 52,
        officialVisit: 4,
        workFromHome: 8,
      },
    };
  }

  async getAttendancePolicy() {
    return {
      modesSupported: ['OFFICE', 'OFFICIAL_VISIT', 'WORK_FROM_HOME'],
      standardWorkHours: 8.5,
      gracePeriodMinutes: 15,
      geofenceValidationEnabled: true,
    };
  }
}

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

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
  @ApiOperation({ summary: 'Get organization attendance mode policy (Office/Official Visit/WFH)' })
  async getAttendancePolicy() {
    const data = await this.attendanceService.getAttendancePolicy();
    return {
      message: 'Attendance policy retrieved',
      data,
    };
  }
}

@Module({
  controllers: [AttendanceController, OfficeLocationsController, OfficeLocationsAliasController],
  providers: [AttendanceService, OfficeLocationsService],
  exports: [AttendanceService, OfficeLocationsService],
})
export class AttendanceModule {}
