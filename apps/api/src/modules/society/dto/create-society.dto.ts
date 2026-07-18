import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateSocietyDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit Indian PIN code' })
  pincode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsIn(['INR'])
  currency?: string;
}
