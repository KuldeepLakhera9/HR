import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { LeaveDurationType } from '@prisma/client';

export class CalculateLeaveDaysDto {
  @ApiProperty({
    description: 'Leave type ID',
    example: 'd978a1bc-3456-4231-9871-abcdef123456',
  })
  @IsNotEmpty({ message: 'leaveTypeId is required' })
  @IsUUID('4', { message: 'leaveTypeId must be a valid UUID' })
  leaveTypeId: string;

  @ApiProperty({
    description: 'Start date (YYYY-MM-DD)',
    example: '2026-10-15',
  })
  @IsNotEmpty({ message: 'startDate is required' })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date (YYYY-MM-DD)',
    example: '2026-10-16',
  })
  @IsNotEmpty({ message: 'endDate is required' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Duration type: FULL_DAY, FIRST_HALF, or SECOND_HALF',
    enum: LeaveDurationType,
    default: LeaveDurationType.FULL_DAY,
  })
  @IsOptional()
  @IsEnum(LeaveDurationType)
  durationType?: LeaveDurationType;

  @ApiPropertyOptional({
    description: 'Optional employee ID (defaults to current authenticated user)',
    example: '1bc7ca5e-9f03-4ade-9478-9623190b840a',
  })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;
}
