import { IsString, IsNotEmpty, MinLength, IsBoolean, IsOptional } from 'class-validator';

export class RecalculateReviewScoreDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  reason: string;

  @IsBoolean()
  @IsOptional()
  forceRecalculate?: boolean;
}
