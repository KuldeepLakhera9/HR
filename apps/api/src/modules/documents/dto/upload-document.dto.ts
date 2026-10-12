import { IsNotEmpty, IsString, IsOptional, IsIn, MaxLength, IsISO8601 } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ALLOWED_DOCUMENT_CATEGORIES = [
  'GOVT_ID',
  'ACADEMIC',
  'EXPERIENCE',
  'ADDRESS_PROOF',
  'CERTIFICATION',
  'TAX',
  'POLICY',
  'OTHER',
] as const;

export class UploadEmployeeDocumentDto {
  @ApiProperty({
    enum: ALLOWED_DOCUMENT_CATEGORIES,
    description: 'Document category classification',
    example: 'GOVT_ID',
  })
  @IsNotEmpty({ message: 'Document category is required' })
  @IsString()
  @IsIn(ALLOWED_DOCUMENT_CATEGORIES, {
    message:
      'Invalid document category. Allowed: GOVT_ID, ACADEMIC, EXPERIENCE, ADDRESS_PROOF, CERTIFICATION, TAX, POLICY, OTHER',
  })
  documentType: string;

  @ApiProperty({
    description: 'Descriptive title for the document',
    example: 'Aadhaar Card / National ID',
    maxLength: 150,
  })
  @IsNotEmpty({ message: 'Document title/name is required' })
  @IsString()
  @MaxLength(150, { message: 'Document title cannot exceed 150 characters' })
  documentName: string;

  @ApiPropertyOptional({
    description: 'Document reference or identification number',
    example: 'XXXX-XXXX-1234',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Document number cannot exceed 100 characters' })
  documentNumber?: string;

  @ApiPropertyOptional({
    description: 'Issue date in ISO8601 format (YYYY-MM-DD)',
    example: '2024-01-15',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'Issue date must be a valid ISO8601 date string' })
  issueDate?: string;

  @ApiPropertyOptional({
    description: 'Expiry date in ISO8601 format (YYYY-MM-DD)',
    example: '2034-01-14',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'Expiry date must be a valid ISO8601 date string' })
  expiryDate?: string;
}
