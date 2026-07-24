import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { VisitStatus } from '../../../database/entities/visitor-visit.entity';

const VISIT_STATUSES: VisitStatus[] = [
  'pending',
  'approved',
  'rejected',
  'checked_in',
  'checked_out',
  'expired',
];

export class VisitHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page\'s pagination.nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: VISIT_STATUSES, description: 'Allow-listed filter, e.g. status=pending for a resident\'s approval queue.' })
  @IsOptional()
  @IsIn(VISIT_STATUSES)
  status?: VisitStatus;
}
