import { IsUUID } from 'class-validator';

export class CheckOutDto {
  @IsUUID()
  staffId!: string;

  @IsUUID()
  flatId!: string;
}
