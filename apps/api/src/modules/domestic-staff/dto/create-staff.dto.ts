import { IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import type { StaffType } from '../../../database/entities/domestic-staff.entity';

const STAFF_TYPES: StaffType[] = ['maid', 'driver', 'cook', 'cleaner', 'caretaker'];

export class CreateStaffDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone!: string;

  @IsIn(STAFF_TYPES)
  staffType!: StaffType;

  @IsOptional()
  @IsUrl({ require_tld: false })
  photoUrl?: string;
}
