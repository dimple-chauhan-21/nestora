import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ParkingSlotType } from '../../../database/entities/parking-slot.entity';

const SLOT_TYPES: ParkingSlotType[] = ['covered', 'open', '2-wheeler', '4-wheeler'];

export class CreateParkingSlotDto {
  @IsString()
  @MaxLength(20)
  slotNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  zone?: string;

  @IsIn(SLOT_TYPES)
  type!: ParkingSlotType;

  @IsOptional()
  @IsBoolean()
  isVisitorPool?: boolean;
}
