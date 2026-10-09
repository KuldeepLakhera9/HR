import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApprovalDecision } from '@prisma/client';

export class DecideWfhRequestDto {
  @ApiProperty({
    description: 'Review decision: APPROVED or REJECTED',
    enum: ApprovalDecision,
    example: ApprovalDecision.APPROVED,
  })
  @IsNotEmpty({ message: 'decision is required' })
  @IsEnum(ApprovalDecision, {
    message: 'decision must be either APPROVED or REJECTED',
  })
  decision: ApprovalDecision;

  @ApiPropertyOptional({
    description: 'Optional reviewer remarks or business reason for rejection/approval',
    example: 'Approved. Remote coordination approved for deliverables audit.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'comments must be a string' })
  @MaxLength(500, { message: 'comments cannot exceed 500 characters' })
  comments?: string;
}
