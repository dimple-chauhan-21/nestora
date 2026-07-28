import { ApiProperty } from '@nestjs/swagger';

class GuardIdentityDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  gateId!: string;

  /** Null only if the gate was deleted between assignment and this response — never expected in practice. */
  @ApiProperty({ type: String, nullable: true })
  gateName!: string | null;

  @ApiProperty()
  societyId!: string;
}

export class GuardLoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresIn!: number;

  @ApiProperty({ type: GuardIdentityDto })
  guard!: GuardIdentityDto;
}
