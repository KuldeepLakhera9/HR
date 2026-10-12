import { IsString, IsOptional, IsIn, MaxLength, MinLength, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AnnouncementPriority,
  AnnouncementCategory,
  AnnouncementAudience,
  AnnouncementStatus,
} from '@hrms/types';

export class UpdateAnnouncementDto {
  @ApiPropertyOptional({ description: 'Title of the announcement' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Full body content or markdown announcement text' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  content?: string;

  @ApiPropertyOptional({
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: AnnouncementPriority;

  @ApiPropertyOptional({
    enum: ['GENERAL', 'POLICY', 'EVENT', 'MAINTENANCE', 'BENEFITS'],
  })
  @IsOptional()
  @IsIn(['GENERAL', 'POLICY', 'EVENT', 'MAINTENANCE', 'BENEFITS'])
  category?: AnnouncementCategory;

  @ApiPropertyOptional({
    enum: ['ALL', 'DEPARTMENT', 'ROLE'],
  })
  @IsOptional()
  @IsIn(['ALL', 'DEPARTMENT', 'ROLE'])
  targetAudience?: AnnouncementAudience;

  @ApiPropertyOptional({
    description: 'Target identifier: department name/ID or role type',
  })
  @IsOptional()
  @IsString()
  targetValue?: string;

  @ApiPropertyOptional({ description: 'Scheduled publication date (ISO)' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional({ description: 'Expiry date after which announcement is hidden (ISO)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: AnnouncementStatus;
}
