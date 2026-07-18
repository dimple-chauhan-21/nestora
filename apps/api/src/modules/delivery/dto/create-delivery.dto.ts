import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateDeliveryDto {
  @IsUUID()
  flatId!: string;

  @IsUUID()
  gateId!: string;

  @Matches(/^\+91[6-9]\d{9}$/, { message: 'agentPhone must be a valid E.164 +91 number' })
  agentPhone!: string;

  @IsOptional()
  @IsString()
  agentName?: string;

  /** Free-text or picklist per §6 — e.g. "Amazon", "Swiggy", "Zomato", a local courier's name. */
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  parcelPhotoUrl?: string;

  /** Offline-sync replay only — omitted for a live scan, matches GateScanDto's own convention. */
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
