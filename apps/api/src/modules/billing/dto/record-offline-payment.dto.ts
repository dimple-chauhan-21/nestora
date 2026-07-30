import { IsIn, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordOfflinePaymentDto {
  @ApiProperty({ enum: ['cash', 'cheque', 'bank_transfer'] })
  @IsIn(['cash', 'cheque', 'bank_transfer'])
  method!: 'cash' | 'cheque' | 'bank_transfer';

  @ApiProperty({ minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  amount!: number;
}
