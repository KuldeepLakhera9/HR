import { IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';

export class ReopenCycleDto {
  @IsString()
  @IsNotEmpty()
  reopenReason!: string;

  @IsOptional()
  @IsDateString()
  extendedFinalizationDeadline?: string;
}
