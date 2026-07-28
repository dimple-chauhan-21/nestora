import { ApiProperty } from '@nestjs/swagger';

class DeliveryFlatDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  flatNumber!: string;
}

class DeliveryAgentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  platform!: string | null;
}

/**
 * Never includes otpHash/otpExpiresAt/otpAttempts — those must never leave
 * the service, not even to the guard who logged the delivery (§6: "guard
 * sees verified/not-verified boolean, not the code").
 */
export class DeliveryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: DeliveryFlatDto })
  flat!: DeliveryFlatDto;

  @ApiProperty({ type: DeliveryAgentDto })
  agent!: DeliveryAgentDto;

  @ApiProperty()
  gateId!: string;

  @ApiProperty({ type: String, nullable: true })
  parcelPhotoUrl!: string | null;

  @ApiProperty({ enum: ['pending', 'handed_over', 'returned'] })
  status!: string;

  @ApiProperty()
  otpVerified!: boolean;

  @ApiProperty()
  heldAtDesk!: boolean;

  @ApiProperty({ type: String, nullable: true })
  handoverOverrideReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
