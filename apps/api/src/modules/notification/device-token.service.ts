import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DeviceToken } from '../../database/entities/device-token.entity';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@Injectable()
export class DeviceTokenService {
  constructor(@InjectRepository(DeviceToken) private readonly deviceTokens: Repository<DeviceToken>) {}

  /** Idempotent: re-registering the same (user, token) pair — app reinstall, token-refresh replay — returns the existing row, never a duplicate. */
  async register(userId: string, dto: RegisterDeviceTokenDto): Promise<DeviceToken> {
    const existing = await this.deviceTokens
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.token = :token', { token: dto.token })
      .andWhere('t.deleted_at IS NULL')
      .getOne();
    if (existing) return existing;

    const record = this.deviceTokens.create({
      userId,
      token: dto.token,
      platform: dto.platform ?? 'unknown',
    });
    try {
      return await this.deviceTokens.save(record);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const race = await this.deviceTokens
          .createQueryBuilder('t')
          .where('t.user_id = :userId', { userId })
          .andWhere('t.token = :token', { token: dto.token })
          .andWhere('t.deleted_at IS NULL')
          .getOne();
        if (race) return race;
      }
      throw err;
    }
  }
}
