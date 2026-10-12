import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum PayrollPeriodStatus {
  UPCOMING = 'UPCOMING',
  OPEN = 'OPEN',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
}

export class CreatePayrollPeriodDto {
  @ApiProperty({ description: 'Calendar year', example: 2026 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  @Type(() => Number)
  year: number;

  @ApiProperty({ description: 'Calendar month (1-12)', example: 10 })
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  month: number;

  @ApiProperty({
    description: 'Start date of the payroll period (ISO UTC)',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({
    description: 'End date of the payroll period (ISO UTC)',
    example: '2026-10-31T23:59:59.999Z',
  })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Attendance and leave cutoff deadline date',
    example: '2026-10-25T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  cutoffDate?: string;

  @ApiPropertyOptional({
    description: 'Target salary payout date',
    example: '2026-11-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  payoutDate?: string;

  @ApiPropertyOptional({
    description: 'Processing deadline for HR/Finance approval',
    example: '2026-10-28T18:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  processingDeadline?: string;
}

export class UpdatePayrollPeriodDto {
  @ApiPropertyOptional({ description: 'Attendance and leave cutoff date' })
  @IsOptional()
  @IsDateString()
  cutoffDate?: string;

  @ApiPropertyOptional({ description: 'Target salary payout date' })
  @IsOptional()
  @IsDateString()
  payoutDate?: string;

  @ApiPropertyOptional({ description: 'Processing deadline for approval' })
  @IsOptional()
  @IsDateString()
  processingDeadline?: string;
}

export class QueryPayrollPeriodsDto {
  @ApiPropertyOptional({ description: 'Filter by calendar year' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  year?: number;

  @ApiPropertyOptional({ enum: PayrollPeriodStatus })
  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;
}
