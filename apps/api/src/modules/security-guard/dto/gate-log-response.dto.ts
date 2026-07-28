import { ApiProperty } from '@nestjs/swagger';

export class GateLogResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  gateId!: string;

  @ApiProperty()
  guardId!: string;

  @ApiProperty({ enum: ['visitor', 'delivery', 'staff', 'vehicle'] })
  entityType!: 'visitor' | 'delivery' | 'staff' | 'vehicle';

  @ApiProperty({ type: String, nullable: true })
  visitorVisitId!: string | null;

  @ApiProperty({ enum: ['in', 'out'] })
  direction!: 'in' | 'out';

  @ApiProperty({ enum: ['qr', 'manual', 'facial'] })
  method!: 'qr' | 'manual' | 'facial';

  @ApiProperty({ type: String, nullable: true })
  overrideReason!: string | null;

  @ApiProperty()
  idempotencyKey!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt!: string;
}
