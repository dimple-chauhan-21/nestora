import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { ComplaintStatus } from '../../../database/entities/complaint.entity';

const STATUSES: ComplaintStatus[] = ['open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed'];

export class UpdateComplaintStatusDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status!: ComplaintStatus;
}
