import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, MinLength } from 'class-validator';
import { DevelopmentPlanStatus, FeedbackVisibility } from '@prisma/client';

export class CreateDevelopmentPlanDto {
  @IsString()
  @IsNotEmpty()
  reviewId: string;

  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  objective: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  actionSteps: string;

  @IsString()
  @IsOptional()
  successCriteria?: string;

  @IsDateString()
  @IsOptional()
  targetDate?: string;

  @IsString()
  @IsOptional()
  responsiblePerson?: string;

  @IsString()
  @IsOptional()
  trainingNeeds?: string;

  @IsEnum(DevelopmentPlanStatus)
  @IsOptional()
  status?: DevelopmentPlanStatus;
}

export class UpdateDevelopmentPlanDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  objective?: string;

  @IsString()
  @IsOptional()
  @MinLength(5)
  actionSteps?: string;

  @IsString()
  @IsOptional()
  successCriteria?: string;

  @IsDateString()
  @IsOptional()
  targetDate?: string;

  @IsString()
  @IsOptional()
  responsiblePerson?: string;

  @IsString()
  @IsOptional()
  trainingNeeds?: string;

  @IsEnum(DevelopmentPlanStatus)
  @IsOptional()
  status?: DevelopmentPlanStatus;

  @IsString()
  @IsOptional()
  followUpNotes?: string;

  @IsString()
  @IsOptional()
  completionEvidence?: string;
}

export class CreateFeedbackDto {
  @IsString()
  @IsNotEmpty()
  reviewId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  content: string;

  @IsEnum(FeedbackVisibility)
  @IsOptional()
  visibility?: FeedbackVisibility;
}

export class UpdateFeedbackDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  title?: string;

  @IsString()
  @IsOptional()
  @MinLength(5)
  content?: string;

  @IsEnum(FeedbackVisibility)
  @IsOptional()
  visibility?: FeedbackVisibility;
}
