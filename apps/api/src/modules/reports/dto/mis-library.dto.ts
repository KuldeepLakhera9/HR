import { IsString, IsNotEmpty, IsOptional, IsObject, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSavedReportDefinitionDto {
  @ApiProperty({ description: 'Report Catalog Key (e.g. REP-WF-01, REP-ATT-01, etc.)' })
  @IsString()
  @IsNotEmpty()
  reportKey: string;

  @ApiProperty({ description: 'User-specified title for the saved report definition' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Optional description of the report purpose or criteria' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Safe, parameterized filter key-value pairs (no arbitrary SQL)' })
  @IsObject()
  @IsNotEmpty()
  filterConfig: Record<string, any>;
}

export class QuerySavedReportsDto {
  @ApiPropertyOptional({ description: 'Filter by specific report key' })
  @IsOptional()
  @IsString()
  reportKey?: string;

  @ApiPropertyOptional({ description: 'Search term by report name or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page limit', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class QueryReportCatalogDto {
  @ApiPropertyOptional({
    description: 'Category filter (WORKFORCE, ATTENDANCE, LEAVE_REQUESTS, PERFORMANCE)',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Search query across report titles and descriptions' })
  @IsOptional()
  @IsString()
  search?: string;
}
