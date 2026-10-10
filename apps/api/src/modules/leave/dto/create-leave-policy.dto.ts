import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LeaveAccrualFrequency } from '@prisma/client';

export class CreateLeavePolicyDto {
  @ApiProperty({
    description: 'ID of the parent leave type',
    example: 'd978a1bc-3456-4231-9871-abcdef123456',
  })
  @IsNotEmpty({ message: 'leaveTypeId is required' })
  @IsUUID('4', { message: 'leaveTypeId must be a valid UUID' })
  leaveTypeId: string;

  @ApiProperty({
    description: 'Human-readable policy name',
    example: 'Standard Casual Leave Policy 2026',
  })
  @IsNotEmpty({ message: 'name is required' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Unique policy code',
    example: 'POL-CL-2026',
  })
  @IsNotEmpty({ message: 'code is required' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must contain uppercase alphanumeric characters, dashes, or underscores',
  })
  code: string;

  @ApiPropertyOptional({
    description: 'Policy description and terms',
    example: 'Standard 12 days annual entitlement for permanent employees',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Total annual entitlement in days (supports fractions, e.g. 12.0)',
    example: 12.0,
    default: 12.0,
  })
  @IsNotEmpty({ message: 'annualEntitlement is required' })
  @IsNumber({}, { message: 'annualEntitlement must be a number' })
  @Min(0, { message: 'annualEntitlement cannot be negative' })
  @Max(365, { message: 'annualEntitlement cannot exceed 365 days' })
  annualEntitlement: number;

  @ApiPropertyOptional({
    description: 'Accrual schedule: ANNUAL, MONTHLY, or QUARTERLY',
    enum: LeaveAccrualFrequency,
    default: LeaveAccrualFrequency.ANNUAL,
  })
  @IsOptional()
  @IsEnum(LeaveAccrualFrequency)
  accrualFrequency?: LeaveAccrualFrequency;

  @ApiPropertyOptional({
    description: 'Maximum days carried forward into the next leave year',
    default: 0.0,
    example: 0.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(180)
  carryForwardLimit?: number;

  @ApiPropertyOptional({
    description: 'Maximum consecutive days allowed in a single leave request',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  maxConsecutiveDays?: number;

  @ApiPropertyOptional({
    description: 'Minimum days of advance notice required before leave start date',
    default: 0,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  minNoticeDays?: number;

  @ApiPropertyOptional({
    description: 'Sandwich rule: Whether weekends falling inside leave window count as leave',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  countWeekendsAsLeave?: boolean;

  @ApiPropertyOptional({
    description:
      'Sandwich rule: Whether public holidays falling inside leave window count as leave',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  countHolidaysAsLeave?: boolean;

  @ApiPropertyOptional({
    description: 'Whether negative leave balance is tolerated',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowNegativeBalance?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum negative balance limit allowed if negative balance is permitted',
    default: 0.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  maxNegativeBalance?: number;

  @ApiPropertyOptional({
    description: 'Effective start date of policy (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({
    description: 'Effective end date of policy (YYYY-MM-DD)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({
    description: 'Whether the policy is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLeavePolicyDto {
  @ApiPropertyOptional({ example: 'Standard Casual Leave Policy 2026' })
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

  @ApiPropertyOptional({ example: 14.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  annualEntitlement?: number;

  @ApiPropertyOptional({ enum: LeaveAccrualFrequency })
  @IsOptional()
  @IsEnum(LeaveAccrualFrequency)
  accrualFrequency?: LeaveAccrualFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(180)
  carryForwardLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  maxConsecutiveDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  minNoticeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  countWeekendsAsLeave?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  countHolidaysAsLeave?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowNegativeBalance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  maxNegativeBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignLeavePolicyDto {
  @ApiProperty({
    description: 'Target employee ID',
    example: '1bc7ca5e-9f03-4ade-9478-9623190b840a',
  })
  @IsNotEmpty()
  @IsUUID('4')
  employeeId: string;

  @ApiProperty({
    description: 'Leave policy ID to assign',
    example: 'f950d8ef-8f72-4afe-ae92-cb29abd6e570',
  })
  @IsNotEmpty()
  @IsUUID('4')
  leavePolicyId: string;

  @ApiPropertyOptional({
    description: 'Effective assignment start date',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({
    description: 'Effective assignment end date',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
