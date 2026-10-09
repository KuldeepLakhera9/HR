import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VisitStatus } from '@hrms/database';

export class CreateVisitDestinationDto {
  @ApiProperty({
    description: 'Name of the client site or destination facility',
    example: 'Apex Enterprise Headquarters',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  destinationName: string;

  @ApiPropertyOptional({
    description: 'Street address of the destination',
    example: '124 Innovation Way, Tech Park',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({
    description: 'City of the destination',
    example: 'Bangalore',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    description: 'Target latitude coordinate for field geofencing',
    example: 12.9716,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Target longitude coordinate for field geofencing',
    example: 77.5946,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Geofence radius tolerance in meters (default: 200)',
    example: 200,
    default: 200,
  })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(5000)
  radiusMeters?: number;

  @ApiPropertyOptional({
    description:
      'Flag indicating whether check-in requires geofence verification at this destination',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isGeofenceRequired?: boolean;
}

export class CreateOfficialVisitDto {
  @ApiProperty({
    description: 'Concise title describing the business visit',
    example: 'Client Architecture Review & Data Center Audit',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({
    description: 'Comprehensive business justification and purpose for the outdoor duty',
    example:
      'Review on-premise hardware deployment, conduct disaster recovery drills with client lead.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  purpose: string;

  @ApiProperty({
    description: 'Start date in YYYY-MM-DD format (normalized to UTC midnight)',
    example: '2026-10-15',
  })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({
    description: 'End date in YYYY-MM-DD format (normalized to UTC midnight)',
    example: '2026-10-16',
  })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Expected working duration in days (default: calculated from date range)',
    example: 2.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  expectedDurationDays?: number;

  @ApiPropertyOptional({
    description: 'Initial submission status (DRAFT or SUBMITTED, default: SUBMITTED)',
    enum: [VisitStatus.DRAFT, VisitStatus.SUBMITTED],
    default: VisitStatus.SUBMITTED,
  })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiProperty({
    description: 'List of scheduled destinations for the visit (at least 1 destination required)',
    type: [CreateVisitDestinationDto],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one destination must be specified for an official visit' })
  @ValidateNested({ each: true })
  @Type(() => CreateVisitDestinationDto)
  destinations: CreateVisitDestinationDto[];
}
