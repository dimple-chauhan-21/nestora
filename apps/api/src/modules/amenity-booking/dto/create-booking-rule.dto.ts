import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateBookingRuleDto {
  @IsUUID()
  amenityId!: string;

  @IsInt()
  @Min(1)
  minDurationMins!: number;

  @IsInt()
  @Min(1)
  maxDurationMins!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  advanceBookingDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellationWindowHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;
}
