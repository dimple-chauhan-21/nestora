/**
 * Relocated from visitor/notifications/ — originally built for visitor
 * approval requests only, now also used by billing (reminders) and
 * complaint (status updates). The interface contract is unchanged; only
 * its home moved, since a shared cross-module dependency belongs in
 * Module 19's own reserved slot, not nested inside one of its consumers.
 */
export interface NotificationPayload {
  recipientUserId: string;
  channel: 'push' | 'sms' | 'email';
  event: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotificationProvider {
  send(notification: NotificationPayload): Promise<void>;
}

export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');
