import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class TeamDirectoryQueryDto {
  @ApiPropertyOptional({
    description: 'Search query for name, employee code, designation, or work email',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by Department ID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by Branch ID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by Work Mode', enum: ['OFFICE', 'REMOTE', 'HYBRID'] })
  @IsOptional()
  @IsIn(['OFFICE', 'REMOTE', 'HYBRID'])
  workMode?: string;

  @ApiPropertyOptional({
    description: 'Filter by live availability status',
    enum: ['ALL', 'PRESENT', 'ON_LEAVE', 'ON_WFH', 'ON_VISIT', 'NOT_CHECKED_IN'],
  })
  @IsOptional()
  @IsIn(['ALL', 'PRESENT', 'ON_LEAVE', 'ON_WFH', 'ON_VISIT', 'NOT_CHECKED_IN'])
  availabilityStatus?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['displayName', 'employeeCode', 'joiningDate', 'department'],
    default: 'displayName',
  })
  @IsOptional()
  @IsIn(['displayName', 'employeeCode', 'joiningDate', 'department'])
  sortBy?: string = 'displayName';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size limit', default: 10, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
