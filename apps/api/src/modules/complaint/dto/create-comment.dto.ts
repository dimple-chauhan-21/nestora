import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MaxLength(2000)
  body!: string;

  /**
   * Client-supplied, but only honored when the caller has a society-wide
   * scope — a flat-pinned caller's value is always overridden to `false`
   * server-side (see ComplaintService.addComment). Internal notes are
   * staff-only per §8's own column comment.
   */
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
