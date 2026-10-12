import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class WorkforceHeadcountQueryDto {
  @ApiPropertyOptional({
    description: 'Target date for point-in-time headcount snapshot (YYYY-MM-DD or ISO)',
    example: '2026-10-12',
  })
  @IsOptional()
  @IsString()
  asOfDate?: string;

  @ApiPropertyOptional({ description: 'Filter by department ID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by designation ID' })
  @IsOptional()
  @IsString()
  designationId?: string;

  @ApiPropertyOptional({ description: 'Filter by employment type (FULL_TIME, CONTRACT, etc.)' })
  @IsOptional()
  @IsString()
  employmentType?: string;
}

export class WorkforceMovementQueryDto {
  @ApiPropertyOptional({
    description: 'Start date of movement window (YYYY-MM-DD or ISO)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date of movement window (YYYY-MM-DD or ISO)',
    example: '2026-10-12',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by department ID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Page number for movement rosters', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size for movement rosters', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class WorkforceTrendsQueryDto {
  @ApiPropertyOptional({
    description: 'Number of historical months to project in trend analysis',
    default: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number = 6;

  @ApiPropertyOptional({ description: 'Filter by department ID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsOptional()
  @IsString()
  branchId?: string;
}
