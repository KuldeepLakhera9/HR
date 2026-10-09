import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum CorrectionReasonCategory {
  MISSING_CHECKOUT = 'MISSING_CHECKOUT',
  WRONG_EVENT = 'WRONG_EVENT',
  TECHNICAL_GLITCH = 'TECHNICAL_GLITCH',
  EMERGENCY = 'EMERGENCY',
  OFFICIAL_DUTY = 'OFFICIAL_DUTY',
  OTHER = 'OTHER',
}

export class SubmitCorrectionRequestDto {
  @ApiProperty({
    description: 'Target date to correct in YYYY-MM-DD format',
    example: '2026-10-08',
  })
  @IsDateString()
  @IsNotEmpty()
  targetDate: string;

  @ApiPropertyOptional({
    description: 'Category of attendance discrepancy',
    enum: CorrectionReasonCategory,
    default: CorrectionReasonCategory.MISSING_CHECKOUT,
    example: CorrectionReasonCategory.MISSING_CHECKOUT,
  })
  @IsOptional()
  @IsEnum(CorrectionReasonCategory)
  reasonCategory?: CorrectionReasonCategory;

  @ApiPropertyOptional({
    description: 'Requested check-in ISO timestamp',
    example: '2026-10-08T09:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  requestedCheckIn?: string;

  @ApiPropertyOptional({
    description: 'Requested check-out ISO timestamp',
    example: '2026-10-08T18:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  requestedCheckOut?: string;

  @ApiProperty({
    description: 'Justification / detailed reason for attendance correction',
    example: 'Network connectivity failure while punching out at client site.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description: 'Optional evidence metadata (e.g. ticket ID, file reference, supervisor note)',
    example: { ticketId: 'INC-4029', note: 'Confirmed with branch manager' },
  })
  @IsOptional()
  evidenceMetadata?: any;
}
