import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateHolidayDto {
  @ApiProperty({
    description: 'Name of the public holiday or gazetted observance',
    example: 'Republic Day',
  })
  @IsNotEmpty({ message: 'Holiday name is required' })
  @IsString({ message: 'Holiday name must be a string' })
  @MinLength(2, { message: 'Holiday name must be at least 2 characters long' })
  @MaxLength(100, { message: 'Holiday name must not exceed 100 characters' })
  name: string;

  @ApiProperty({
    description: 'Holiday date in ISO 8601 or YYYY-MM-DD format (normalized to UTC midnight)',
    example: '2026-01-26',
  })
  @IsNotEmpty({ message: 'Holiday date is required' })
  @IsDateString({}, { message: 'Holiday date must be a valid ISO 8601 date string' })
  date: string;

  @ApiPropertyOptional({
    description:
      'Optional branch ID for branch-specific regional holidays. Null implies organization-wide.',
    example: 'fa4d3a6f-1f0a-4663-af0c-76ad22a77674',
  })
  @IsOptional()
  @IsUUID('4', { message: 'branchId must be a valid UUID' })
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Whether this is an optional/restricted holiday',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @ApiPropertyOptional({
    description: 'Description or notes regarding the holiday',
    example: 'National holiday across all Indian offices',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateHolidayDto {
  @ApiPropertyOptional({ example: 'Republic Day' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '2026-01-26' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
