import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitCorrectionRequestDto {
  @ApiProperty({
    description: 'Target date to correct in YYYY-MM-DD format',
    example: '2026-10-08',
  })
  @IsDateString()
  @IsNotEmpty()
  targetDate: string;

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
    description: 'Justification / reason for attendance correction',
    example: 'Network connectivity failure while punching out at client site.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
