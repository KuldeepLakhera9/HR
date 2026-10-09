import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class VerifyVisitLocationDto {
  @ApiPropertyOptional({
    description:
      "Specific official visit ID to verify against. If omitted, the server looks up the user's active approved visit for today.",
    example: 'a0b1c2d3-e4f5-6789-0123-abcdef456789',
  })
  @IsOptional()
  @IsString()
  visitId?: string;

  @ApiPropertyOptional({
    description: 'Specific destination ID within the visit schedule',
    example: 'd1e2f3a4-b5c6-7890-1234-567890abcdef',
  })
  @IsOptional()
  @IsString()
  destinationId?: string;

  @ApiPropertyOptional({
    description: 'Latitude coordinate reported by device (-90.0 to +90.0)',
    example: 28.628,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90, { message: 'Latitude must be >= -90 degrees' })
  @Max(90, { message: 'Latitude must be <= 90 degrees' })
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate reported by device (-180.0 to +180.0)',
    example: 77.3649,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180, { message: 'Longitude must be >= -180 degrees' })
  @Max(180, { message: 'Longitude must be <= 180 degrees' })
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Horizontal accuracy reported by device in meters',
    example: 18.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Accuracy meters must be non-negative' })
  accuracyMeters?: number;

  @ApiPropertyOptional({
    description: 'ISO 8601 timestamp of client device location capture',
    example: '2026-10-09T10:30:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'clientTimestamp must be a valid ISO 8601 date string' })
  clientTimestamp?: string;

  @ApiPropertyOptional({
    description:
      'Documented exception reason for indoor, basement, or remote rural sites where GPS is unavailable or unsuitable (minimum 10 characters)',
    example: 'Client data center located in basement B2; cellular and GPS signals are obstructed.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  gpsExceptionReason?: string;

  @ApiPropertyOptional({
    description: 'Optional client device metadata (e.g., browser user agent, mobile device model)',
    example: 'Chrome 124 / Android Mobile',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceInfo?: string;
}
