import { IsIn, IsUrl } from 'class-validator';

export class CreateResidentDocumentDto {
  @IsIn(['id_proof', 'agreement', 'photo'])
  docType!: 'id_proof' | 'agreement' | 'photo';

  @IsUrl({ require_tld: false })
  fileUrl!: string;
}
