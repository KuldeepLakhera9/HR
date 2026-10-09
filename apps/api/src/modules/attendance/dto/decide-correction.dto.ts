import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DecideCorrectionRequestDto {
  @ApiProperty({
    description: 'Decision on the attendance correction request',
    enum: ['APPROVED', 'REJECTED'],
    example: 'APPROVED',
  })
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({
    description: 'Review notes or reason for decision',
    example: 'Verified with manager log and approved punch regularization.',
  })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
