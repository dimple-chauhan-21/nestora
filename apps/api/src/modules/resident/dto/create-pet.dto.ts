import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreatePetDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(50)
  species!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  vaccinationDocUrl?: string;
}
