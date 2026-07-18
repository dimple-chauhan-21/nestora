import { IsString, IsUUID, Length, Matches } from 'class-validator';

/**
 * Reuses Module 1's OTP mechanism (the "lightweight session" the SRS asks
 * for is OTP itself — already the platform's primary login path — not a
 * second PIN/biometric scheme). `gateId` is the explicit gate-switch: this
 * kiosk is physically at a specific gate, so logging in here rebinds the
 * guard's active gate.
 */
export class GuardLoginDto {
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;

  @IsString()
  deviceId!: string;

  @IsUUID()
  gateId!: string;
}
