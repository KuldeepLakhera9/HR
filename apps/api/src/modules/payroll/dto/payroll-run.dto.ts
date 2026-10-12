import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum PayrollRunStatus {
  DRAFT = 'DRAFT',
  CALCULATING = 'CALCULATING',
  CALCULATED = 'CALCULATED',
  REVIEW_PENDING = 'REVIEW_PENDING',
  APPROVED = 'APPROVED',
  LOCKED = 'LOCKED',
  PUBLISHED = 'PUBLISHED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export class CreatePayrollRunDto {
  @ApiProperty({ description: 'Referenced PayrollPeriod ID' })
  @IsString()
  @IsNotEmpty()
  periodId: string;

  @ApiProperty({
    description: 'Human-readable title for the run',
    example: 'October 2026 Regular Payroll Run',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    description: 'Scope designation, e.g. ALL, BRANCH, DEPARTMENT, CUSTOM',
    default: 'ALL',
    example: 'ALL',
  })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({
    description:
      'Granular scope filter criteria (branchId, departmentId, employeeIds, employmentType)',
  })
  @IsOptional()
  @IsObject()
  scopeConfig?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Optional operational notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryPayrollRunsDto {
  @ApiPropertyOptional({ description: 'Filter by period ID' })
  @IsOptional()
  @IsString()
  periodId?: string;

  @ApiPropertyOptional({ enum: PayrollRunStatus })
  @IsOptional()
  @IsEnum(PayrollRunStatus)
  status?: PayrollRunStatus;

  @ApiPropertyOptional({ description: 'Filter by scope' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class ApprovePayrollRunDto {
  @ApiPropertyOptional({ description: 'Approval comments / sign-off notes' })
  @IsOptional()
  @IsString()
  comments?: string;
}

export class RejectPayrollRunDto {
  @ApiProperty({ description: 'Detailed reason for rejecting and sending back to draft' })
  @IsString()
  @IsNotEmpty()
  rejectionReason: string;
}

export class LockPayrollRunDto {
  @ApiPropertyOptional({ description: 'Lock notes / finalization summary' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CorrectionPayrollRunDto {
  @ApiProperty({ description: 'Justification and reason for issuing a post-lock correction run' })
  @IsString()
  @IsNotEmpty()
  correctionReason: string;

  @ApiPropertyOptional({ description: 'Optional notes for the correction run' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class PreviewScopeDto {
  @ApiPropertyOptional({ description: 'Payroll period ID to check active assignments against' })
  @IsOptional()
  @IsString()
  periodId?: string;

  @ApiPropertyOptional({ default: 'ALL' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  scopeConfig?: Record<string, any>;
}
