import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApproveGoalDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
