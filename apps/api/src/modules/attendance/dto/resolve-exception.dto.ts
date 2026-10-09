import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResolveExceptionDto {
  @ApiProperty({
    description: 'Target resolution status',
    enum: ['RESOLVED', 'DISMISSED'],
    example: 'RESOLVED',
  })
  @IsIn(['RESOLVED', 'DISMISSED'])
  status: 'RESOLVED' | 'DISMISSED';

  @ApiProperty({
    description: 'Detailed resolution or dismissal notes for HR audit trail',
    example: 'Verified employee was on approved client visit; waived geofence alert.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Resolution notes must be at least 3 characters long' })
  resolutionNotes: string;
}
