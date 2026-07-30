import { ApiProperty } from '@nestjs/swagger';

class CommentAuthorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;
}

/** `isInternal` rows are already filtered out server-side for a flat-pinned caller (ComplaintService.listComments) — this DTO just surfaces the flag so the admin UI can visually distinguish staff-only notes, it's never the enforcement point itself. */
export class ComplaintCommentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: CommentAuthorDto, nullable: true })
  author!: CommentAuthorDto | null;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  isInternal!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
