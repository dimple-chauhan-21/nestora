import { IsIn } from 'class-validator';
import type { PoliceVerificationStatus } from '../../../database/entities/domestic-staff.entity';

export class SetPoliceVerificationStatusDto {
  @IsIn(['verified', 'rejected'] satisfies PoliceVerificationStatus[])
  status!: 'verified' | 'rejected';
}
