import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class PasswordResetDto {
  @ApiProperty({ example: '+919876543210', description: 'E.164 +91 phone number' })
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  otp!: string;

  @ApiProperty({ minLength: 8, description: 'Must contain at least 1 number and 1 symbol' })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[0-9])(?=.*[^A-Za-z0-9])/, {
    message: 'password must contain at least 1 number and 1 symbol',
  })
  newPassword!: string;
}
