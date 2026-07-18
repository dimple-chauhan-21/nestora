import { IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { ComplaintPriority } from '../../../database/entities/complaint.entity';

const PRIORITIES: ComplaintPriority[] = ['low', 'medium', 'high', 'urgent'];
const ATTACHMENT_TYPES = ['image', 'video'] as const;

class CreateComplaintAttachmentDto {
  @IsUrl({ require_tld: false })
  fileUrl!: string;

  @IsIn(ATTACHMENT_TYPES)
  type!: 'image' | 'video';
}

export class CreateComplaintDto {
  @IsUUID()
  flatId!: string;

  @IsUUID()
  categoryId!: string;

  @IsIn(PRIORITIES)
  priority!: ComplaintPriority;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateComplaintAttachmentDto)
  attachments?: CreateComplaintAttachmentDto[];
}
