import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecalculateAttendanceDto {
  @ApiProperty({
    description: 'Start date for recalculation in YYYY-MM-DD format',
    example: '2026-10-09',
  })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({
    description:
      'End date for recalculation in YYYY-MM-DD format (defaults to startDate if omitted)',
    example: '2026-10-09',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Optional employee ID. If omitted, recalculates for all active employees in the organization.',
    example: 'e01b3337-0cfc-4bfd-a364-7548c77aa796',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Force overwrite of manually corrected summaries if true',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
