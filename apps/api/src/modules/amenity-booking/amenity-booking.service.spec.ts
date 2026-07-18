import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { QueryFailedError, type Repository } from 'typeorm';
import { AmenityBookingService, validateBookingWindow } from './amenity-booking.service';
import type { TenantConnectionService } from '../../common/tenant-connection/tenant-connection.service';
import type { AmenityBookingRule } from '../../database/entities/amenity-booking-rule.entity';
import type { AmenityMaster } from '../../database/entities/amenity-master.entity';
import type { Flat } from '../../database/entities/flat.entity';
import type { Clock } from '../../common/clock';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

function buildRule(overrides: Partial<AmenityBookingRule> = {}): AmenityBookingRule {
  return {
    id: randomUUID(),
    societyId: randomUUID(),
    amenityId: randomUUID(),
    minDurationMins: 30,
    maxDurationMins: 120,
    advanceBookingDays: 7,
    cancellationWindowHours: 24,
    feeAmount: '0',
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

const NOW = new Date('2026-03-01T00:00:00.000Z');

describe('validateBookingWindow — server-side booking-rule validation', () => {
  it('accepts a booking within min/max duration and inside the advance-booking window', () => {
    const rule = buildRule();
    const startAt = new Date('2026-03-02T10:00:00.000Z');
    const endAt = new Date('2026-03-02T11:00:00.000Z'); // 60min, within [30,120]

    expect(() => validateBookingWindow(rule, startAt, endAt, NOW)).not.toThrow();
  });

  it('rejects a booking shorter than min_duration_mins', () => {
    const rule = buildRule({ minDurationMins: 30, maxDurationMins: 120 });
    const startAt = new Date('2026-03-02T10:00:00.000Z');
    const endAt = new Date('2026-03-02T10:15:00.000Z'); // 15min < 30min minimum

    expect(() => validateBookingWindow(rule, startAt, endAt, NOW)).toThrow(/below the minimum/);
  });

  it('rejects a booking longer than max_duration_mins', () => {
    const rule = buildRule({ minDurationMins: 30, maxDurationMins: 120 });
    const startAt = new Date('2026-03-02T10:00:00.000Z');
    const endAt = new Date('2026-03-02T13:00:00.000Z'); // 180min > 120min maximum

    expect(() => validateBookingWindow(rule, startAt, endAt, NOW)).toThrow(/exceeds the maximum/);
  });

  it('rejects a booking whose start is in the past', () => {
    const rule = buildRule();
    const startAt = new Date('2026-02-28T10:00:00.000Z'); // before NOW
    const endAt = new Date('2026-02-28T11:00:00.000Z');

    expect(() => validateBookingWindow(rule, startAt, endAt, NOW)).toThrow(/in the past/);
  });

  it('rejects a booking beyond advance_booking_days', () => {
    const rule = buildRule({ advanceBookingDays: 7 });
    const startAt = new Date('2026-03-10T10:00:00.000Z'); // 9 days out, beyond 7-day window
    const endAt = new Date('2026-03-10T11:00:00.000Z');

    expect(() => validateBookingWindow(rule, startAt, endAt, NOW)).toThrow(/more than 7 day\(s\) in advance/);
  });

  it('accepts a booking exactly at the advance-booking boundary', () => {
    const rule = buildRule({ advanceBookingDays: 7 });
    const startAt = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000); // exactly 7 days out
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    expect(() => validateBookingWindow(rule, startAt, endAt, NOW)).not.toThrow();
  });

  it('rejects endAt at or before startAt', () => {
    const rule = buildRule();
    const startAt = new Date('2026-03-02T10:00:00.000Z');
    const endAt = new Date('2026-03-02T10:00:00.000Z'); // equal, not after

    expect(() => validateBookingWindow(rule, startAt, endAt, NOW)).toThrow(/endAt must be after startAt/);
  });

  it('has no parameter anywhere for a client to override the computed bounds — only rule + raw dates + clock are accepted', () => {
    // Static assertion of intent: validateBookingWindow's signature is
    // (rule, startAt, endAt, now) — there is no "skipValidation" or
    // "overrideMaxDuration" escape hatch for a client-supplied value.
    expect(validateBookingWindow.length).toBe(4);
  });
});

/**
 * The 10-concurrent-bookings integration test can't distinguish "checks the
 * SQLSTATE before mapping to 409" from "catches anything on that insert and
 * calls it a conflict" — every error that scenario can actually produce is
 * a genuine 23P01. This suite forces the INSERT to fail with something
 * else entirely (a real QueryFailedError with a different SQLSTATE, and a
 * connection drop that isn't a QueryFailedError at all) and asserts the
 * service does NOT reinterpret either as a booking conflict.
 */
describe('AmenityBookingService.createBooking — error discrimination on the insert', () => {
  class FakeSingleRepo<T> {
    constructor(private readonly row: T) {}
    async findOne(): Promise<T> {
      return this.row;
    }
  }

  class FakeTenantConnection {
    constructor(private readonly onInsert: () => Promise<unknown>) {}
    async query(sql: string): Promise<unknown> {
      if (sql.trim().startsWith('INSERT INTO amenity_bookings')) {
        return this.onInsert();
      }
      throw new Error(`FakeTenantConnection.query: unexpected SQL in this test: ${sql}`);
    }
    async withSavepoint<T>(fn: (qr: { query: (sql: string) => Promise<unknown> }) => Promise<T>): Promise<T> {
      return fn({ query: (sql: string) => this.query(sql) });
    }
  }

  class FakeClock implements Clock {
    now(): Date {
      return new Date('2026-03-01T00:00:00.000Z');
    }
  }

  const societyId = randomUUID();
  const amenityId = randomUUID();
  const flatId = randomUUID();
  const scope: TenantScope = { societyId, flatId, isPlatformScope: false };

  function buildService(onInsert: () => Promise<unknown>): AmenityBookingService {
    const amenity = { id: amenityId, societyId } as AmenityMaster;
    const rule = buildRule({ amenityId, societyId });
    const flat = { id: flatId, societyId } as Flat;

    return new AmenityBookingService(
      new FakeTenantConnection(onInsert) as unknown as TenantConnectionService,
      new FakeSingleRepo(amenity) as unknown as Repository<AmenityMaster>,
      new FakeSingleRepo(rule) as unknown as Repository<AmenityBookingRule>,
      new FakeSingleRepo(flat) as unknown as Repository<Flat>,
      new FakeClock(),
    );
  }

  const dto = { flatId, startAt: '2026-03-02T10:00:00.000Z', endAt: '2026-03-02T11:00:00.000Z' };

  it('sanity check: a genuine exclusion_violation (23P01) still maps to ConflictException', async () => {
    const driverError = Object.assign(new Error('conflicting key value violates exclusion constraint'), {
      code: '23P01',
      constraint: 'excl_amenity_bookings_overlap',
    });
    const service = buildService(async () => {
      throw new QueryFailedError('INSERT INTO amenity_bookings ...', [], driverError as never);
    });

    await expect(service.createBooking(amenityId, dto, randomUUID(), scope, randomUUID())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('a foreign-key violation (23503) on the same insert is NOT mapped to 409 — it propagates as-is', async () => {
    const driverError = Object.assign(
      new Error('insert or update on table "amenity_bookings" violates foreign key constraint "fk_amenity_bookings_flat_id"'),
      { code: '23503', constraint: 'fk_amenity_bookings_flat_id' },
    );
    const injectedError = new QueryFailedError('INSERT INTO amenity_bookings ...', [], driverError as never);
    const service = buildService(async () => {
      throw injectedError;
    });

    let caught: unknown;
    try {
      await service.createBooking(amenityId, dto, randomUUID(), scope, randomUUID());
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeInstanceOf(ConflictException);
    // Rethrown unchanged, not re-wrapped — same object identity.
    expect(caught).toBe(injectedError);
  });

  it('a dropped connection mid-insert (not even a QueryFailedError) is NOT mapped to 409 — it propagates as-is', async () => {
    // node-postgres throws a plain Error for a lost connection — there's
    // no completed Postgres response, so there's no SQLSTATE at all. This
    // must never satisfy `err instanceof QueryFailedError`.
    const connectionError = new Error('Connection terminated unexpectedly');
    const service = buildService(async () => {
      throw connectionError;
    });

    let caught: unknown;
    try {
      await service.createBooking(amenityId, dto, randomUUID(), scope, randomUUID());
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeInstanceOf(ConflictException);
    expect(caught).not.toBeInstanceOf(QueryFailedError);
    expect(caught).toBe(connectionError);
  });

  it('a unique_violation (23505) on some OTHER constraint (not the idempotency key) is NOT silently treated as a replay or a conflict', async () => {
    // Guards against a coincidental future 23505 on an unrelated constraint
    // being misread as "client retried this exact request."
    const driverError = Object.assign(new Error('duplicate key value violates unique constraint "some_other_constraint"'), {
      code: '23505',
      constraint: 'some_other_constraint',
    });
    const injectedError = new QueryFailedError('INSERT INTO amenity_bookings ...', [], driverError as never);
    const service = buildService(async () => {
      throw injectedError;
    });

    let caught: unknown;
    try {
      await service.createBooking(amenityId, dto, randomUUID(), scope, randomUUID());
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeInstanceOf(ConflictException);
    expect(caught).toBe(injectedError);
  });
});
