import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @IsOptional()
  @IsIn(['handed_over', 'returned'])
  status?: 'handed_over' | 'returned';

  /** Resident absent right now — held at the security desk; status stays 'pending'. Independent of `status` above (both may be omitted/present in the same request). */
  @IsOptional()
  @IsBoolean()
  heldAtDesk?: boolean;

  /** Required when marking handed_over without a prior successful OTP verification — elderly/no-smartphone residents, per §6. */
  @IsOptional()
  @IsString()
  overrideReason?: string;
}
