import { ApiProperty } from '@nestjs/swagger';
import { ResidentResponseDto } from './resident-response.dto';

class ResidentPaginationMetaDto {
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;

  @ApiProperty()
  hasMore!: boolean;
}

export class PaginatedResidentResponseDto {
  @ApiProperty({ type: [ResidentResponseDto] })
  data!: ResidentResponseDto[];

  @ApiProperty({ type: ResidentPaginationMetaDto })
  pagination!: ResidentPaginationMetaDto;
}
