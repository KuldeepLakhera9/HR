import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export enum ReportFormat {
  JSON = 'json',
  CSV = 'csv',
}

export enum ReportScope {
  ALL = 'ALL',
  DIRECT = 'DIRECT',
}

export class BaseManagerReportQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive start date in ISO format (YYYY-MM-DD)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end date in ISO format (YYYY-MM-DD)',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter report to a single team employee ID within manager hierarchy scope',
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Filter by organizational department ID within team scope',
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by organizational branch ID within team scope',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    description:
      'Reporting scope: ALL (direct and indirect reports) or DIRECT (direct reports only)',
    enum: ReportScope,
    default: ReportScope.ALL,
  })
  @IsOptional()
  @IsEnum(ReportScope)
  scope?: ReportScope = ReportScope.ALL;

  @ApiPropertyOptional({
    description: 'Page index for server-side pagination (1-based)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page limit (1 to 100)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Response output format: json or csv',
    enum: ReportFormat,
    default: ReportFormat.JSON,
  })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat = ReportFormat.JSON;
}

export class ManagerTeamAttendanceReportQueryDto extends BaseManagerReportQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter by attendance day status (e.g. ALL, PRESENT, LATE, HALF_DAY, ABSENT, ON_LEAVE, HOLIDAY, WEEK_OFF)',
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  status?: string = 'ALL';

  @ApiPropertyOptional({
    description: 'Filter by primary attendance mode (e.g. ALL, OFFICE, WFH, OFFICIAL_VISIT)',
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  mode?: string = 'ALL';
}

export class ManagerTeamExceptionReportQueryDto extends BaseManagerReportQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter by attendance exception type (e.g. ALL, LATE_ARRIVAL, EARLY_EXIT, MISSING_CHECK_OUT, GEOFENCE_VIOLATION, OVERTIME, ABSENT_UNPLANNED)',
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  exceptionType?: string = 'ALL';

  @ApiPropertyOptional({
    description: 'Filter by exception severity: ALL, LOW, MEDIUM, HIGH',
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  severity?: string = 'ALL';

  @ApiPropertyOptional({
    description: 'Filter by resolution status: ALL, OPEN, RESOLVED, DISMISSED',
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  status?: string = 'ALL';
}

export class ManagerTeamApprovalReportQueryDto extends BaseManagerReportQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by approval workflow request type: ALL, LEAVE, WFH, VISIT',
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  type?: string = 'ALL';

  @ApiPropertyOptional({
    description: 'Filter by decision outcome: ALL, APPROVED, REJECTED',
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  decision?: string = 'ALL';
}

export class ManagerTeamAvailabilityReportQueryDto extends BaseManagerReportQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by minimum availability percentage threshold (0-100)',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minAvailabilityPct?: number;
}
