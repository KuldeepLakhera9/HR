import { IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { GoalCategory, GoalMeasurementType, GoalStatus } from '@prisma/client';

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  businessRationale?: string;

  @IsOptional()
  @IsString()
  alignmentKey?: string;

  @IsOptional()
  @IsEnum(GoalCategory)
  category?: GoalCategory;

  @IsOptional()
  @IsEnum(GoalMeasurementType)
  measurementType?: GoalMeasurementType;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  baselineValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  targetValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  currentValue?: number;

  @IsOptional()
  @IsString()
  evaluationCriteria?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  policyReference?: string;

  @IsOptional()
  @IsString()
  changeReason?: string;
}
