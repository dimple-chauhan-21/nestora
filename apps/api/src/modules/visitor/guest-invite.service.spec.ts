import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { GuestInviteService } from './guest-invite.service';
import { QrTokenService } from './qr/qr-token.service';
import { GuestInvite } from '../../database/entities/guest-invite.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Resident } from '../../database/entities/resident.entity';
import type { Clock } from '../../common/clock';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

class FakeClock implements Clock {
  private current = new Date('2026-01-01T00:00:00.000Z');
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class FakeRepo<T extends { id: string }> {
  rows: T[] = [];
  create(partial: Partial<T>): T {
    return { id: randomUUID(), ...partial } as T;
  }
  async save(row: T): Promise<T> {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = row;
    else this.rows.push(row);
    return row;
  }
  async findOne(options: { where: Partial<Record<string, unknown>> }): Promise<T | null> {
    return (
      this.rows.find((r) =>
        Object.entries(options.where).every(
          ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
        ),
      ) ?? null
    );
  }
}

const PLATFORM_SCOPE: TenantScope = { societyId: null, flatId: null, isPlatformScope: true };

describe('GuestInviteService — QR single-use enforcement', () => {
  let invites: FakeRepo<GuestInvite>;
  let flats: FakeRepo<Flat>;
  let residents: FakeRepo<Resident>;
  let clock: FakeClock;
  let service: GuestInviteService;
  const flatId = randomUUID();
  const userId = randomUUID();

  beforeEach(async () => {
    process.env.QR_TOKEN_SECRET = 'test-secret';
    invites = new FakeRepo<GuestInvite>();
    flats = new FakeRepo<Flat>();
    residents = new FakeRepo<Resident>();
    clock = new FakeClock();

    flats.rows.push({ id: flatId, societyId: 'society-1' } as Flat);
    const resident = residents.create({
      flatId,
      userId,
      status: 'active',
      relationType: 'owner',
    } as Partial<Resident>);
    await residents.save(resident);

    const qrTokenService = new QrTokenService(new JwtService());
    service = new GuestInviteService(
      invites as unknown as Repository<GuestInvite>,
      flats as unknown as Repository<Flat>,
      residents as unknown as Repository<Resident>,
      qrTokenService,
      clock,
    );
  });

  it('blocks a second use of a single-use (non-recurring) invite', async () => {
    const invite = await service.create(
      flatId,
      userId,
      {
        flatId,
        guestName: 'Daily Tutor',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-01-02T00:00:00.000Z',
      },
      PLATFORM_SCOPE,
    );

    const firstResolve = await service.resolveByToken(invite.qrToken);
    expect(firstResolve.id).toBe(invite.id);
    await service.consume(invite.id);

    await expect(service.resolveByToken(invite.qrToken)).rejects.toThrow(BadRequestException);
    await expect(service.resolveByToken(invite.qrToken)).rejects.toThrow(/already been used/);
  });

  it('allows repeated use of a recurring invite (recurrence_rule present)', async () => {
    const invite = await service.create(
      flatId,
      userId,
      {
        flatId,
        guestName: 'Daily Tutor',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-01-31T00:00:00.000Z',
        recurrenceRule: 'FREQ=DAILY',
      },
      PLATFORM_SCOPE,
    );

    await service.resolveByToken(invite.qrToken);
    await service.consume(invite.id);

    // Consuming a recurring invite never sets consumedAt — resolve must still succeed.
    const secondResolve = await service.resolveByToken(invite.qrToken);
    expect(secondResolve.id).toBe(invite.id);
    await service.consume(invite.id);

    const thirdResolve = await service.resolveByToken(invite.qrToken);
    expect(thirdResolve.id).toBe(invite.id);
  });

  it('rejects a token outside its valid window', async () => {
    const invite = await service.create(
      flatId,
      userId,
      {
        flatId,
        guestName: 'One-off Guest',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-01-02T00:00:00.000Z',
      },
      PLATFORM_SCOPE,
    );

    clock.advance(3 * 24 * 60 * 60 * 1000); // 3 days later, past validTo

    await expect(service.resolveByToken(invite.qrToken)).rejects.toThrow(/valid window/);
  });
});
