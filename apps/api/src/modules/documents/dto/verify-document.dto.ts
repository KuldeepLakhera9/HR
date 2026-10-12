import { IsNotEmpty, IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyDocumentDto {
  @ApiProperty({
    enum: ['VERIFIED', 'REJECTED'],
    description: 'HR Verification outcome',
    example: 'VERIFIED',
  })
  @IsNotEmpty({ message: 'Verification decision is required' })
  @IsIn(['VERIFIED', 'REJECTED'], {
    message: 'Decision must be either VERIFIED or REJECTED',
  })
  decision: 'VERIFIED' | 'REJECTED';

  @ApiPropertyOptional({
    description: 'Reviewer feedback or reasons for rejection',
    example: 'Document verified against government database',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;
}
