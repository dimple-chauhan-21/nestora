import { ApiProperty } from '@nestjs/swagger';
import { VisitResponseDto } from './visit-response.dto';

class VisitPaginationMetaDto {
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;

  @ApiProperty()
  hasMore!: boolean;
}

export class PaginatedVisitResponseDto {
  @ApiProperty({ type: [VisitResponseDto] })
  data!: VisitResponseDto[];

  @ApiProperty({ type: VisitPaginationMetaDto })
  pagination!: VisitPaginationMetaDto;
}
