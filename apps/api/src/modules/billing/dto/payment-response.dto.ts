import { ApiProperty } from '@nestjs/swagger';
import type { PaymentMethod, PaymentStatus } from '../../../database/entities/payment.entity';

export class PaymentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  billId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: ['online', 'cash', 'cheque', 'bank_transfer'] })
  method!: PaymentMethod;

  @ApiProperty({ enum: ['pending', 'success', 'failed', 'refunded'] })
  status!: PaymentStatus;

  @ApiProperty()
  reconciled!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: string | null;

  /**
   * Null until a Receipt row actually exists for this payment (created only
   * once a payment reaches `success` — see PaymentService/WebhookService).
   * No PDF is ever generated (`receipts.pdf_url` is always null in this
   * codebase) — this is the receipt *number* only, never a download link.
   */
  @ApiProperty({ type: String, nullable: true })
  receiptNumber!: string | null;
}
