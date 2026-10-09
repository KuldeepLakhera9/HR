import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, Min, Max, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceExceptionType, AttendanceExceptionStatus } from '@hrms/types';

export class AttendanceExceptionQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by resolution status',
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

  @ApiPropertyOptional({ description: 'Filter by employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Start date in YYYY-MM-DD format', example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date in YYYY-MM-DD format', example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Pagination page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page limit size', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
