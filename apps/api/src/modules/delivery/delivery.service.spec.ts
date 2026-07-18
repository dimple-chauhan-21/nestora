import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { DeliveryService, DELIVERY_OTP_MAX_ATTEMPTS } from './delivery.service';
import { Delivery } from '../../database/entities/delivery.entity';
import { DeliveryAgent } from '../../database/entities/delivery-agent.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Resident } from '../../database/entities/resident.entity';
import { User } from '../../database/entities/user.entity';
import type { Guard } from '../../database/entities/guard.entity';
import type { GateLog } from '../../database/entities/gate-log.entity';
import type { Clock } from '../../common/clock';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { sha256Hex } from '../auth/util/hash.util';

/** Minimal in-memory Repository<T> stand-in — only the methods DeliveryService actually calls. */
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
        Object.entries(options.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
      ) ?? null
    );
  }
  async find(options: { where: Partial<Record<string, unknown>> }): Promise<T[]> {
    return this.rows.filter((r) =>
      Object.entries(options.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
    );
  }
  async update(id: string, partial: Partial<T>): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, partial);
  }
}

class FakeClock implements Clock {
  private current: Date;
  constructor(start: Date) {
    this.current = start;
  }
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class FakeGuardContext {
  constructor(private readonly guard: Guard) {}
  async resolveOrThrow(): Promise<Guard> {
    return this.guard;
  }
}

class FakeGateService {
  writeGateLogCalls: unknown[] = [];
  async writeGateLog(input: unknown): Promise<GateLog> {
    this.writeGateLogCalls.push(input);
    return {} as GateLog;
  }
}

const societyId = randomUUID();
const gateId = randomUUID();
const guardId = randomUUID();
const guardUserId = randomUUID();
const flatId = randomUUID();

const GUARD_SCOPE: TenantScope = { societyId, flatId: null, isPlatformScope: false };

function buildService(startTime = new Date('2026-03-01T00:00:00.000Z')) {
  const clock = new FakeClock(startTime);
  const deliveries = new FakeRepo<Delivery>();
  const agents = new FakeRepo<DeliveryAgent>();
  const flats = new FakeRepo<Flat>();
  const residents = new FakeRepo<Resident>();
  const users = new FakeRepo<User>();

  flats.rows.push({ id: flatId, societyId, status: 'occupied' } as Flat);

  // Every test gets one active resident with a phone by default, so the
  // service's own notifyResidents() (push + SMS) always has someone to
  // notify — otherwise the OTP the test needs to capture from the "sent"
  // SMS never gets sent at all.
  const residentUserId = randomUUID();
  residents.rows.push({ id: randomUUID(), flatId, userId: residentUserId, status: 'active' } as Resident);
  users.rows.push({ id: residentUserId, phone: '+919876599999' } as User);

  const guard: Guard = { id: guardId, societyId, userId: guardUserId, gateId } as Guard;
  const guardContext = new FakeGuardContext(guard);
  const gateService = new FakeGateService();

  const sentPush: Array<{ recipientUserId: string; body: string }> = [];
  const sentSms: Array<{ phone: string; message: string }> = [];
  const notifications = {
    send: async (n: { recipientUserId: string; body: string }) => {
      sentPush.push(n);
    },
  };
  const smsProvider = {
    send: async (phone: string, message: string) => {
      sentSms.push({ phone, message });
    },
  };

  const service = new DeliveryService(
    deliveries as unknown as import('typeorm').Repository<Delivery>,
    agents as unknown as import('typeorm').Repository<DeliveryAgent>,
    flats as unknown as import('typeorm').Repository<Flat>,
    residents as unknown as import('typeorm').Repository<Resident>,
    users as unknown as import('typeorm').Repository<User>,
    guardContext as unknown as import('../security-guard/guard-context.service').GuardContextService,
    gateService as unknown as import('../security-guard/gate.service').GateService,
    notifications as unknown as import('../notification/notification-provider.interface').NotificationProvider,
    smsProvider as unknown as import('../auth/sms/sms-provider.interface').SmsProvider,
    clock,
  );

  return { service, clock, deliveries, agents, flats, residents, users, gateService, sentPush, sentSms };
}

async function createTestDelivery(ctx: ReturnType<typeof buildService>) {
  const res = await ctx.service.create(
    { flatId, gateId, agentPhone: '+919876500000', agentName: 'Test Agent', platform: 'Amazon' },
    GUARD_SCOPE,
    guardUserId,
  );
  return res;
}

describe('DeliveryService — OTP handover flow', () => {
  it('creates a delivery with a hashed OTP, notifies via push and SMS, and reuses GateService.writeGateLog', async () => {
    const ctx = buildService();

    const delivery = await createTestDelivery(ctx);

    expect(delivery.status).toBe('pending');
    expect(delivery.otpVerified).toBe(false);
    expect((delivery as unknown as { otpHash?: string }).otpHash).toBeUndefined(); // never exposed
    expect(ctx.sentPush).toHaveLength(1);
    expect(ctx.sentSms).toHaveLength(1);
    expect(ctx.gateService.writeGateLogCalls).toHaveLength(1);
  });

  it('the correct OTP succeeds — verified: true, and is idempotent on a second correct call', async () => {
    const ctx = buildService();
    const otpCapture: string[] = [];
    // Capture the OTP the way a resident would receive it — via the SMS the service already sent.
    const resident = { id: randomUUID(), flatId, userId: randomUUID(), status: 'active' } as Resident;
    ctx.residents.rows.push(resident);
    ctx.users.rows.push({ id: resident.userId, phone: '+919876522222' } as User);

    const delivery = await createTestDelivery(ctx);
    const smsBody = ctx.sentSms[0]?.message ?? '';
    const otp = smsBody.match(/code is (\d{4,6})/)?.[1];
    expect(otp).toBeDefined();
    otpCapture.push(otp!);

    const result = await ctx.service.verifyOtp(delivery.id, { otp: otp! }, GUARD_SCOPE, guardUserId);
    expect(result).toEqual({ verified: true });

    const stored = await ctx.deliveries.findOne({ where: { id: delivery.id } });
    expect(stored?.otpVerifiedAt).not.toBeNull();

    // Idempotent — verifying again (e.g. a retried request) still reports verified, doesn't error.
    const again = await ctx.service.verifyOtp(delivery.id, { otp: otp! }, GUARD_SCOPE, guardUserId);
    expect(again).toEqual({ verified: true });
  });

  it('a wrong OTP fails — verified: false, increments attempts, does NOT mark verified', async () => {
    const ctx = buildService();
    const delivery = await createTestDelivery(ctx);

    const result = await ctx.service.verifyOtp(delivery.id, { otp: '000000' }, GUARD_SCOPE, guardUserId);
    expect(result).toEqual({ verified: false });

    const stored = await ctx.deliveries.findOne({ where: { id: delivery.id } });
    expect(stored?.otpVerifiedAt).toBeNull();
    expect(stored?.otpAttempts).toBe(1);
  });

  it('an expired OTP fails even with the exact correct code', async () => {
    const ctx = buildService();
    const delivery = await createTestDelivery(ctx);
    const smsBody = ctx.sentSms[0]?.message ?? '';
    const otp = smsBody.match(/code is (\d{4,6})/)?.[1]!;

    // Advance the shared clock past the 10-minute expiry window.
    ctx.clock.advance(11 * 60 * 1000);

    const result = await ctx.service.verifyOtp(delivery.id, { otp }, GUARD_SCOPE, guardUserId);
    expect(result).toEqual({ verified: false });

    const stored = await ctx.deliveries.findOne({ where: { id: delivery.id } });
    expect(stored?.otpVerifiedAt).toBeNull();
  });

  it(`after ${DELIVERY_OTP_MAX_ATTEMPTS} wrong attempts, even the correct OTP is permanently rejected (guard must use an override instead)`, async () => {
    const ctx = buildService();
    const delivery = await createTestDelivery(ctx);
    const smsBody = ctx.sentSms[0]?.message ?? '';
    const otp = smsBody.match(/code is (\d{4,6})/)?.[1]!;

    for (let i = 0; i < DELIVERY_OTP_MAX_ATTEMPTS; i++) {
      const r = await ctx.service.verifyOtp(delivery.id, { otp: '111111' }, GUARD_SCOPE, guardUserId);
      expect(r).toEqual({ verified: false });
    }

    // The lockout is real, not cosmetic: the ACTUAL correct code is tried here and must still fail.
    const finalAttempt = await ctx.service.verifyOtp(delivery.id, { otp }, GUARD_SCOPE, guardUserId);
    expect(finalAttempt).toEqual({ verified: false });
  });
});

describe('DeliveryService.updateStatus — handover requires proof (OTP or explicit override)', () => {
  it('marking handed_over without a verified OTP and without an overrideReason is rejected', async () => {
    const ctx = buildService();
    const delivery = await createTestDelivery(ctx);

    await expect(
      ctx.service.updateStatus(delivery.id, { status: 'handed_over' }, GUARD_SCOPE, guardUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('marking handed_over WITH a verified OTP succeeds, with no override reason recorded', async () => {
    const ctx = buildService();
    const delivery = await createTestDelivery(ctx);
    const smsBody = ctx.sentSms[0]?.message ?? '';
    const otp = smsBody.match(/code is (\d{4,6})/)?.[1]!;
    await ctx.service.verifyOtp(delivery.id, { otp }, GUARD_SCOPE, guardUserId);

    const updated = await ctx.service.updateStatus(delivery.id, { status: 'handed_over' }, GUARD_SCOPE, guardUserId);
    expect(updated.status).toBe('handed_over');
    expect(updated.handoverOverrideReason).toBeNull();
  });

  it('marking handed_over WITHOUT a verified OTP but WITH an explicit overrideReason succeeds (elderly/no-smartphone resident)', async () => {
    const ctx = buildService();
    const delivery = await createTestDelivery(ctx);

    const updated = await ctx.service.updateStatus(
      delivery.id,
      { status: 'handed_over', overrideReason: 'Elderly resident, no smartphone — verified verbally over intercom' },
      GUARD_SCOPE,
      guardUserId,
    );
    expect(updated.status).toBe('handed_over');
    expect(updated.handoverOverrideReason).toContain('Elderly resident');
  });

  it('marking returned never needs an OTP or override at all', async () => {
    const ctx = buildService();
    const delivery = await createTestDelivery(ctx);

    const updated = await ctx.service.updateStatus(delivery.id, { status: 'returned' }, GUARD_SCOPE, guardUserId);
    expect(updated.status).toBe('returned');
  });

  it('heldAtDesk can be set independently of a status change, leaving status pending', async () => {
    const ctx = buildService();
    const delivery = await createTestDelivery(ctx);

    const updated = await ctx.service.updateStatus(delivery.id, { heldAtDesk: true }, GUARD_SCOPE, guardUserId);
    expect(updated.status).toBe('pending');
    expect(updated.heldAtDesk).toBe(true);
  });
});

describe('DeliveryService — one OTP per delivery, not per flat', () => {
  it('two simultaneous deliveries to the same flat have independent OTPs — one cannot verify the other', async () => {
    const ctx = buildService();
    const first = await createTestDelivery(ctx);
    const second = await ctx.service.create(
      { flatId, gateId, agentPhone: '+919876500001', agentName: 'Second Agent', platform: 'Swiggy' },
      GUARD_SCOPE,
      guardUserId,
    );

    const firstOtp = (ctx.sentSms[0]?.message ?? '').match(/code is (\d{4,6})/)?.[1]!;
    const secondOtp = (ctx.sentSms[1]?.message ?? '').match(/code is (\d{4,6})/)?.[1]!;
    expect(firstOtp).toBeDefined();
    expect(secondOtp).toBeDefined();

    // First delivery's code does NOT verify the second delivery — skip the
    // negative assertion on the astronomically rare chance the two random
    // 6-digit codes collide, rather than have a flaky test.
    if (firstOtp !== secondOtp) {
      const crossResult = await ctx.service.verifyOtp(second.id, { otp: firstOtp }, GUARD_SCOPE, guardUserId);
      expect(crossResult).toEqual({ verified: false });
    }

    const correctResult = await ctx.service.verifyOtp(second.id, { otp: secondOtp }, GUARD_SCOPE, guardUserId);
    expect(correctResult).toEqual({ verified: true });

    // The first delivery is untouched by the second's verification.
    const firstStored = await ctx.deliveries.findOne({ where: { id: first.id } });
    expect(firstStored?.otpVerifiedAt).toBeNull();
  });
});

describe('DeliveryService — hashing sanity', () => {
  it('the stored otp_hash is a real sha256 of the generated code, not a placeholder', async () => {
    const ctx = buildService();
    const delivery = await createTestDelivery(ctx);
    const stored = await ctx.deliveries.findOne({ where: { id: delivery.id } });
    const smsBody = ctx.sentSms[0]?.message ?? '';
    const otp = smsBody.match(/code is (\d{4,6})/)?.[1]!;

    expect(stored?.otpHash).toBe(sha256Hex(otp));
    expect(stored?.otpHash).not.toBe(otp);
  });
});
