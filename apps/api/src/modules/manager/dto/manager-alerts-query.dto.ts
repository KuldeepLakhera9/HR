import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ManagerAlertsQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter alerts by notification type (e.g. ACTION_REQUIRED, EXCEPTION_ALERT, UPCOMING_ABSENCE)',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter alerts by read status (true or false)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum number of alerts to return (default 50, max 100)',
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
