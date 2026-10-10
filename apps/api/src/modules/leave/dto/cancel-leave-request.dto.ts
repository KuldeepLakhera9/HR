import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelLeaveRequestDto {
  @ApiProperty({
    description: 'Mandatory reason for cancelling the leave request',
    example: 'Client meeting scheduled; postponement requested',
    minLength: 3,
    maxLength: 500,
  })
  @IsNotEmpty({ message: 'cancellationReason is required' })
  @IsString({ message: 'cancellationReason must be a string' })
  @MinLength(3, { message: 'cancellationReason must be at least 3 characters long' })
  @MaxLength(500, { message: 'cancellationReason cannot exceed 500 characters' })
  cancellationReason: string;
}
