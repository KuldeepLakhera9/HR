import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class MonthlyAttendanceReportQueryDto {
  @ApiPropertyOptional({
    description: 'Calendar year for monthly aggregation (e.g. 2026)',
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    description: 'Calendar month number (1 to 12, 1=Jan, 12=Dec)',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

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
    description: 'Filter by attendance day status pattern',
    example: 'ALL',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Page index for paginated employee monthly summaries (default 1)',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page limit size for employee summaries (default 25, max 100)',
    default: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
