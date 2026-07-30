import { ApiProperty } from '@nestjs/swagger';

class FlatDetailUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;
}

class FlatDetailVehicleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['car', 'bike'] })
  type!: 'car' | 'bike';

  @ApiProperty()
  registrationNumber!: string;
}

class FlatDetailResidentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: FlatDetailUserDto, nullable: true })
  user!: FlatDetailUserDto | null;

  @ApiProperty({ enum: ['owner', 'tenant', 'family'] })
  relationType!: 'owner' | 'tenant' | 'family';

  @ApiProperty()
  isSeniorCitizen!: boolean;

  @ApiProperty()
  isChild!: boolean;

  @ApiProperty({ enum: ['active', 'suspended', 'moved_out'] })
  status!: 'active' | 'suspended' | 'moved_out';

  @ApiProperty({ type: [FlatDetailVehicleDto] })
  vehicles!: FlatDetailVehicleDto[];
}

class FlatDetailPetDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  species!: string;
}

/**
 * Deliverable #3's "one place" view: a flat plus its active residents (each
 * with their own vehicles) and the flat's pets. Pets are flat-scoped, not
 * resident-scoped, per §3's own DDL — listed once at the flat level rather
 * than duplicated under whichever resident happens to be first.
 */
export class FlatDetailResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  flatNumber!: string;

  @ApiProperty({ type: Number, nullable: true })
  floorNumber!: number | null;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [FlatDetailResidentDto] })
  residents!: FlatDetailResidentDto[];

  @ApiProperty({ type: [FlatDetailPetDto] })
  pets!: FlatDetailPetDto[];
}
