import { IsString, Matches, MinLength } from 'class-validator';

export class PasswordResetDto {
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone!: string;

  @IsString()
  @MinLength(6)
  otp!: string;

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[0-9])(?=.*[^A-Za-z0-9])/, {
    message: 'password must contain at least 1 number and 1 symbol',
  })
  newPassword!: string;
}
