import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ComponentType, ComponentCalculationType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateSalaryComponentDto {
  @ApiProperty({
    description: 'Unique component code (e.g., BASIC, HRA, SPECIAL_ALLOWANCE, PF_EMPLOYEE)',
    example: 'BASIC',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_]{2,30}$/, {
    message: 'Code must be 2-30 uppercase alphanumeric characters or underscores',
  })
  code: string;

  @ApiProperty({ description: 'Display name', example: 'Basic Salary' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Detailed description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['EARNING', 'DEDUCTION'], description: 'Component classification' })
  @IsEnum(['EARNING', 'DEDUCTION'])
  type: ComponentType;

  @ApiProperty({
    enum: ['FLAT_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'FORMULA'],
    description: 'Default calculation method',
  })
  @IsEnum(['FLAT_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'FORMULA'])
  calculationType: ComponentCalculationType;

  @ApiPropertyOptional({
    description: 'Formula if calculationType is FORMULA (e.g. "0.50 * BASIC" or "GROSS - BASIC")',
    example: '0.50 * BASIC',
  })
  @IsOptional()
  @IsString()
  formula?: string;

  @ApiPropertyOptional({ description: 'Whether subject to tax calculations', default: true })
  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean = true;

  @ApiPropertyOptional({ description: 'Whether statutory component (PF, ESI, PT)', default: false })
  @IsOptional()
  @IsBoolean()
  isStatutory?: boolean = false;

  @ApiPropertyOptional({
    description: 'Whether affected by attendance and LOP days',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isProRataApplicable?: boolean = true;

  @ApiPropertyOptional({ description: 'Whether alters net salary payable', default: true })
  @IsOptional()
  @IsBoolean()
  affectsNetSalary?: boolean = true;

  @ApiPropertyOptional({ description: 'Ordering position in payslips and structures', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;
}

export class UpdateSalaryComponentDto {
  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Detailed description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: ['FLAT_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'FORMULA'],
  })
  @IsOptional()
  @IsEnum(['FLAT_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GRORA', 'FORMULA'] as any)
  calculationType?: ComponentCalculationType;

  @ApiPropertyOptional({ description: 'Formula expression' })
  @IsOptional()
  @IsString()
  formula?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isStatutory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isProRataApplicable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  affectsNetSalary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QuerySalaryComponentDto {
  @ApiPropertyOptional({ description: 'Search by code or name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['ALL', 'EARNING', 'DEDUCTION'], default: 'ALL' })
  @IsOptional()
  @IsEnum(['ALL', 'EARNING', 'DEDUCTION'])
  type?: 'ALL' | 'EARNING' | 'DEDUCTION' = 'ALL';

  @ApiPropertyOptional({ enum: ['ALL', 'ACTIVE', 'INACTIVE'], default: 'ALL' })
  @IsOptional()
  @IsEnum(['ALL', 'ACTIVE', 'INACTIVE'])
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}
