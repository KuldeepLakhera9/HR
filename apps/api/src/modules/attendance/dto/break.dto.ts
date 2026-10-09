import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class BreakDto {
  @ApiProperty({
    description: 'Unique UUID idempotency key preventing duplicate submissions',
    example: 'b1c2d3e4-f5a6-7890-bcde-fa1234567890',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiPropertyOptional({
    description: 'Break category or reason (e.g. Lunch, Tea break, Medical)',
    example: 'Lunch break',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Device/browser environment metadata',
  })
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}
