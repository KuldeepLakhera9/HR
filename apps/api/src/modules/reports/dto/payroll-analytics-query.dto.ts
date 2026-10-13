import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PayrollReportQueryDto {
  @ApiPropertyOptional({ description: 'Payroll Period ID' })
  @IsOptional()
  @IsString()
  periodId?: string;

  @ApiPropertyOptional({ description: 'Payroll Run ID' })
  @IsOptional()
  @IsString()
  runId?: string;

  @ApiPropertyOptional({ description: 'Comparison Payroll Run ID (for period comparison)' })
  @IsOptional()
  @IsString()
  compareRunId?: string;

  @ApiPropertyOptional({ description: 'Comparison Period ID' })
  @IsOptional()
  @IsString()
  comparePeriodId?: string;

  @ApiPropertyOptional({ description: 'Filter by Department ID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by Branch ID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by Employment Status' })
  @IsOptional()
  @IsString()
  employmentStatus?: string;

  @ApiPropertyOptional({
    description: 'Filter by Payroll Status (DRAFT, APPROVED, LOCKED, PUBLISHED, ALL)',
  })
  @IsOptional()
  @IsString()
  payrollStatus?: string;

  @ApiPropertyOptional({ description: 'Filter by Payment Status (PENDING, PAID, FAILED, ALL)' })
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @ApiPropertyOptional({ description: 'Filter by Exception Severity' })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ description: 'Filter by Adjustment Type' })
  @IsOptional()
  @IsString()
  adjustmentType?: string;

  @ApiPropertyOptional({ description: 'Free-text search for employee code or name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Pagination page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Pagination limit', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 50;
}
