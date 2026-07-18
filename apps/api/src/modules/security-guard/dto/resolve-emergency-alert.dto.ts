import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResolveEmergencyAlertDto {
  /** Required — an alert cannot be dismissed without one, enforced here AND by a DB CHECK constraint. */
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  resolutionNote!: string;
}
