import { Matches } from 'class-validator';

export class PasswordForgotDto {
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone!: string;
}
