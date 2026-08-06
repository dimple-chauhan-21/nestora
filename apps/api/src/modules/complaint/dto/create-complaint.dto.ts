import { IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ComplaintPriority } from '../../../database/entities/complaint.entity';

const PRIORITIES: ComplaintPriority[] = ['low', 'medium', 'high', 'urgent'];
const ATTACHMENT_TYPES = ['image', 'video'] as const;

class CreateComplaintAttachmentDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  fileUrl!: string;

  @ApiProperty({ enum: ATTACHMENT_TYPES })
  @IsIn(ATTACHMENT_TYPES)
  type!: 'image' | 'video';
}

export class CreateComplaintDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  flatId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ enum: PRIORITIES })
  @IsIn(PRIORITIES)
  priority!: ComplaintPriority;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ type: [CreateComplaintAttachmentDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateComplaintAttachmentDto)
  attachments?: CreateComplaintAttachmentDto[];
}
