import { IsIn, IsOptional, IsUrl, Matches } from 'class-validator';

export class CreateVehicleDto {
  @IsIn(['car', 'bike'])
  type!: 'car' | 'bike';

  @Matches(/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/, {
    message: 'registrationNumber must match Indian plate format, e.g. MH12AB1234',
  })
  registrationNumber!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  rcDocUrl?: string;
}
