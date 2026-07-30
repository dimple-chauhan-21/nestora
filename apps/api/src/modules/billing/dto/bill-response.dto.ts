import { ApiProperty } from '@nestjs/swagger';
import type { BillStatus } from '../../../database/entities/bill.entity';

/** Money stays a string end-to-end (§0's "never FLOAT for money") — the client displays it, never does arithmetic on it. */
export class BillResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  flatId!: string;

  @ApiProperty()
  billingPeriod!: string;

  @ApiProperty()
  amountDue!: string;

  @ApiProperty()
  amountPaid!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  dueDate!: string;

  @ApiProperty({ enum: ['unpaid', 'partial', 'paid', 'overdue'] })
  status!: BillStatus;

  @ApiProperty()
  lateFeeApplied!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
