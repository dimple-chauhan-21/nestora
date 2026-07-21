import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class OtpVerifyDto {
  @ApiProperty({ example: '+919876543210', description: 'E.164 +91 phone number' })
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone!: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  otp!: string;

  @ApiProperty({ description: 'Client-generated device identifier, stable per install' })
  @IsString()
  deviceId!: string;
}
