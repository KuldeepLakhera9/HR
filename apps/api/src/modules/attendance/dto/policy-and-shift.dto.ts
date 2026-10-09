import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreatePolicyDto {
  @ApiPropertyOptional({ example: 'b1234567-89ab-cdef-0123-456789abcdef' })
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiProperty({ example: 'Standard Corporate Policy' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'STD-CORP' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiPropertyOptional({ example: 'Default 8-hour workday policy for corporate staff' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: 480, default: 480 })
  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(1440)
  standardWorkMinutes?: number;

  @ApiPropertyOptional({ example: 240, default: 240 })
  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(720)
  halfDayThresholdMinutes?: number;

  @ApiPropertyOptional({ example: 420, default: 420 })
  @IsOptional()
  @IsNumber()
  @Min(120)
  @Max(1440)
  fullDayThresholdMinutes?: number;

  @ApiPropertyOptional({ example: 15, default: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  gracePeriodMinutes?: number;

  @ApiPropertyOptional({ example: 120, default: 120 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(480)
  maxCheckInDelayMinutes?: number;

  @ApiPropertyOptional({ example: 60, default: 60 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(240)
  maxDailyBreakMinutes?: number;

  @ApiPropertyOptional({ example: 45, default: 45 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(180)
  maxSingleBreakMinutes?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  allowMultipleSessions?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  overnightShiftAllowed?: boolean;

  @ApiPropertyOptional({
    example: 5,
    default: 5,
    description: 'Cutoff hour for overnight shifts (0-23)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(23)
  workingDayStartHour?: number;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  geofenceEnforcement?: boolean;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(1000)
  maxGpsAccuracyMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  standardWorkMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  halfDayThresholdMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  fullDayThresholdMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  gracePeriodMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxCheckInDelayMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxDailyBreakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxSingleBreakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowMultipleSessions?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  overnightShiftAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  workingDayStartHour?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  geofenceEnforcement?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxGpsAccuracyMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateShiftDto {
  @ApiPropertyOptional({ example: 'p1234567-89ab-cdef-0123-456789abcdef' })
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiProperty({ example: 'General Day Shift' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'GEN-01' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiPropertyOptional({ example: 'Standard working schedule 09:00 - 18:00' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '09:00' })
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime must be in HH:mm 24-hour format' })
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime must be in HH:mm 24-hour format' })
  endTime!: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5], default: [1, 2, 3, 4, 5] })
  @IsOptional()
  @IsArray()
  workDays?: number[];

  @ApiPropertyOptional({ example: 60, default: 60 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(240)
  breakDurationMinutes?: number;

  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateShiftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime must be in HH:mm 24-hour format' })
  startTime?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime must be in HH:mm 24-hour format' })
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  workDays?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  breakDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignShiftDto {
  @ApiProperty({ example: 'e1234567-89ab-cdef-0123-456789abcdef' })
  @IsNotEmpty()
  @IsString()
  employeeId!: string;

  @ApiProperty({ example: 's1234567-89ab-cdef-0123-456789abcdef' })
  @IsNotEmpty()
  @IsString()
  shiftId!: string;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  @IsNotEmpty()
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class SimulatePolicyDto {
  @ApiPropertyOptional({ description: 'Specific policy ID to test' })
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiPropertyOptional({ description: 'Specific shift ID to test' })
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiProperty({ example: '2026-10-09' })
  @IsNotEmpty()
  @IsString()
  workingDate!: string;

  @ApiProperty({ example: '2026-10-09T03:42:00.000Z', description: 'Check-in UTC timestamp' })
  @IsNotEmpty()
  @IsDateString()
  checkInTime!: string;

  @ApiPropertyOptional({
    example: '2026-10-09T12:30:00.000Z',
    description: 'Check-out UTC timestamp',
  })
  @IsOptional()
  @IsDateString()
  checkOutTime?: string;

  @ApiPropertyOptional({ example: 45, default: 0 })
  @IsOptional()
  @IsNumber()
  totalBreakMinutes?: number;
}
