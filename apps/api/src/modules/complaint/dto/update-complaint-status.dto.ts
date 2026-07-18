import { IsIn } from 'class-validator';
import type { ComplaintStatus } from '../../../database/entities/complaint.entity';

const STATUSES: ComplaintStatus[] = ['open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed'];

export class UpdateComplaintStatusDto {
  @IsIn(STATUSES)
  status!: ComplaintStatus;
}
