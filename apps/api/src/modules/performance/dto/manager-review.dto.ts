import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsNotEmpty,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FeedbackVisibility } from '@prisma/client';

export class ManagerReviewItemInputDto {
  @IsOptional()
  @IsString()
  goalId?: string;

  @IsOptional()
  @IsString()
  competencyId?: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  managerRating!: number;

  @IsOptional()
  @IsString()
  managerComments?: string;

  @IsOptional()
  @IsBoolean()
  isNotApplicable?: boolean;
}

export class DevelopmentPlanInputDto {
  @IsString()
  @IsNotEmpty({ message: 'Objective is required for development recommendation' })
  objective!: string;

  @IsString()
  @IsNotEmpty({ message: 'Action steps are required for development recommendation' })
  actionSteps!: string;

  @IsOptional()
  @IsString()
  targetDate?: string;

  @IsOptional()
  @IsString()
  trainingNeeds?: string;

  @IsOptional()
  @IsString()
  responsiblePerson?: string;
}

export class PerformanceFeedbackInputDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsEnum(FeedbackVisibility)
  visibility?: FeedbackVisibility;
}

export class SaveManagerReviewDraftDto {
  @IsOptional()
  @IsString()
  managerSummary?: string;

  @IsOptional()
  @IsString()
  managerStrengths?: string;

  @IsOptional()
  @IsString()
  managerImprovements?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManagerReviewItemInputDto)
  items?: ManagerReviewItemInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DevelopmentPlanInputDto)
  developmentPlans?: DevelopmentPlanInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceFeedbackInputDto)
  feedbackNotes?: PerformanceFeedbackInputDto[];
}

export class SubmitManagerReviewDto {
  @IsString()
  @IsNotEmpty({ message: 'Manager executive summary is required for submission' })
  managerSummary!: string;

  @IsString()
  @IsNotEmpty({ message: 'Key strengths are required for submission' })
  managerStrengths!: string;

  @IsString()
  @IsNotEmpty({ message: 'Improvement areas and development feedback are required for submission' })
  managerImprovements!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManagerReviewItemInputDto)
  items?: ManagerReviewItemInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DevelopmentPlanInputDto)
  developmentPlans?: DevelopmentPlanInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceFeedbackInputDto)
  feedbackNotes?: PerformanceFeedbackInputDto[];
}

export class ReturnReviewForCorrectionDto {
  @IsString()
  @IsNotEmpty({ message: 'Reason for returning review is mandatory' })
  reason!: string;
}

export class FinalizeReviewDto {
  @IsOptional()
  @IsString()
  finalComments?: string;
}

export class QueryManagerReviewsDto {
  @IsOptional()
  @IsString()
  cycleId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
