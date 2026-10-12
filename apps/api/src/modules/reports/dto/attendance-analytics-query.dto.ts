import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { AttendanceExceptionType, AttendanceExceptionStatus } from '@hrms/types';

export class WeeklyAttendanceReportQueryDto {
  @ApiPropertyOptional({
    description:
      'Week starting date (YYYY-MM-DD). If omitted, defaults to current week start (Monday).',
    example: '2026-10-05',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Week ending date (YYYY-MM-DD). If omitted, defaults to 6 days after startDate.',
    example: '2026-10-11',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by branch office UUID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by department UUID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by shift configuration UUID' })
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional({ description: 'Filter by employee UUID' })
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class AttendanceExceptionsReportQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by exception resolution status',
    enum: ['OPEN', 'RESOLVED', 'DISMISSED', 'ALL'],
    default: 'OPEN',
  })
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED', 'DISMISSED', 'ALL'])
  status?: AttendanceExceptionStatus | 'ALL' = 'OPEN';

  @ApiPropertyOptional({
    description: 'Filter by exception category',
    enum: [
      'OUTSIDE_GEOFENCE',
      'LOW_GPS_ACCURACY',
      'MISSING_CHECKOUT',
      'OVERLAPPING_SESSION',
      'SUSPICIOUS_TIMING',
      'POLICY_VIOLATION',
      'LATE_ARRIVAL',
      'EARLY_DEPARTURE',
      'INVALID_STATE',
      'PENDING_CORRECTION',
      'SUSPICIOUS_REPEATED_ATTEMPTS',
    ],
  })
  @IsOptional()
  @IsString()
  exceptionType?: AttendanceExceptionType;

  @ApiPropertyOptional({
    description: 'Filter by exception severity',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
  })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({ description: 'Start date in YYYY-MM-DD format', example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date in YYYY-MM-DD format', example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by branch office UUID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by department UUID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by shift configuration UUID' })
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional({ description: 'Filter by employee UUID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Pagination page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page limit size', default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
