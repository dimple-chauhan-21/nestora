import { Injectable, Logger } from '@nestjs/common';
import type { SmsProvider } from './sms-provider.interface';

/**
 * Stub implementation — logs instead of calling a real gateway. Swap for
 * an MSG91/Twilio-backed provider (or route through Module 19's
 * notification-service) by implementing SmsProvider and rebinding
 * SMS_PROVIDER in AuthModule; nothing in auth's business logic changes.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async send(phone: string, message: string): Promise<void> {
    this.logger.log(`[SMS -> ${phone}] ${message}`);
  }
}
