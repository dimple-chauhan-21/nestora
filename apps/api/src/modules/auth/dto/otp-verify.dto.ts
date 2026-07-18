import { IsString, Length, Matches } from 'class-validator';

export class OtpVerifyDto {
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;

  @IsString()
  deviceId!: string;
}
