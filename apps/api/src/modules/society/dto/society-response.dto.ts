import { ApiProperty } from '@nestjs/swagger';

/** Society profile — §2's `societies` table. Never includes settings (a separate resource, see SocietySettingsResponseDto). */
export class SocietyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({ type: String, nullable: true })
  city!: string | null;

  @ApiProperty({ type: String, nullable: true })
  state!: string | null;

  @ApiProperty({ type: String, nullable: true })
  pincode!: string | null;

  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: String, nullable: true })
  registrationNumber!: string | null;
}
