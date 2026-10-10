import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ManagerDashboardQueryDto {
  @ApiPropertyOptional({
    description:
      'Target calculation date in ISO format YYYY-MM-DD. Defaults to current date in org timezone.',
    example: '2026-10-10',
  })
  @IsOptional()
  @IsDateString({}, { message: 'targetDate must be a valid ISO date string (YYYY-MM-DD)' })
  targetDate?: string;
}
