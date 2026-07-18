import { IsBoolean, IsOptional, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class MoveOutDto {
  @IsUUID()
  residentId!: string;

  @IsBoolean()
  duesCleared!: boolean;

  @IsOptional()
  checklist?: Record<string, unknown>;

  /** Required when dues_cleared=false and an admin wants to override the block (§3 validation rule). */
  @ValidateIf((o) => o.duesCleared === false && o.override === true)
  @MaxLength(500)
  overrideReason?: string;

  @IsOptional()
  @IsBoolean()
  override?: boolean;
}
