import { IsOptional, IsString, IsUUID, IsUrl } from 'class-validator';

export class CreateViolationDto {
  @IsOptional()
  @IsUUID()
  slotId?: string;

  @IsUrl({ require_tld: false })
  photoUrl!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
