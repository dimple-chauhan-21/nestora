import { IsBoolean, IsIn, IsISO8601, IsNumber, IsOptional, Matches, Min, ValidateIf } from 'class-validator';

export class CreateResidentDto {
  /** Optional per SRS Module 1/3 edge cases (guardian-managed sub-profiles without a personal phone). Required in practice for owner/tenant invites. */
  @IsOptional()
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone?: string;

  @IsIn(['owner', 'tenant', 'family'])
  relationType!: 'owner' | 'tenant' | 'family';

  @IsOptional()
  @IsBoolean()
  isSeniorCitizen?: boolean;

  @IsOptional()
  @IsBoolean()
  isChild?: boolean;

  @IsOptional()
  @IsISO8601({ strict: true })
  moveInDate?: string;

  // Access delegation (§5.4): required when inviting a tenant.
  @ValidateIf((o) => o.relationType === 'tenant')
  @IsISO8601({ strict: true })
  leaseStart?: string;

  @ValidateIf((o) => o.relationType === 'tenant')
  @IsISO8601({ strict: true })
  leaseEnd?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyRent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;
}
