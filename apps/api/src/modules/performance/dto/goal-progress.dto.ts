import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGoalProgressUpdateDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  currentValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercentage?: number;

  @IsString()
  @IsNotEmpty()
  note!: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  evidenceFileName?: string;
}
