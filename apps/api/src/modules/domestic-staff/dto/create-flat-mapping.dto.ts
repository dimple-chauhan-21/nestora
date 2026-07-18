import { IsNumber, IsObject, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateFlatMappingDto {
  @IsUUID()
  flatId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlySalary?: number;

  @IsOptional()
  @IsObject()
  workDays?: Record<string, unknown>;
}
