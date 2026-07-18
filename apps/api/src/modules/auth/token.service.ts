import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { sha256Hex } from './util/hash.util';
import type { AccessTokenPayload } from './types/authenticated-user.type';
import { loadEnv } from '../../config/env.validation';

export interface IssuedTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const env = loadEnv();

@Injectable()
export class TokenService {
  private readonly privateKey = readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
  private readonly publicKey = readFileSync(env.JWT_PUBLIC_KEY_PATH, 'utf8');

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, {
      privateKey: this.privateKey,
      algorithm: 'RS256',
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token, {
      publicKey: this.publicKey,
      algorithms: ['RS256'],
    });
  }

  async issueTokenPair(
    userId: string,
    deviceId: string,
    payload: AccessTokenPayload,
  ): Promise<IssuedTokenPair> {
    const accessToken = this.signAccessToken({ ...payload, deviceId });
    const refreshToken = await this.createRefreshToken(userId, deviceId);
    return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL_SECONDS };
  }

  private async createRefreshToken(
    userId: string,
    deviceId: string,
    replacesId?: string,
  ): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    const row = this.refreshTokens.create({
      userId,
      tokenHash: sha256Hex(raw),
      deviceId,
      expiresAt,
    });
    await this.refreshTokens.save(row);

    if (replacesId) {
      await this.refreshTokens.update(replacesId, { replacedById: row.id });
    }

    return raw;
  }

  /**
   * Rotates a refresh token: the presented token is looked up by hash,
   * validated (not expired, not already revoked), revoked, and a new one is
   * issued bound to the same user+device. If a token that was already
   * rotated-out (revoked, whether or not it has a replacedById) is presented
   * again, that's reuse of a stolen/leaked token — the whole chain for that
   * user+device is revoked and the caller is rejected.
   *
   * `buildPayload` is invoked with the token's owning userId so the new
   * access token reflects current roles/permissions rather than whatever was
   * true when the original token was issued.
   */
  async rotateRefreshTokenWithFreshPayload(
    rawToken: string,
    buildPayload: (userId: string) => Promise<AccessTokenPayload>,
  ): Promise<IssuedTokenPair> {
    const tokenHash = sha256Hex(rawToken);
    const existing = await this.refreshTokens.findOne({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      // Reuse of a revoked token — treat as compromise, nuke the device's session.
      await this.revokeAllForDevice(existing.userId, existing.deviceId);
      throw new UnauthorizedException('Refresh token reuse detected; session revoked');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.refreshTokens.update(existing.id, { revokedAt: new Date() });

    const payload = await buildPayload(existing.userId);
    const accessToken = this.signAccessToken({ ...payload, deviceId: existing.deviceId });
    const refreshToken = await this.createRefreshToken(
      existing.userId,
      existing.deviceId,
      existing.id,
    );

    return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL_SECONDS };
  }

  async revokeByRawToken(rawToken: string): Promise<void> {
    const tokenHash = sha256Hex(rawToken);
    await this.refreshTokens.update({ tokenHash }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }

  private async revokeAllForDevice(userId: string, deviceId: string): Promise<void> {
    await this.refreshTokens
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId AND device_id = :deviceId AND revoked_at IS NULL', {
        userId,
        deviceId,
      })
      .execute();
  }
}
