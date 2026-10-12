import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExecutiveDashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Target snapshot date for active headcount (ISO format or YYYY-MM-DD)',
    example: '2026-10-12',
  })
  @IsOptional()
  @IsString()
  asOfDate?: string;

  @ApiPropertyOptional({
    description: 'Start date for flow metrics (attendance, joiners, exits, approvals)',
    example: '2026-09-12',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for flow metrics (inclusive)',
    example: '2026-10-12',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Optional department filter (enforces manager reporting line if caller is manager)',
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Optional branch filter',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}
