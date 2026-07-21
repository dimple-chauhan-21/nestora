import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';

export class OtpRequestDto {
  @ApiProperty({ example: '+919876543210', description: 'E.164 +91 phone number' })
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone!: string;

  @ApiPropertyOptional({ enum: ['login', 'signup', 'reset'], default: 'login' })
  @IsOptional()
  @IsIn(['login', 'signup', 'reset'])
  purpose?: 'login' | 'signup' | 'reset';
}
