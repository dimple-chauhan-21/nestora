import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class TargetAudienceDto {
  @IsIn(['all', 'tower_ids', 'role'])
  type!: 'all' | 'tower_ids' | 'role';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  towerIds?: string[];

  @IsOptional()
  @IsString()
  role?: string;
}

export class CreateNoticeDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ValidateNested()
  @Type(() => TargetAudienceDto)
  targetAudience!: TargetAudienceDto;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  attachmentUrls?: string[];
}
