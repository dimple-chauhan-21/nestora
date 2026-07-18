import { IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateGuestInviteDto {
  @IsUUID()
  flatId!: string;

  @IsString()
  @MaxLength(255)
  guestName!: string;

  @IsOptional()
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'guestPhone must be a valid E.164 +91 number' })
  guestPhone?: string;

  @IsISO8601()
  validFrom!: string;

  @IsISO8601()
  validTo!: string;

  /** rrule-format string; presence is what makes the resulting QR multi-use instead of single-use. */
  @IsOptional()
  @IsString()
  recurrenceRule?: string;
}
