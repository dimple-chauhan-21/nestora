import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OtpRequest } from '../../database/entities/otp-request.entity';
import { generateOtp, sha256Hex } from './util/hash.util';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms-provider.interface';
import { CLOCK, SystemClock, type Clock } from '../../common/clock';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_LOCKOUT_MINUTES = 15;

export type OtpPurpose = 'login' | 'signup' | 'reset';

export type OtpVerifyResult =
  | { outcome: 'valid' }
  | { outcome: 'invalid_code'; attemptsRemaining: number }
  | { outcome: 'locked'; lockedUntil: Date }
  | { outcome: 'expired' }
  | { outcome: 'not_found' };

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OtpRequest)
    private readonly otpRequests: Repository<OtpRequest>,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(CLOCK) private readonly clock: Clock = new SystemClock(),
  ) {}

  async request(phone: string, purpose: OtpPurpose): Promise<{ otpRequestId: string }> {
    const otp = generateOtp();
    const row = this.otpRequests.create({
      phone,
      purpose,
      otpHash: sha256Hex(otp),
      attempts: 0,
      expiresAt: new Date(this.clock.now().getTime() + OTP_TTL_SECONDS * 1000),
    });
    await this.otpRequests.save(row);
    await this.smsProvider.send(phone, `Your Nestora OTP is ${otp}. Valid for 5 minutes.`);
    return { otpRequestId: row.id };
  }

  /**
   * Verifies against the most recent, unconsumed OTP request for the phone.
   * Max 3 attempts per row, then 15-minute lockout (SRS Module 1 validation
   * rule + §12 account-lockout control).
   */
  async verify(phone: string, code: string): Promise<OtpVerifyResult & { userPhone?: string }> {
    const latest = await this.otpRequests.findOne({
      where: { phone },
      order: { createdAt: 'DESC' },
    });

    if (!latest || latest.consumedAt) {
      return { outcome: 'not_found' };
    }

    const now = this.clock.now().getTime();

    if (latest.lockedUntil && latest.lockedUntil.getTime() > now) {
      return { outcome: 'locked', lockedUntil: latest.lockedUntil };
    }

    if (latest.expiresAt.getTime() < now) {
      return { outcome: 'expired' };
    }

    if (latest.otpHash !== sha256Hex(code)) {
      const attempts = latest.attempts + 1;
      const lockedUntil =
        attempts >= OTP_MAX_ATTEMPTS
          ? new Date(now + OTP_LOCKOUT_MINUTES * 60 * 1000)
          : null;
      await this.otpRequests.update(latest.id, { attempts, lockedUntil });

      if (lockedUntil) {
        return { outcome: 'locked', lockedUntil };
      }
      return { outcome: 'invalid_code', attemptsRemaining: OTP_MAX_ATTEMPTS - attempts };
    }

    await this.otpRequests.update(latest.id, { consumedAt: this.clock.now() });
    return { outcome: 'valid' };
  }

  assertValid(result: OtpVerifyResult): void {
    if (result.outcome === 'valid') return;
    if (result.outcome === 'locked') {
      throw new UnauthorizedException(
        `Too many attempts. Locked until ${result.lockedUntil.toISOString()}`,
      );
    }
    throw new UnauthorizedException('Invalid or expired OTP');
  }
}
