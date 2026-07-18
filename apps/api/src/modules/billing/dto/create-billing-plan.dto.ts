import { IsIn, IsInt, IsNumber, IsUUID, Min } from 'class-validator';

export class CreateBillingPlanDto {
  @IsUUID()
  societyId!: string;

  @IsIn(['flat_rate', 'per_sqft', 'per_head'])
  formulaType!: 'flat_rate' | 'per_sqft' | 'per_head';

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsNumber()
  @Min(0)
  lateFeePct!: number;

  @IsInt()
  @Min(0)
  gracePeriodDays!: number;
}
