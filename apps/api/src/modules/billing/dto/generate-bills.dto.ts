import { IsISO8601, IsUUID } from 'class-validator';

export class GenerateBillsDto {
  @IsUUID()
  societyId!: string;

  /** First of the billing month, e.g. "2026-07-01". */
  @IsISO8601({ strict: true })
  billingPeriod!: string;
}
