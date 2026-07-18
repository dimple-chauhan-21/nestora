import { Injectable } from '@nestjs/common';
import type { SmsProvider } from '../src/modules/auth/sms/sms-provider.interface';

/** Test double: captures sent messages instead of a real SMS gateway, so the test can read the OTP back out. */
@Injectable()
export class CapturingSmsProvider implements SmsProvider {
  sent: Array<{ phone: string; message: string }> = [];

  async send(phone: string, message: string): Promise<void> {
    this.sent.push({ phone, message });
  }

  lastOtpFor(phone: string): string {
    const entry = [...this.sent].reverse().find((s) => s.phone === phone);
    if (!entry) throw new Error(`No SMS captured for ${phone}`);
    const match = entry.message.match(/OTP is (\d{6})/);
    const otp = match?.[1];
    if (!otp) throw new Error(`Could not find OTP in captured message: ${entry.message}`);
    return otp;
  }
}
