import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VisitStatus } from '@hrms/database';
import { CreateVisitDestinationDto } from './create-official-visit.dto';

export class UpdateOfficialVisitDto {
  @ApiPropertyOptional({
    description: 'Updated title of the visit',
    example: 'Client Architecture Review (Updated)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated purpose of the visit',
    example: 'Extended scope to cover backup testing.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  purpose?: string;

  @ApiPropertyOptional({
    description: 'Updated start date in YYYY-MM-DD format',
    example: '2026-10-15',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Updated end date in YYYY-MM-DD format',
    example: '2026-10-17',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Expected working duration in days',
    example: 3.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  expectedDurationDays?: number;

  @ApiPropertyOptional({
    description: 'Transition status (e.g. from DRAFT to SUBMITTED)',
    enum: [VisitStatus.DRAFT, VisitStatus.SUBMITTED],
  })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiPropertyOptional({
    description:
      'Updated destination list. Note: Material changes on an approved visit trigger reapproval.',
    type: [CreateVisitDestinationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVisitDestinationDto)
  destinations?: CreateVisitDestinationDto[];
}
