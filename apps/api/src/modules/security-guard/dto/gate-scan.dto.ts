import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class GateScanDto {
  @IsString()
  token!: string;

  @IsIn(['in', 'out'])
  direction!: 'in' | 'out';

  @IsUUID()
  gateId!: string;

  /** Offline-sync replay only — omitted for a live scan. */
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;

  @IsOptional()
  occurredAtClientReported?: string;

  /** Visitor's vehicle needs a slot from the visitor pool (Module 10 §6) — only meaningful on a visitor_visit check-in. */
  @IsOptional()
  @IsBoolean()
  needsParking?: boolean;
}
