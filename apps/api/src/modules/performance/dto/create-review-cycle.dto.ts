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
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReviewCycleType } from '@prisma/client';

export class CreateReviewCycleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ReviewCycleType)
  type!: ReviewCycleType;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsDateString()
  goalSettingDeadline?: string;

  @IsOptional()
  @IsDateString()
  selfAssessmentDeadline?: string;

  @IsOptional()
  @IsDateString()
  managerReviewDeadline?: string;

  @IsOptional()
  @IsDateString()
  finalizationDeadline?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  goalsWeightPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  competenciesWeightPercentage?: number;

  @IsOptional()
  @IsBoolean()
  allowEmployeeGoalCreation?: boolean;

  @IsOptional()
  @IsBoolean()
  requireGoalApproval?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(3)
  @Max(10)
  ratingScaleMax?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleDepartmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleBranchIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleEmploymentStatuses?: string[];

  @IsOptional()
  @IsDateString()
  joiningDateCutoff?: string;

  @IsOptional()
  ratingScaleRubric?: any;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  autoEnroll?: boolean;
}
