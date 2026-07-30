import { ApiProperty } from '@nestjs/swagger';
import type { ComplaintPriority, ComplaintStatus } from '../../../database/entities/complaint.entity';

class ComplaintFlatDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  flatNumber!: string;
}

class ComplaintCategoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

class ComplaintUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;
}

export class ComplaintResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: ComplaintFlatDto })
  flat!: ComplaintFlatDto;

  @ApiProperty({ type: ComplaintCategoryDto })
  category!: ComplaintCategoryDto;

  @ApiProperty({ type: ComplaintUserDto, nullable: true })
  raisedBy!: ComplaintUserDto | null;

  @ApiProperty({ type: ComplaintUserDto, nullable: true })
  assignedTo!: ComplaintUserDto | null;

  @ApiProperty({ enum: ['low', 'medium', 'high', 'urgent'] })
  priority!: ComplaintPriority;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: ['open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed'] })
  status!: ComplaintStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  slaDueAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  satisfactionRating!: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
