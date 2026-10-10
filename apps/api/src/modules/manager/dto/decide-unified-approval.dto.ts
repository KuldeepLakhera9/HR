import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum UnifiedApprovalType {
  LEAVE = 'LEAVE',
  WFH = 'WFH',
  VISIT = 'VISIT',
}

export enum UnifiedDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class DecideUnifiedApprovalDto {
  @ApiProperty({
    description: 'Target workflow type',
    enum: UnifiedApprovalType,
  })
  @IsEnum(UnifiedApprovalType)
  @IsNotEmpty()
  type: UnifiedApprovalType;

  @ApiProperty({
    description: 'Request identifier',
  })
  @IsString()
  @IsNotEmpty()
  requestId: string;

  @ApiProperty({
    description: 'Approval or rejection decision',
    enum: UnifiedDecision,
  })
  @IsEnum(UnifiedDecision)
  @IsNotEmpty()
  decision: UnifiedDecision;

  @ApiPropertyOptional({
    description: 'Decision remarks or mandatory rejection reason (min 3 characters on rejection)',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Alias for remarks/reason',
  })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({
    description: 'Alias for remarks/reason',
  })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CancelUnifiedApprovalDto {
  @ApiProperty({
    description: 'Target workflow type',
    enum: UnifiedApprovalType,
  })
  @IsEnum(UnifiedApprovalType)
  @IsNotEmpty()
  type: UnifiedApprovalType;

  @ApiProperty({
    description: 'Request identifier',
  })
  @IsString()
  @IsNotEmpty()
  requestId: string;

  @ApiPropertyOptional({
    description: 'Reason for cancellation',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
