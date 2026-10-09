import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { WfhStatus } from '@prisma/client';

export class QueryWfhRequestsDto {
  @ApiPropertyOptional({
    description:
      'Data scope: "my" (self), "team" (direct/indirect reports), or "organization" (all)',
    enum: ['my', 'team', 'organization'],
    default: 'my',
  })
  @IsOptional()
  @IsIn(['my', 'team', 'organization'], {
    message: 'scope must be one of: my, team, organization',
  })
  scope?: 'my' | 'team' | 'organization';

  @ApiPropertyOptional({
    description: 'Filter by WFH request lifecycle status',
    enum: WfhStatus,
  })
  @IsOptional()
  @IsEnum(WfhStatus)
  status?: WfhStatus;

  @ApiPropertyOptional({
    description: 'Filter WFH requests overlapping starting date (ISO 8601 string)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter WFH requests overlapping ending date (ISO 8601 string)',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by specific employee UUID (subject to role/scope authorization)',
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive text search across reason text',
  })
  @IsOptional()
  @IsString()
  search?: string;

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
    description: 'Page size (items per page, max 100)',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
