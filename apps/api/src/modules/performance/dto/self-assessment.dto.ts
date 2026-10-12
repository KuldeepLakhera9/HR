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
} from 'class-validator';
import { Type } from 'class-transformer';

export class SelfAssessmentAttachmentDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class SelfAssessmentItemInputDto {
  @IsOptional()
  @IsString()
  goalId?: string;

  @IsOptional()
  @IsString()
  competencyId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  selfRating?: number;

  @IsOptional()
  @IsString()
  selfComments?: string;

  @IsOptional()
  @IsString()
  selfEvidenceUrl?: string;

  @IsOptional()
  @IsBoolean()
  isNotApplicable?: boolean;
}

export class SaveSelfAssessmentDraftDto {
  @IsString()
  @IsNotEmpty()
  cycleId!: string;

  @IsOptional()
  @IsString()
  selfSummary?: string;

  @IsOptional()
  @IsString()
  selfAchievements?: string;

  @IsOptional()
  @IsString()
  selfChallenges?: string;

  @IsOptional()
  @IsString()
  skillsDeveloped?: string;

  @IsOptional()
  @IsString()
  developmentInterests?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelfAssessmentAttachmentDto)
  selfEvidenceAttachments?: SelfAssessmentAttachmentDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelfAssessmentItemInputDto)
  items?: SelfAssessmentItemInputDto[];
}

export class SubmitSelfAssessmentDto {
  @IsString()
  @IsNotEmpty()
  cycleId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Overall summary is required for final submission' })
  selfSummary!: string;

  @IsString()
  @IsNotEmpty({ message: 'Key achievements are required for final submission' })
  selfAchievements!: string;

  @IsOptional()
  @IsString()
  selfChallenges?: string;

  @IsOptional()
  @IsString()
  skillsDeveloped?: string;

  @IsOptional()
  @IsString()
  developmentInterests?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelfAssessmentAttachmentDto)
  selfEvidenceAttachments?: SelfAssessmentAttachmentDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelfAssessmentItemInputDto)
  items?: SelfAssessmentItemInputDto[];
}

export class ReopenSelfAssessmentDto {
  @IsString()
  @IsNotEmpty({ message: 'Reopening reason is mandatory for audit trail' })
  reason!: string;
}
