import { ApiProperty } from '@nestjs/swagger';

export class EmergencyAlertResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['fire', 'medical', 'security', 'other'] })
  type!: 'fire' | 'medical' | 'security' | 'other';

  @ApiProperty({ enum: ['active', 'resolved'] })
  status!: 'active' | 'resolved';

  @ApiProperty({ type: String, nullable: true })
  resolutionNote!: string | null;

  @ApiProperty({ type: String, nullable: true })
  resolvedAt!: string | null;

  /** Whether the CURRENT requester (guard) is the one who raised it — avoids a name-resolution join for what's currently a same-guard-facing screen; the raw raisedBy user id is never sent. */
  @ApiProperty()
  raisedByMe!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
