import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LeaveDurationType } from '@prisma/client';

export class CreateLeaveRequestDto {
  @ApiProperty({
    description: 'Leave type ID (e.g. Casual Leave, Sick Leave)',
    example: 'd978a1bc-3456-4231-9871-abcdef123456',
  })
  @IsNotEmpty({ message: 'leaveTypeId is required' })
  @IsUUID('4', { message: 'leaveTypeId must be a valid UUID' })
  leaveTypeId: string;

  @ApiProperty({
    description:
      'Leave start date in YYYY-MM-DD or ISO 8601 string format (normalized to UTC midnight)',
    example: '2026-10-15',
  })
  @IsNotEmpty({ message: 'startDate is required' })
  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
  startDate: string;

  @ApiProperty({
    description:
      'Leave end date in YYYY-MM-DD or ISO 8601 string format (normalized to UTC midnight)',
    example: '2026-10-16',
  })
  @IsNotEmpty({ message: 'endDate is required' })
  @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
  endDate: string;

  @ApiPropertyOptional({
    description:
      'Duration type: FULL_DAY, FIRST_HALF, or SECOND_HALF (half-day only allowed for single-day leaves)',
    enum: LeaveDurationType,
    default: LeaveDurationType.FULL_DAY,
  })
  @IsOptional()
  @IsEnum(LeaveDurationType, {
    message: 'durationType must be one of: FULL_DAY, FIRST_HALF, SECOND_HALF',
  })
  durationType?: LeaveDurationType;

  @ApiProperty({
    description: 'Reason for the leave application',
    example: 'Family Diwali festival celebrations and ancestral home visit',
    minLength: 5,
    maxLength: 1000,
  })
  @IsNotEmpty({ message: 'reason is required' })
  @IsString({ message: 'reason must be a string' })
  @MinLength(5, { message: 'reason must be at least 5 characters long' })
  @MaxLength(1000, { message: 'reason cannot exceed 1000 characters' })
  reason: string;

  @ApiPropertyOptional({
    description:
      'Optional URL or relative path to supporting attachment (e.g. medical certificate)',
    example: '/uploads/leave/medical_cert_20261015.pdf',
  })
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @ApiPropertyOptional({
    description: 'Original filename of the supporting attachment',
    example: 'medical_cert_20261015.pdf',
  })
  @IsOptional()
  @IsString()
  attachmentName?: string;

  @ApiPropertyOptional({
    description: 'Client-generated idempotency key preventing duplicate submissions',
    example: 'idemp-leave-12345678',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
