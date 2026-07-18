import { IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateSocietyDocumentDto {
  @IsString()
  @MaxLength(50)
  docType!: string;

  @IsUrl({ require_tld: false })
  fileUrl!: string;
}
