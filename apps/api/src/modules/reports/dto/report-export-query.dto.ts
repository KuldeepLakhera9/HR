import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExportReportQueryDto {
  @ApiProperty({
    description: 'Report Catalog Key to export (e.g. REP-WF-01, REP-ATT-01, REP-REQ-01, REP-PM-01)',
  })
  @IsString()
  @IsNotEmpty()
  reportKey: string;

  @ApiPropertyOptional({ description: 'Point-in-time as-of snapshot date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  asOfDate?: string;

  @ApiPropertyOptional({ description: 'Start date ISO string (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date ISO string (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by department ID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by review cycle ID (for performance reports)' })
  @IsOptional()
  @IsString()
  cycleId?: string;

  @ApiPropertyOptional({ description: 'Filter by request type (LEAVE, WFH, OFFICIAL_VISIT)' })
  @IsOptional()
  @IsString()
  requestType?: string;

  @ApiPropertyOptional({ description: 'Filter by workflow or attendance status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by payroll period ID' })
  @IsOptional()
  @IsString()
  periodId?: string;

  @ApiPropertyOptional({ description: 'Filter by payroll run ID' })
  @IsOptional()
  @IsString()
  runId?: string;

  @ApiPropertyOptional({ description: 'Comparison run ID' })
  @IsOptional()
  @IsString()
  compareRunId?: string;

  @ApiPropertyOptional({ description: 'Filter by payroll status' })
  @IsOptional()
  @IsString()
  payrollStatus?: string;

  @ApiPropertyOptional({ description: 'Filter by payment status' })
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @ApiPropertyOptional({ description: 'Filter by exception severity' })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ description: 'Filter by adjustment type' })
  @IsOptional()
  @IsString()
  adjustmentType?: string;

  @ApiPropertyOptional({
    description: 'Maximum rows to export (bounded limit, max 5000)',
    default: 5000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number = 5000;
}
