import { ApiProperty } from '@nestjs/swagger';

class OutstandingAgingDto {
  @ApiProperty()
  days0To30!: string;

  @ApiProperty()
  days30To60!: string;

  @ApiProperty()
  days60Plus!: string;
}

export class FinancialSummaryResponseDto {
  @ApiProperty()
  societyId!: string;

  @ApiProperty()
  totalBilled!: string;

  @ApiProperty()
  totalCollected!: string;

  @ApiProperty()
  collectionEfficiencyPct!: string;

  @ApiProperty({ type: OutstandingAgingDto })
  outstandingAging!: OutstandingAgingDto;
}
