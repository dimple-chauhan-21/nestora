import { IsUUID } from 'class-validator';

export class CallResidentDto {
  @IsUUID()
  flatId!: string;
}
