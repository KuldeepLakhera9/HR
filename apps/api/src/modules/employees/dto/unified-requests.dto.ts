import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryUnifiedRequestsDto {
  @ApiPropertyOptional({
    description: 'Filter by request type',
    enum: [
      'ALL',
      'LEAVE',
      'WFH',
      'OFFICIAL_VISIT',
      'ATTENDANCE_CORRECTION',
      'PROFILE_CHANGE',
      'DOCUMENT',
    ],
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  type?: string = 'ALL';

  @ApiPropertyOptional({
    description: 'Filter by request status',
    enum: ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  status?: string = 'ALL';

  @ApiPropertyOptional({
    description: 'Filter requests submitted on or after this date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter requests submitted on or before this date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Search keywords in title, reason or notes' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
