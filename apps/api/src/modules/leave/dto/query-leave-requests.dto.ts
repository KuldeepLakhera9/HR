import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeaveRequestStatus } from '@prisma/client';

export class QueryLeaveRequestsDto {
  @ApiPropertyOptional({
    description: 'Filter by leave status: SUBMITTED, APPROVED, REJECTED, CANCELLED, or ALL',
    enum: LeaveRequestStatus,
  })
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @ApiPropertyOptional({
    description: 'Filter by specific leave type ID',
  })
  @IsOptional()
  @IsUUID('4')
  leaveTypeId?: string;

  @ApiPropertyOptional({
    description: 'Filter by employee ID (restricted by role)',
  })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Filter leaves overlapping from start date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter leaves overlapping up to end date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by leave year (e.g. 2026)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leaveYear?: number;

  @ApiPropertyOptional({
    description: 'Search string for employee name, code, or reason',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
