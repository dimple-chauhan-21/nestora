import { IsInt, IsOptional, IsNumber, Max, Min } from 'class-validator';

export class UpdateSocietySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  billingCycleDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lateFeePct?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @IsOptional()
  featureFlags?: Record<string, unknown>;
}
