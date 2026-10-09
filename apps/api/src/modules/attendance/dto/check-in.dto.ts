import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CheckInDto {
  @ApiPropertyOptional({
    description:
      'Device GPS latitude coordinate (required for OFFICE and standard outdoor visit punches)',
    example: 12.9716,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({
    description:
      'Device GPS longitude coordinate (required for OFFICE and standard outdoor visit punches)',
    example: 77.5946,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Device reported horizontal accuracy in meters',
    example: 15.5,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  accuracyMeters?: number;

  @ApiPropertyOptional({
    description: 'Client device timestamp (ISO 8601 or epoch ms) for clock skew validation',
    example: '2026-10-09T09:00:00.000Z',
  })
  @IsOptional()
  timestamp?: string | number;

  @ApiProperty({
    description: 'Unique UUID idempotency key preventing duplicate punch submissions',
    example: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiPropertyOptional({
    description:
      'Specific office location ID to check in against (optional, auto-resolved if omitted)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsOptional()
  officeLocationId?: string;

  @ApiPropertyOptional({
    description: 'Attendance mode (OFFICE, OFFICIAL_VISIT)',
    enum: ['OFFICE', 'WFH', 'OFFICIAL_VISIT'],
    default: 'OFFICE',
  })
  @IsString()
  @IsOptional()
  attendanceMode?: string;

  @ApiPropertyOptional({
    description: 'Supporting approved official visit ID when checking in for field outdoor duty',
    example: 'a0b1c2d3-e4f5-6789-0123-abcdef456789',
  })
  @IsString()
  @IsOptional()
  officialVisitId?: string;

  @ApiPropertyOptional({
    description: 'Supporting approved WFH request ID when checking in for work from home',
    example: 'b1c2d3e4-f5a6-7890-1234-bcdef0123456',
  })
  @IsString()
  @IsOptional()
  wfhRequestId?: string;

  @ApiPropertyOptional({
    description: 'Specific visit destination ID being attended',
    example: 'd1e2f3a4-b5c6-7890-1234-567890abcdef',
  })
  @IsString()
  @IsOptional()
  destinationId?: string;

  @ApiPropertyOptional({
    description: 'Documented exception reason for indoor/remote sites where GPS is unavailable',
    example: 'Client meeting in underground server bunker, zero GPS reception',
  })
  @IsString()
  @IsOptional()
  gpsExceptionReason?: string;

  @ApiPropertyOptional({
    description: 'Device/browser environment metadata',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
  })
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}
