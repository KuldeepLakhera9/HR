import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class DailyAttendanceReportQueryDto {
  @ApiPropertyOptional({
    description: 'Report window start date (YYYY-MM-DD)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Report window end date (YYYY-MM-DD)',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by branch office UUID',
    example: 'b5e19746-1234-5678-90ab-cdef12345678',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Filter by department UUID',
    example: 'd1a2b3c4-1234-5678-90ab-cdef12345678',
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by specific employee UUID',
    example: 'e5f6a7b8-1234-5678-90ab-cdef12345678',
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Filter by shift configuration UUID',
    example: 's1s2s3s4-1234-5678-90ab-cdef12345678',
  })
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by attendance day status (PRESENT, LATE, HALF_DAY, ABSENT, ON_LEAVE, WEEK_OFF, HOLIDAY, INCOMPLETE, ALL)',
    example: 'PRESENT',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Page index for paginated records list (default 1)',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page limit size for records (default 25, max 100)',
    default: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
