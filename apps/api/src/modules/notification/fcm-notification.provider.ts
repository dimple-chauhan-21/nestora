import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { DeviceToken } from '../../database/entities/device-token.entity';
import type { NotificationPayload, NotificationProvider } from './notification-provider.interface';

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export const FCM_CONFIG = Symbol('FCM_CONFIG');

/** FCM error codes that mean the token itself is dead — safe to prune, not a transient failure. */
const DEAD_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Real push provider — resolves `recipientUserId` to every device token
 * they've registered and sends to each individually (not the batched
 * `sendEachForMulticast` API) specifically so a single dead/expired token
 * doesn't obscure which token failed and why; pruning happens per-token,
 * one at a time.
 *
 * Only ever constructed by NotificationModule's factory when real Firebase
 * credentials are present in env — see that module's comment. When it IS
 * constructed, `initializeApp` runs at most once per process (guarded via
 * `getApps().length`), since re-initializing the default app throws.
 *
 * Uses the modular `firebase-admin/app` + `firebase-admin/messaging`
 * imports (the namespace-style `admin.initializeApp`/`admin.messaging()`
 * API from older SDK versions isn't what the installed v14 exports).
 */
@Injectable()
export class FcmNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(FcmNotificationProvider.name);
  private readonly app: App;

  constructor(
    @Inject(FCM_CONFIG) config: FcmConfig,
    @InjectRepository(DeviceToken) private readonly deviceTokens: Repository<DeviceToken>,
  ) {
    const existing = getApps();
    this.app = existing.length
      ? existing[0]!
      : initializeApp({
          credential: cert({
            projectId: config.projectId,
            clientEmail: config.clientEmail,
            // Env vars can't hold a literal newline cleanly — the Firebase
            // service-account JSON's private_key field is pasted in with
            // escaped `\n` sequences, un-escaped here.
            privateKey: config.privateKey.replace(/\\n/g, '\n'),
          }),
        });
  }

  async send(notification: NotificationPayload): Promise<void> {
    const tokens = await this.deviceTokens
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId: notification.recipientUserId })
      .andWhere('t.deleted_at IS NULL')
      .getMany();

    if (tokens.length === 0) {
      this.logger.log(`No device tokens registered for user ${notification.recipientUserId} — skipping push`);
      return;
    }

    const stringData: Record<string, string> = {};
    for (const [key, value] of Object.entries(notification.data ?? {})) {
      stringData[key] = String(value);
    }

    const messaging = getMessaging(this.app);

    for (const deviceToken of tokens) {
      try {
        await messaging.send({
          token: deviceToken.token,
          notification: { title: notification.title, body: notification.body },
          data: stringData,
        });
        this.logger.log(
          `FCM push sent to user ${notification.recipientUserId} (device_token id ${deviceToken.id}, event ${notification.event})`,
        );
      } catch (err) {
        const code = (err as { code?: string }).code;
        const message = err instanceof Error ? err.message : String(err);

        if (code && DEAD_TOKEN_ERROR_CODES.has(code)) {
          this.logger.warn(
            `FCM token dead for user ${notification.recipientUserId} (device_token id ${deviceToken.id}, code ${code}) — pruning`,
          );
          await this.deviceTokens.update(deviceToken.id, { deletedAt: new Date() });
        } else {
          // Transient (rate limit, quota, network) — logged, not thrown.
          // The caller (visitor approval, a bill reminder sweep, a
          // complaint status change) must never fail because a push
          // notification failed; it just doesn't get delivered this time.
          this.logger.error(
            `FCM send failed for user ${notification.recipientUserId} (device_token id ${deviceToken.id}): ${code ?? message}`,
          );
        }
      }
    }
  }
}
