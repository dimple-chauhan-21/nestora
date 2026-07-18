import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMaintenanceLogDto {
  @IsDateString()
  serviceDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
