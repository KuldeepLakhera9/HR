import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class RemoteFieldOverviewQueryDto {
  @ApiPropertyOptional({
    description: 'Target working date in YYYY-MM-DD format (defaults to current working date)',
    example: '2026-10-09',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Start date for historical aggregations and trends (YYYY-MM-DD)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for historical aggregations and trends (YYYY-MM-DD)',
    example: '2026-10-09',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by organization branch ID',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Filter by organization department ID',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by manager ID (aggregates team subtree for HR/Admin)',
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status (e.g. SUBMITTED, APPROVED, COMPLETED, ALL)',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Search string matching employee name, code, or purpose',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Page number for list pagination',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page limit (max: 100)',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
