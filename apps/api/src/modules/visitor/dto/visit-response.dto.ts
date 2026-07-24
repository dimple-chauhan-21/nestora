import { ApiProperty } from '@nestjs/swagger';
import type { VisitStatus, VisitType } from '../../../database/entities/visitor-visit.entity';

class VisitVisitorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;
}

export class VisitResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  flatId!: string;

  @ApiProperty({ type: VisitVisitorDto })
  visitor!: VisitVisitorDto;

  @ApiProperty({ enum: ['walk_in', 'pre_approved', 'recurring'] })
  visitType!: VisitType;

  @ApiProperty({ type: String, nullable: true })
  purpose!: string | null;

  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'checked_in', 'checked_out', 'expired'] })
  status!: VisitStatus;

  @ApiProperty({ type: String, nullable: true })
  qrCode!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validFrom!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validTo!: string | null;

  @ApiProperty({ type: String, nullable: true })
  approvedBy!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  approvedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
