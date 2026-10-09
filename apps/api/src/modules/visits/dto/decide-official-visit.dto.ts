import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApprovalDecision } from '@hrms/database';

export class DecideOfficialVisitDto {
  @ApiProperty({
    description: 'Decision on the visit request (APPROVED or REJECTED)',
    enum: ApprovalDecision,
    example: ApprovalDecision.APPROVED,
  })
  @IsEnum(ApprovalDecision, {
    message: 'Decision must be either APPROVED or REJECTED',
  })
  @IsNotEmpty()
  decision: ApprovalDecision;

  @ApiPropertyOptional({
    description: 'Reviewer comments or justification for the approval / rejection',
    example: 'Approved. Please submit client attendance signed report upon completion.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Comments cannot exceed 500 characters' })
  comments?: string;
}
