import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateComplaintCategoryDto {
  @IsOptional()
  @IsUUID()
  societyId?: string;

  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  defaultSlaHours!: number;

  @IsOptional()
  @IsString()
  defaultAssigneeRole?: string;
}
