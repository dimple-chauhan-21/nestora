import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResidentListQueryDto {
  @ApiPropertyOptional({ description: 'Opaque keyset cursor from a previous page\'s pagination.nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ['senior_citizen'] })
  @IsOptional()
  @IsIn(['senior_citizen'])
  filter?: 'senior_citizen';

  /** Exact-match narrowing to one flat — used by the flat-detail view's "residents of this flat" case. */
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  flatId?: string;

  /** Free-text search against flat_number (ILIKE) — the admin console's "search by flat" box. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flatNumber?: string;
}
