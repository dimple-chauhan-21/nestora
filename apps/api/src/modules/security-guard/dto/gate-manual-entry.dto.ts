import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class GateManualEntryDto {
  @IsUUID()
  gateId!: string;

  @IsIn(['visitor', 'delivery', 'staff', 'vehicle'])
  entityType!: 'visitor' | 'delivery' | 'staff' | 'vehicle';

  @IsIn(['in', 'out'])
  direction!: 'in' | 'out';

  @IsOptional()
  @IsUUID()
  flatId?: string;

  @IsString()
  @MaxLength(500)
  overrideReason!: string;

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;

  @IsOptional()
  occurredAtClientReported?: string;
}
