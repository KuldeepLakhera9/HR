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

  @ApiPropertyOptional({
    description: 'Supporting official visit ID if checking out of a field visit session',
    example: 'a0b1c2d3-e4f5-6789-0123-abcdef456789',
  })
  @IsString()
  @IsOptional()
  officialVisitId?: string;

  @ApiPropertyOptional({
    description: 'Specific visit destination ID',
  })
  @IsString()
  @IsOptional()
  destinationId?: string;

  @ApiPropertyOptional({
    description: 'Documented exception reason for indoor/remote sites',
  })
  @IsString()
  @IsOptional()
  gpsExceptionReason?: string;

  @ApiPropertyOptional({
    description: 'Explicitly mark multi-day official visit as completed on checkout',
    example: true,
  })
  @IsOptional()
  isVisitConcluded?: boolean;

  @ApiPropertyOptional({
    description: 'Supporting approved WFH request ID if checking out of a WFH session',
    example: 'b1c2d3e4-f5a6-7890-1234-bcdef0123456',
  })
  @IsString()
  @IsOptional()
  wfhRequestId?: string;
}
