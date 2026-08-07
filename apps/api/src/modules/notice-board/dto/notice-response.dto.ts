import { ApiProperty } from '@nestjs/swagger';

export class NoticeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: String, nullable: true })
  category!: string | null;

  @ApiProperty({ type: Boolean })
  isPinned!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;

  /** How many users the target-audience resolution matched at publish time (deliverable #7's snapshot) — a quick "did this actually reach anyone" signal without exposing the raw recipient ID list. */
  @ApiProperty()
  recipientCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  /** Whether the *calling* user has read this notice — never another user's read status. */
  @ApiProperty({ type: Boolean })
  isRead!: boolean;
}
