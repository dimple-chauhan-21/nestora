import { ApiProperty } from '@nestjs/swagger';

export class CallResidentResponseDto {
  @ApiProperty()
  called!: boolean;

  @ApiProperty({ type: String, nullable: true })
  recipientUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  at!: string;
}
