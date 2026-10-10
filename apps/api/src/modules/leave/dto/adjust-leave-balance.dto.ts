import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdjustLeaveBalanceDto {
  @ApiProperty({
    description: 'Target employee ID',
    example: '1bc7ca5e-9f03-4ade-9478-9623190b840a',
  })
  @IsNotEmpty({ message: 'employeeId is required' })
  @IsUUID('4', { message: 'employeeId must be a valid UUID' })
  employeeId: string;

  @ApiProperty({
    description: 'Leave type ID to adjust',
    example: 'd978a1bc-3456-4231-9871-abcdef123456',
  })
  @IsNotEmpty({ message: 'leaveTypeId is required' })
  @IsUUID('4', { message: 'leaveTypeId must be a valid UUID' })
  leaveTypeId: string;

  @ApiProperty({
    description: 'Leave year for which the balance adjustment applies',
    example: 2026,
    default: 2026,
  })
  @IsNotEmpty({ message: 'leaveYear is required' })
  @IsInt()
  @Min(2020)
  @Max(2100)
  leaveYear: number;

  @ApiProperty({
    description:
      'Adjustment amount in days (positive to credit, negative to debit, e.g. +2.0 or -1.5)',
    example: 2.0,
  })
  @IsNotEmpty({ message: 'amount is required' })
  @IsNumber({}, { message: 'amount must be a valid number' })
  amount: number;

  @ApiProperty({
    description: 'Mandatory audited justification for manual balance adjustment',
    example: 'Compensatory off credit for weekend server migration support',
    minLength: 5,
    maxLength: 500,
  })
  @IsNotEmpty({ message: 'reason is required' })
  @IsString({ message: 'reason must be a string' })
  @MinLength(5, { message: 'reason must be at least 5 characters long' })
  @MaxLength(500, { message: 'reason cannot exceed 500 characters' })
  reason: string;
}
