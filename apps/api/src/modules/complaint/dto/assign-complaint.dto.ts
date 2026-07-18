import { IsUUID } from 'class-validator';

export class AssignComplaintDto {
  @IsUUID()
  assignedTo!: string;
}
