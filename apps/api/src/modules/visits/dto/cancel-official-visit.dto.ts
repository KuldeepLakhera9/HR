import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelOfficialVisitDto {
  @ApiProperty({
    description: 'Documented business reason for cancelling the official visit',
    example: 'Client cancelled scheduled review meeting due to unforeseen incident.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Cancellation reason must be at least 3 characters long' })
  @MaxLength(500, { message: 'Cancellation reason cannot exceed 500 characters' })
  cancellationReason: string;
}
