import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelWfhRequestDto {
  @ApiProperty({
    description: 'Documented business or personal justification for cancelling the WFH request',
    example: 'Client requested in-person attendance at headquarters office.',
    minLength: 3,
    maxLength: 500,
  })
  @IsNotEmpty({ message: 'cancellationReason is required' })
  @IsString({ message: 'cancellationReason must be a string' })
  @MinLength(3, { message: 'cancellationReason must be at least 3 characters long' })
  @MaxLength(500, { message: 'cancellationReason cannot exceed 500 characters' })
  cancellationReason: string;
}
