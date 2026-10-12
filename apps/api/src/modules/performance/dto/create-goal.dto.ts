import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GoalCategory, GoalMeasurementType } from '@prisma/client';

export class CreateGoalDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  cycleId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

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
  @IsString()
  evaluationCriteria?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weight!: number;

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
  @IsBoolean()
  submitForApproval?: boolean;
}
