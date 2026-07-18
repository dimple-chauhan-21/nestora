import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { OtpService, OTP_MAX_ATTEMPTS } from './otp.service';
import { OtpRequest } from '../../database/entities/otp-request.entity';
import type { Clock } from '../../common/clock';
import type { SmsProvider } from './sms/sms-provider.interface';

class FakeClock implements Clock {
  private current = new Date('2026-01-01T00:00:00.000Z');

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** Minimal in-memory stand-in for Repository<OtpRequest> — only the methods OtpService calls. */
class FakeOtpRequestRepository {
  rows: OtpRequest[] = [];

  create(partial: Partial<OtpRequest>): OtpRequest {
    return { id: randomUUID(), attempts: 0, ...partial } as OtpRequest;
  }

  async save(row: OtpRequest): Promise<OtpRequest> {
    this.rows.push(row);
    return row;
  }

  async findOne(options: { where: { phone: string } }): Promise<OtpRequest | null> {
    const matches = this.rows
      .filter((r) => r.phone === options.where.phone)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  }

  async update(id: string, partial: Partial<OtpRequest>): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, partial);
  }
}

class SilentSmsProvider implements SmsProvider {
  sent: Array<{ phone: string; message: string }> = [];
  async send(phone: string, message: string): Promise<void> {
    this.sent.push({ phone, message });
  }
}

function extractOtp(message: string): string {
  const match = message.match(/OTP is (\d{6})/);
  const otp = match?.[1];
  if (!otp) throw new Error(`Could not find OTP in message: ${message}`);
  return otp;
}

function lastSent(sms: SilentSmsProvider): { phone: string; message: string } {
  const entry = sms.sent.at(-1);
  if (!entry) throw new Error('No SMS was sent');
  return entry;
}

describe('OtpService lockout', () => {
  let repo: FakeOtpRequestRepository;
  let clock: FakeClock;
  let sms: SilentSmsProvider;
  let service: OtpService;

  beforeEach(() => {
    repo = new FakeOtpRequestRepository();
    clock = new FakeClock();
    sms = new SilentSmsProvider();
    service = new OtpService(
      repo as unknown as Repository<OtpRequest>,
      sms,
      clock,
    );
  });

  it('locks out after 3 failed attempts, even the 4th attempt with the correct OTP', async () => {
    await service.request('+919876543210', 'login');
    const correctOtp = extractOtp(lastSent(sms).message);

    const first = await service.verify('+919876543210', '000000');
    const second = await service.verify('+919876543210', '111111');
    const third = await service.verify('+919876543210', '222222');

    expect(first).toEqual({ outcome: 'invalid_code', attemptsRemaining: 2 });
    expect(second).toEqual({ outcome: 'invalid_code', attemptsRemaining: 1 });
    expect(third.outcome).toBe('locked');

    // 4th attempt uses the correct OTP but must still be rejected — locked out.
    const fourth = await service.verify('+919876543210', correctOtp);
    expect(fourth.outcome).toBe('locked');
  });

  it('allows verification again once the 15-minute lockout window has passed (but the OTP itself has since expired)', async () => {
    await service.request('+919876543210', 'login');

    await service.verify('+919876543210', '000000');
    await service.verify('+919876543210', '111111');
    const locked = await service.verify('+919876543210', '222222');
    expect(locked.outcome).toBe('locked');

    clock.advance(15 * 60 * 1000 + 1000); // just past the 15-minute lockout

    const afterLockout = await service.verify('+919876543210', '333333');
    // OTP TTL (5 min) is shorter than the lockout (15 min), so by the time the
    // lockout clears the original OTP has also expired — not "locked" anymore,
    // but still correctly rejected, and a fresh /otp/request is required.
    expect(afterLockout.outcome).toBe('expired');
  });

  it('accepts the correct OTP within the attempt limit', async () => {
    await service.request('+919876543210', 'login');
    const correctOtp = extractOtp(lastSent(sms).message);

    const result = await service.verify('+919876543210', correctOtp);
    expect(result.outcome).toBe('valid');
  });

  it('rejects reuse of an already-consumed OTP', async () => {
    await service.request('+919876543210', 'login');
    const correctOtp = extractOtp(lastSent(sms).message);

    await service.verify('+919876543210', correctOtp);
    const second = await service.verify('+919876543210', correctOtp);
    expect(second.outcome).toBe('not_found');
  });

  it('OTP_MAX_ATTEMPTS is 3, matching the SRS spec', () => {
    expect(OTP_MAX_ATTEMPTS).toBe(3);
  });
});
