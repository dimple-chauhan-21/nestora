import { IsUrl } from 'class-validator';

export class SetPoliceVerificationDocumentDto {
  @IsUrl({ require_tld: false })
  fileUrl!: string;
}
