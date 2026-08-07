import { ApiProperty } from '@nestjs/swagger';

/** notice-board:manage only — read report is an authoring/admin surface, not resident-facing, so raw reader user IDs are fine here (same posture as assignable-staff). */
export class NoticeReadReportResponseDto {
  @ApiProperty()
  totalRecipients!: number;

  @ApiProperty()
  readCount!: number;

  @ApiProperty({ type: [String] })
  readUserIds!: string[];
}
