import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class CreateAllocationDto {
  @IsUUID()
  slotId!: string;

  @IsUUID()
  flatId!: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  allocatedFrom?: string;
}
