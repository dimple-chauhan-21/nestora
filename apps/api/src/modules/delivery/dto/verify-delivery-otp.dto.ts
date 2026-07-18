import { Matches } from 'class-validator';

export class VerifyDeliveryOtpDto {
  /** 4-6 digits per §6's own validation rule. */
  @Matches(/^\d{4,6}$/, { message: 'otp must be 4-6 digits' })
  otp!: string;
}
