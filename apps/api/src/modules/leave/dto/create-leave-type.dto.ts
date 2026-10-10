import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateLeaveTypeDto {
  @ApiProperty({
    description: 'Unique organizational code for the leave type (e.g. CL, SL, PL, ML)',
    example: 'CL',
  })
  @IsNotEmpty({ message: 'code is required' })
  @IsString({ message: 'code must be a string' })
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must contain uppercase alphanumeric characters, dashes, or underscores',
  })
  code: string;

  @ApiProperty({
    description: 'Human-readable name of the leave type',
    example: 'Casual Leave',
  })
  @IsNotEmpty({ message: 'name is required' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Description and policy summary',
    example: 'For personal and urgent short-term errands',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Hex color code for calendar visualization',
    example: '#d97706',
    default: '#d97706',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
    message: 'color must be a valid hex color code',
  })
  color?: string;

  @ApiPropertyOptional({
    description: 'Whether leave under this type is paid or unpaid',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional({
    description: 'Whether half-day requests (FIRST_HALF / SECOND_HALF) are permitted',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowHalfDay?: boolean;

  @ApiPropertyOptional({
    description: 'Whether supporting documentation/certificates are required',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  requiresDoc?: boolean;

  @ApiPropertyOptional({
    description: 'Number of consecutive days above which documents are mandatory',
    default: 2,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  docThresholdDays?: number;

  @ApiPropertyOptional({
    description: 'Whether the leave type is currently active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLeaveTypeDto {
  @ApiPropertyOptional({ example: 'Casual Leave' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowHalfDay?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresDoc?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  docThresholdDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
