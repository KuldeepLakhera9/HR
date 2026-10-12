import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReviewCycleStatus } from '@prisma/client';

export class TransitionCycleStageDto {
  @IsEnum(ReviewCycleStatus)
  targetStatus!: ReviewCycleStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
