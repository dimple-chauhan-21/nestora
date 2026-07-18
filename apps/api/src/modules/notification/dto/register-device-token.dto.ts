import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { DevicePlatform } from '../../../database/entities/device-token.entity';

const PLATFORMS: Exclude<DevicePlatform, 'unknown'>[] = ['ios', 'android', 'web'];

export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: 'ios' | 'android' | 'web';
}
