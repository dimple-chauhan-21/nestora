import { ApiProperty } from '@nestjs/swagger';

export class ComplaintCategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  defaultSlaHours!: number;
}
