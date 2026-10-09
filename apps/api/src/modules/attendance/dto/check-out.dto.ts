import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CheckOutDto {
  @ApiProperty({
    description: 'Unique UUID idempotency key preventing duplicate checkout submissions',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiPropertyOptional({
    description: 'Device GPS latitude coordinate',
    example: 12.9716,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Device GPS longitude coordinate',
    example: 77.5946,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Device reported horizontal accuracy in meters',
    example: 15.0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  accuracyMeters?: number;

  @ApiPropertyOptional({
    description: 'Client device timestamp for clock skew validation',
  })
  @IsOptional()
  timestamp?: string | number;

  @ApiPropertyOptional({
    description: 'Device/browser environment metadata',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
  })
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}
