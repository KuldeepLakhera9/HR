import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { WfhDurationType, WfhStatus } from '@prisma/client';

export class UpdateWfhRequestDto {
  @ApiPropertyOptional({
    description: 'Updated start date of remote work window',
    example: '2026-10-16',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Updated end date of remote work window',
    example: '2026-10-16',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Updated duration shift type for WFH',
    enum: WfhDurationType,
    example: WfhDurationType.FULL_DAY,
  })
  @IsOptional()
  @IsEnum(WfhDurationType, {
    message: 'durationType must be one of: FULL_DAY, FIRST_HALF, SECOND_HALF, CUSTOM_RANGE',
  })
  durationType?: WfhDurationType;

  @ApiPropertyOptional({
    description: 'Updated professional justification for working from home',
    example: 'Updated scope: remote coordination with vendor development team',
    minLength: 5,
    maxLength: 1000,
  })
  @IsOptional()
  @IsString({ message: 'reason must be a string' })
  @MinLength(5, { message: 'reason must be at least 5 characters long' })
  @MaxLength(1000, { message: 'reason cannot exceed 1000 characters' })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Target status transition if re-submitting request',
    enum: WfhStatus,
    example: WfhStatus.SUBMITTED,
  })
  @IsOptional()
  @IsEnum(WfhStatus, {
    message: 'status must be a valid WfhStatus',
  })
  status?: WfhStatus;
}
