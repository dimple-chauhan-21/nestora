import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsNumber, Max, Min } from 'class-validator';

export class UpdateSocietySettingsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 28, description: 'Day of month bills are generated on' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  billingCycleDay?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Late fee percentage applied to overdue bills' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lateFeePct?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, description: '1 = January' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  featureFlags?: Record<string, unknown>;
}
