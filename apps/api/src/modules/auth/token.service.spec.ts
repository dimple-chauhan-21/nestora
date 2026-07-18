import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import type { AccessTokenPayload } from './types/authenticated-user.type';

/** Minimal in-memory stand-in for Repository<RefreshToken>. */
class FakeRefreshTokenRepository {
  rows: RefreshToken[] = [];

  create(partial: Partial<RefreshToken>): RefreshToken {
    return {
      id: randomUUID(),
      revokedAt: null,
      replacedById: null,
      createdAt: new Date(),
      ...partial,
    } as RefreshToken;
  }

  async save(row: RefreshToken): Promise<RefreshToken> {
    this.rows.push(row);
    return row;
  }

  async findOne(options: { where: { tokenHash: string } }): Promise<RefreshToken | null> {
    return this.rows.find((r) => r.tokenHash === options.where.tokenHash) ?? null;
  }

  async update(id: string, partial: Partial<RefreshToken>): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, partial);
  }

  createQueryBuilder() {
    const rows = this.rows;
    let setValues: Partial<RefreshToken> = {};
    const conditions: Array<(r: RefreshToken) => boolean> = [];
    return {
      update: () => ({
        set: (values: Partial<RefreshToken>) => {
          setValues = values;
          return {
            where: (_sql: string, params: Record<string, string>) => {
              conditions.push(
                (r) =>
                  r.userId === params.userId &&
                  (params.deviceId === undefined || r.deviceId === params.deviceId) &&
                  r.revokedAt === null,
              );
              return {
                execute: async () => {
                  for (const row of rows) {
                    if (conditions.every((c) => c(row))) Object.assign(row, setValues);
                  }
                },
              };
            },
          };
        },
      }),
    };
  }
}

const payload: AccessTokenPayload = {
  sub: 'user-1',
  phone: '+919876543210',
  email: null,
  roles: ['flat_owner'],
  permissions: ['resident:read'],
  societyId: null,
  flatId: null,
  deviceId: '',
};

describe('TokenService refresh rotation', () => {
  let repo: FakeRefreshTokenRepository;
  let service: TokenService;

  beforeEach(() => {
    process.env.JWT_PRIVATE_KEY_PATH = 'keys/jwt-private.pem';
    process.env.JWT_PUBLIC_KEY_PATH = 'keys/jwt-public.pem';
    repo = new FakeRefreshTokenRepository();
    service = new TokenService(new JwtService(), repo as unknown as Repository<RefreshToken>);
  });

  it('invalidates the old refresh token and issues a new one on rotation', async () => {
    const issued = await service.issueTokenPair('user-1', 'device-1', payload);
    const originalRow = repo.rows.at(0);
    if (!originalRow) throw new Error('expected a refresh token row to exist');
    expect(originalRow.revokedAt).toBeNull();

    const rotated = await service.rotateRefreshTokenWithFreshPayload(
      issued.refreshToken,
      async () => payload,
    );

    expect(rotated.refreshToken).not.toBe(issued.refreshToken);
    expect(originalRow.revokedAt).not.toBeNull();
    expect(originalRow.replacedById).not.toBeNull();

    // The new token rotates cleanly again — proves it's genuinely live, not a dead end.
    const secondRotation = await service.rotateRefreshTokenWithFreshPayload(
      rotated.refreshToken,
      async () => payload,
    );
    expect(secondRotation.refreshToken).not.toBe(rotated.refreshToken);
  });

  it('detects reuse of an already-rotated token and revokes the whole device session', async () => {
    const issued = await service.issueTokenPair('user-1', 'device-1', payload);
    const rotated = await service.rotateRefreshTokenWithFreshPayload(
      issued.refreshToken,
      async () => payload,
    );

    // Attacker (or a race) replays the original, now-revoked token.
    await expect(
      service.rotateRefreshTokenWithFreshPayload(issued.refreshToken, async () => payload),
    ).rejects.toThrow(UnauthorizedException);

    // The whole device session — including the token issued by the legitimate
    // rotation — must now be revoked, not just the reused one.
    const allDeviceTokens = repo.rows.filter((r) => r.deviceId === 'device-1');
    expect(allDeviceTokens.every((r) => r.revokedAt !== null)).toBe(true);

    // So the legitimately-rotated token can no longer be used either.
    await expect(
      service.rotateRefreshTokenWithFreshPayload(rotated.refreshToken, async () => payload),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown refresh token', async () => {
    await expect(
      service.rotateRefreshTokenWithFreshPayload('not-a-real-token', async () => payload),
    ).rejects.toThrow(UnauthorizedException);
  });
});
