import { IsOptional, IsString } from 'class-validator';

export class QueryHrPerformanceReportDto {
  @IsOptional()
  @IsString()
  cycleId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
