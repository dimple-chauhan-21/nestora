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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class TargetAudienceDto {
  @ApiProperty({ enum: ['all', 'tower_ids', 'role'] })
  @IsIn(['all', 'tower_ids', 'role'])
  type!: 'all' | 'tower_ids' | 'role';

  @ApiPropertyOptional({ type: [String], description: 'Required when type is "tower_ids"' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  towerIds?: string[];

  @ApiPropertyOptional({ description: 'Role code — required when type is "role"' })
  @IsOptional()
  @IsString()
  role?: string;
}

export class CreateNoticeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiProperty()
  @IsString()
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiProperty({ type: TargetAudienceDto })
  @ValidateNested()
  @Type(() => TargetAudienceDto)
  targetAudience!: TargetAudienceDto;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  attachmentUrls?: string[];
}
