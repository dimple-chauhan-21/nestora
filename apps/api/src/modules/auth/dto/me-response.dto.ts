import { ApiProperty } from '@nestjs/swagger';

class MeUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty()
  status!: string;
}

export class MeResponseDto {
  @ApiProperty({ type: MeUserDto })
  user!: MeUserDto;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty({ type: String, nullable: true, description: 'Set for a flat-pinned role (Owner/Tenant); null for a society-wide role.' })
  flatId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  societyId!: string | null;
}
