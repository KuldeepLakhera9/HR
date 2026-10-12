import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class RequestAnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Reporting window start date (YYYY-MM-DD)',
    example: '2026-10-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Reporting window end date (YYYY-MM-DD)',
    example: '2026-10-31',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by request category',
    enum: ['ALL', 'LEAVE', 'WFH', 'OFFICIAL_VISIT'],
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(['ALL', 'LEAVE', 'WFH', 'OFFICIAL_VISIT'])
  requestType?: 'ALL' | 'LEAVE' | 'WFH' | 'OFFICIAL_VISIT' = 'ALL';

  @ApiPropertyOptional({
    description: 'Filter by workflow status',
    enum: ['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'],
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: 'ALL' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' = 'ALL';

  @ApiPropertyOptional({ description: 'Filter by specific leave type UUID' })
  @IsOptional()
  @IsString()
  leaveTypeId?: string;

  @ApiPropertyOptional({ description: 'Filter by department UUID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch office UUID' })
  @IsOptional()
  @IsString()
  branchId?: string;

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
