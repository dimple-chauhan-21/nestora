import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { VerificationMethod } from '../../../database/entities/staff-attendance.entity';

const VERIFICATION_METHODS: VerificationMethod[] = ['qr', 'manual', 'biometric', 'facial'];

export class CheckInDto {
  @IsUUID()
  staffId!: string;

  @IsUUID()
  flatId!: string;

  @IsOptional()
  @IsIn(VERIFICATION_METHODS)
  verificationMethod?: VerificationMethod;
}
