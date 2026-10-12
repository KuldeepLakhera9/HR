import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EmergencyContactChangeDto {
  @ApiProperty({ example: 'Rohit Sharma' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Spouse' })
  @IsNotEmpty()
  @IsString()
  relationship!: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @IsNotEmpty()
  @IsString()
  phone!: string;

  @ApiPropertyOptional({ example: '+91 98765 43211' })
  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @ApiPropertyOptional({ example: '123 Palm Grove, Indiranagar' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateProfileChangeRequestDto {
  @ApiPropertyOptional({ example: 'priya.personal@gmail.com' })
  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '+91 98765 43211' })
  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @ApiPropertyOptional({ example: '42 Orchid Towers, 5th Main' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Bengaluru' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Karnataka' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '560038' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ type: [EmergencyContactChangeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactChangeDto)
  emergencyContacts?: EmergencyContactChangeDto[];

  @ApiPropertyOptional({ example: 'Moved to a new apartment in Indiranagar' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export enum ProfileChangeReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ReviewProfileChangeRequestDto {
  @ApiProperty({ enum: ProfileChangeReviewDecision, example: ProfileChangeReviewDecision.APPROVED })
  @IsNotEmpty()
  @IsEnum(ProfileChangeReviewDecision)
  decision!: ProfileChangeReviewDecision;

  @ApiPropertyOptional({ example: 'Verified address proof and updated records' })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class QueryProfileChangeRequestsDto {
  @ApiPropertyOptional({ enum: ['ALL', 'PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' })
  @IsOptional()
  @IsString()
  status?: string = 'PENDING';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
