import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

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
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get current daily attendance summary across organization' })
  async getTodaySummary() {
    const data = await this.attendanceService.getTodaySummary();
    return {
      message: 'Attendance summary retrieved',
      data,
    };
  }

  @Get('policy')
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
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
