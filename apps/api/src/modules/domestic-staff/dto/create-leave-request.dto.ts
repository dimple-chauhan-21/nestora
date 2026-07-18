import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsUUID()
  staffId!: string;

  @IsUUID()
  flatId!: string;

  @IsISO8601({ strict: true })
  dateFrom!: string;

  @IsISO8601({ strict: true })
  dateTo!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
