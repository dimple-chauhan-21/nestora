import { Injectable, Logger } from '@nestjs/common';
import type { NotificationPayload, NotificationProvider } from './notification-provider.interface';

/**
 * Stub — logs instead of a real push/SMS/email gateway. Used automatically
 * whenever FCM credentials aren't configured (see NotificationModule's
 * factory), so local dev/CI never depends on real infra, and as the
 * explicit override in every automated test. Same pattern as auth's
 * SmsProvider/ConsoleSmsProvider.
 */
@Injectable()
export class ConsoleNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(ConsoleNotificationProvider.name);

  async send(notification: NotificationPayload): Promise<void> {
    this.logger.log(
      `[notify -> user:${notification.recipientUserId}] (${notification.channel}) ${notification.event}: ${notification.title} — ${notification.body}${
        notification.data ? ` ${JSON.stringify(notification.data)}` : ''
      }`,
    );
  }
}
