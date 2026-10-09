import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WfhDurationType } from '@prisma/client';

export class CreateWfhRequestDto {
  @ApiProperty({
    description: 'Start date of remote work window (YYYY-MM-DD or ISO 8601 string)',
    example: '2026-10-15',
  })
  @IsNotEmpty({ message: 'startDate is required' })
  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
  startDate: string;

  @ApiProperty({
    description: 'End date of remote work window (YYYY-MM-DD or ISO 8601 string)',
    example: '2026-10-15',
  })
  @IsNotEmpty({ message: 'endDate is required' })
  @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
  endDate: string;

  @ApiPropertyOptional({
    description: 'Duration shift type for WFH: FULL_DAY, FIRST_HALF, SECOND_HALF, or CUSTOM_RANGE',
    enum: WfhDurationType,
    default: WfhDurationType.FULL_DAY,
    example: WfhDurationType.FULL_DAY,
  })
  @IsOptional()
  @IsEnum(WfhDurationType, {
    message: 'durationType must be one of: FULL_DAY, FIRST_HALF, SECOND_HALF, CUSTOM_RANGE',
  })
  durationType?: WfhDurationType;

  @ApiProperty({
    description: 'Professional reason and deliverables justification for working from home',
    example: 'Deep work focus on quarterly compliance report compilation and architecture audit',
    minLength: 5,
    maxLength: 1000,
  })
  @IsNotEmpty({ message: 'reason is required' })
  @IsString({ message: 'reason must be a string' })
  @MinLength(5, { message: 'reason must be at least 5 characters long' })
  @MaxLength(1000, { message: 'reason cannot exceed 1000 characters' })
  reason: string;
}
