import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class PasswordForgotDto {
  @ApiProperty({ example: '+919876543210', description: 'E.164 +91 phone number' })
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone!: string;
}
