import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApprovalDecision } from '@prisma/client';

export class DecideLeaveRequestDto {
  @ApiProperty({
    description: 'Decision outcome: APPROVED or REJECTED',
    enum: ApprovalDecision,
    example: ApprovalDecision.APPROVED,
  })
  @IsNotEmpty({ message: 'decision is required' })
  @IsEnum(ApprovalDecision, { message: 'decision must be either APPROVED or REJECTED' })
  decision: ApprovalDecision;

  @ApiPropertyOptional({
    description: 'Comments or rationale (Mandatory if decision is REJECTED)',
    example: 'Approved. Enjoy your time off with family.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString({ message: 'comments must be a string' })
  @MaxLength(1000, { message: 'comments cannot exceed 1000 characters' })
  comments?: string;
}
