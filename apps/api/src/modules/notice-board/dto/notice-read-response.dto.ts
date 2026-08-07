import { ApiProperty } from '@nestjs/swagger';

export class NoticeReadResponseDto {
  @ApiProperty()
  noticeId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  readAt!: string;
}
