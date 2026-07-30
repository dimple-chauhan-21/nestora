import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignComplaintDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assignedTo!: string;
}
