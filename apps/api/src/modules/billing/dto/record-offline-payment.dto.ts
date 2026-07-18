import { IsIn, IsNumber, Min } from 'class-validator';

export class RecordOfflinePaymentDto {
  @IsIn(['cash', 'cheque', 'bank_transfer'])
  method!: 'cash' | 'cheque' | 'bank_transfer';

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
