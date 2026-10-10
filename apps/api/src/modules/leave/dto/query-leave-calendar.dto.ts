import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class QueryLeaveCalendarDto {
  @ApiProperty({
    description: 'Calendar window start date (YYYY-MM-DD)',
    example: '2026-10-01',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Calendar window end date (YYYY-MM-DD)',
    example: '2026-10-31',
  })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description:
      'Calendar view scope: my (self only), team (reporting hierarchy), organization (all)',
    enum: ['my', 'team', 'organization'],
    default: 'team',
  })
  @IsOptional()
  @IsIn(['my', 'team', 'organization'])
  scope?: 'my' | 'team' | 'organization';

  @ApiPropertyOptional({
    description: 'Filter calendar to a specific employee ID (authorized callers only)',
  })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Filter calendar by department ID',
  })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Filter calendar by branch ID',
  })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Filter calendar by specific leave type ID',
  })
  @IsOptional()
  @IsUUID('4')
  leaveTypeId?: string;
}
