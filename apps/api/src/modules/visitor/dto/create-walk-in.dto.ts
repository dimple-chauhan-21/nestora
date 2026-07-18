import { IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateWalkInDto {
  @IsUUID()
  flatId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'phone must be a valid E.164 +91 number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  purpose?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  idProofType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idProofNumber?: string;
}
