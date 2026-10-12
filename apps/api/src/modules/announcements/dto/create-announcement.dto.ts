import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
  MinLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AnnouncementPriority,
  AnnouncementCategory,
  AnnouncementAudience,
  AnnouncementStatus,
} from '@hrms/types';

export class CreateAnnouncementDto {
  @ApiProperty({ description: 'Title of the announcement' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Full body content or markdown announcement text' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional({
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
    default: 'NORMAL',
  })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: AnnouncementPriority = 'NORMAL';

  @ApiPropertyOptional({
    enum: ['GENERAL', 'POLICY', 'EVENT', 'MAINTENANCE', 'BENEFITS'],
    default: 'GENERAL',
  })
  @IsOptional()
  @IsIn(['GENERAL', 'POLICY', 'EVENT', 'MAINTENANCE', 'BENEFITS'])
  category?: AnnouncementCategory = 'GENERAL';

  @ApiProperty({
    enum: ['ALL', 'DEPARTMENT', 'ROLE'],
    default: 'ALL',
    description: 'Audience scope for targeting announcements without leaking cross-team content',
  })
  @IsIn(['ALL', 'DEPARTMENT', 'ROLE'])
  targetAudience: AnnouncementAudience;

  @ApiPropertyOptional({
    description:
      'Target identifier: department name/ID or role type (required if targetAudience != ALL)',
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
    default: 'PUBLISHED',
  })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: AnnouncementStatus = 'PUBLISHED';
}
