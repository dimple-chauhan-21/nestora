import { ApiProperty } from '@nestjs/swagger';

/** Only ever a boolean — never the code, never why it failed (§6: "guard sees verified/not-verified boolean, not the code"). */
export class VerifyDeliveryOtpResponseDto {
  @ApiProperty()
  verified!: boolean;
}
