import { ApiProperty } from '@nestjs/swagger';

/** §2's `society_settings` table — a separate resource from the society profile, one row per society, created alongside it. */
export class SocietySettingsResponseDto {
  @ApiProperty()
  societyId!: string;

  @ApiProperty()
  billingCycleDay!: number;

  /** Stored numeric(5,2) as a string server-side — surfaced as a number here since the UI only ever needs to display/edit it, never round-trip the exact decimal representation. */
  @ApiProperty({ type: Number })
  lateFeePct!: number;

  @ApiProperty()
  fiscalYearStartMonth!: number;

  @ApiProperty({ type: Object })
  featureFlags!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
