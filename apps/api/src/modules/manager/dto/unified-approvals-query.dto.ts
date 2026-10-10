import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum ApprovalRequestTypeFilter {
  ALL = 'ALL',
  LEAVE = 'LEAVE',
  WFH = 'WFH',
  VISIT = 'VISIT',
}

export enum ApprovalStatusFilter {
  ALL = 'ALL',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum ApprovalSortBy {
  SUBMITTED_AT = 'submittedAt',
  START_DATE = 'startDate',
  EMPLOYEE_NAME = 'employeeName',
  TYPE = 'type',
}

export class QueryUnifiedApprovalsDto {
  @ApiPropertyOptional({
    description: 'Filter by request type',
    enum: ApprovalRequestTypeFilter,
    default: ApprovalRequestTypeFilter.ALL,
  })
  @IsOptional()
  @IsEnum(ApprovalRequestTypeFilter)
  type?: ApprovalRequestTypeFilter = ApprovalRequestTypeFilter.ALL;

  @ApiPropertyOptional({
    description: 'Filter by lifecycle status',
    enum: ApprovalStatusFilter,
    default: ApprovalStatusFilter.SUBMITTED,
  })
  @IsOptional()
  @IsEnum(ApprovalStatusFilter)
  status?: ApprovalStatusFilter = ApprovalStatusFilter.SUBMITTED;

  @ApiPropertyOptional({
    description: 'Filter by specific employee ID in team',
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Filter requests active on or after this date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter requests active on or before this date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter requests submitted on or after this timestamp/date',
  })
  @IsOptional()
  @IsString()
  submittedStartDate?: string;

  @ApiPropertyOptional({
    description: 'Filter requests submitted on or before this timestamp/date',
  })
  @IsOptional()
  @IsString()
  submittedEndDate?: string;

  @ApiPropertyOptional({
    description: 'Search string across applicant name, employee code, or purpose/reason',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort property field',
    enum: ApprovalSortBy,
    default: ApprovalSortBy.SUBMITTED_AT,
  })
  @IsOptional()
  @IsEnum(ApprovalSortBy)
  sortBy?: ApprovalSortBy = ApprovalSortBy.SUBMITTED_AT;

  @ApiPropertyOptional({
    description: 'Sort direction order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description: 'Page index (1-based)',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter escalated requests (e.g. employee has no manager assigned)',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  escalatedOnly?: boolean;
}
