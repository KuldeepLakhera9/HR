import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class TriggerPerformanceRemindersDto {
  @IsOptional()
  @IsString()
  cycleId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  reminderWindowDays?: number;
}
