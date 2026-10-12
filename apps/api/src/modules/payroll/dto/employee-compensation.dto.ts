import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CompensationStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum CompensationChangeReason {
  JOINING = 'JOINING',
  ANNUAL_INCREMENT = 'ANNUAL_INCREMENT',
  PROMOTION = 'PROMOTION',
  MARKET_CORRECTION = 'MARKET_CORRECTION',
  ROLE_CHANGE = 'ROLE_CHANGE',
  PROBATION_CONFIRMATION = 'PROBATION_CONFIRMATION',
  SPECIAL_ADJUSTMENT = 'SPECIAL_ADJUSTMENT',
  OTHER = 'OTHER',
}

export class CreateEmployeeCompensationDto {
  @ApiProperty({ description: 'Referenced active SalaryStructure ID' })
  @IsString()
  @IsNotEmpty()
  structureId: string;

  @ApiProperty({ description: 'Annual Cost to Company (CTC)', example: 1200000.0 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  ctcAnnual: number;

  @ApiProperty({
    description: 'Effective date from which this compensation takes effect (ISO UTC)',
    example: '2026-11-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty()
  effectiveFrom: string;

  @ApiPropertyOptional({
    description: 'Optional scheduled end date for fixed-term or temporary compensation',
    example: '2027-10-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiProperty({
    enum: CompensationChangeReason,
    example: CompensationChangeReason.ANNUAL_INCREMENT,
  })
  @IsEnum(CompensationChangeReason)
  changeReason: CompensationChangeReason;

  @ApiPropertyOptional({
    description: 'Business justification or change reason summary',
    example: 'Annual Performance Appraisal 2026',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Internal HR/Finance notes',
    example: 'Approved per FY26 budget grid',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Set to true to submit into PENDING_APPROVAL status instead of immediate activation',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  submitForApproval?: boolean = false;
}

export class ApproveCompensationDto {
  @ApiPropertyOptional({ description: 'Optional approval comments' })
  @IsOptional()
  @IsString()
  comments?: string;
}

export class RejectCompensationDto {
  @ApiProperty({ description: 'Mandatory reason for rejection' })
  @IsString()
  @IsNotEmpty()
  rejectionReason: string;
}

export class ApplicableCompensationQueryDto {
  @ApiPropertyOptional({
    description: 'Specific evaluation date (e.g. 2026-10-15)',
    example: '2026-10-15',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Payroll period start date (e.g. 2026-10-01)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Payroll period end date (e.g. 2026-10-31)',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
