import { ApiProperty } from '@nestjs/swagger';

/** Minimal shape for a flat-lookup autocomplete (e.g. the guard-kiosk's manual visitor entry) — not the full Flat record. */
export class FlatSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  flatNumber!: string;

  @ApiProperty({ type: Number, nullable: true })
  floorNumber!: number | null;

  @ApiProperty()
  status!: string;
}
