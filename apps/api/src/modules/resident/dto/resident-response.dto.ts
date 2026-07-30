import { ApiProperty } from '@nestjs/swagger';

class ResidentUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;
}

class ResidentFlatDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  flatNumber!: string;
}

/** No "name" field exists anywhere in this system yet — `users` only carries phone/email (§1's own schema), so a resident is identified by phone here, same as every other screen (e.g. the dashboard's "Logged in as {phone}"). */
export class ResidentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: ResidentFlatDto })
  flat!: ResidentFlatDto;

  /** Null for a resident row with no linked user yet — §3's own edge case ("family member without a personal phone"). */
  @ApiProperty({ type: ResidentUserDto, nullable: true })
  user!: ResidentUserDto | null;

  @ApiProperty({ enum: ['owner', 'tenant', 'family'] })
  relationType!: 'owner' | 'tenant' | 'family';

  @ApiProperty()
  isSeniorCitizen!: boolean;

  @ApiProperty()
  isChild!: boolean;

  @ApiProperty({ type: String, nullable: true })
  moveInDate!: string | null;

  @ApiProperty({ type: String, nullable: true })
  moveOutDate!: string | null;

  @ApiProperty({ enum: ['active', 'suspended', 'moved_out'] })
  status!: 'active' | 'suspended' | 'moved_out';

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
