import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ReassignManagerDto {
  @IsUUID()
  @IsNotEmpty()
  newManagerId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ExemptParticipantDto {
  @IsString()
  @IsNotEmpty()
  exemptionReason!: string;
}
