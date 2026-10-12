import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { ComponentCalculationType } from '@prisma/client';
import { Type } from 'class-transformer';

export class SalaryStructureItemInputDto {
  @ApiProperty({ description: 'Referenced SalaryComponent ID' })
  @IsString()
  @IsNotEmpty()
  componentId: string;

  @ApiProperty({
    enum: ['FLAT_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'FORMULA'],
  })
  @IsEnum(['FLAT_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'FORMULA'])
  calculationType: ComponentCalculationType;

  @ApiProperty({
    description: 'Amount (e.g. 25000) or Percentage (e.g. 50.0 for 50%)',
    example: 50.0,
  })
  @IsNumber()
  amountOrPercentage: number;

  @ApiPropertyOptional({ description: 'Custom formula string if calculationType is FORMULA' })
  @IsOptional()
  @IsString()
  formula?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;
}

export class CreateSalaryStructureDto {
  @ApiProperty({ example: 'STANDARD_CORP_2026' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_]{3,40}$/, {
    message: 'Code must be 3-40 uppercase alphanumeric characters or underscores',
  })
  code: string;

  @ApiProperty({ example: 'Standard Corporate Salary Structure' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Default structure for full-time professional staff' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string = 'INR';

  @ApiPropertyOptional({ example: '2026-04-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ example: '2027-03-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiProperty({ type: [SalaryStructureItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryStructureItemInputDto)
  items: SalaryStructureItemInputDto[];
}

export class UpdateSalaryStructureDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [SalaryStructureItemInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryStructureItemInputDto)
  items?: SalaryStructureItemInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CloneSalaryStructureDto {
  @ApiPropertyOptional({
    description: 'Target code for clone. If omitted, increments version under same code.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]{3,40}$/)
  newCode?: string;

  @ApiPropertyOptional({ description: 'New name for cloned structure' })
  @IsOptional()
  @IsString()
  newName?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class PreviewSalaryStructureDto {
  @ApiProperty({ description: 'Sample CTC (Annual) to simulate', example: 1200000 })
  @IsNumber()
  @Min(1000)
  annualCtc: number;
}

export class QuerySalaryStructureDto {
  @ApiPropertyOptional({ description: 'Search by code or name' })
  @IsOptional()
  @IsString()
  search?: string;

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

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
