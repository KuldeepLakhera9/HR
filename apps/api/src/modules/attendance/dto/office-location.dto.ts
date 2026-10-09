import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateOfficeLocationDto {
  @ApiPropertyOptional({ example: 'b1234567-89ab-cdef-0123-456789abcdef' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ example: 'Bengaluru Tech Park Headquarters' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'BLR-HQ-01' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Tower 4, Prestige Tech Cloud, Bellary Road, Bengaluru' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 12.9716, description: 'Latitude between -90 and 90' })
  @IsNotEmpty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 77.5946, description: 'Longitude between -180 and 180' })
  @IsNotEmpty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: 100, default: 100, description: 'Geofence radius in meters' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(5000)
  geofenceRadiusMeters?: number;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ example: '2028-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class UpdateOfficeLocationDto {
  @ApiPropertyOptional({ example: 'b1234567-89ab-cdef-0123-456789abcdef' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ example: 'Bengaluru Tech Park - Wing B' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'BLR-WING-B' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Wing B, Level 5, Prestige Tech Cloud' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 12.9716 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 77.5946 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(5000)
  geofenceRadiusMeters?: number;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class OfficeLocationFilterDto {
  @ApiPropertyOptional({ example: 'b1234567-89ab-cdef-0123-456789abcdef' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ example: 'Bengaluru' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  limit?: number;
}

export class ValidateLocationDto {
  @ApiPropertyOptional({ description: 'Specific office location ID to validate against' })
  @IsOptional()
  @IsString()
  officeLocationId?: string;

  @ApiPropertyOptional({ description: 'Branch ID (will resolve assigned or primary office)' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ example: 12.9716, description: 'Client device latitude' })
  @IsNotEmpty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 77.5946, description: 'Client device longitude' })
  @IsNotEmpty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: 18.5, description: 'Reported horizontal GPS accuracy in meters' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  @ApiPropertyOptional({ example: '2026-10-09T10:00:00.000Z', description: 'Client timestamp' })
  @IsOptional()
  timestamp?: string | number;
}
