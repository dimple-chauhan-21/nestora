import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { DeviceToken } from '../../database/entities/device-token.entity';

import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { DeviceTokenController } from './device-token.controller';
import { DeviceTokenService } from './device-token.service';

import { NOTIFICATION_PROVIDER } from './notification-provider.interface';
import { ConsoleNotificationProvider } from './console-notification.provider';
import { FcmNotificationProvider, FCM_CONFIG } from './fcm-notification.provider';

import { loadEnv } from '../../config/env.validation';

const env = loadEnv();
const hasFcmCredentials = Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);

/**
 * Module 19's reserved slot — owns the cross-module NotificationProvider
 * infrastructure that visitor, billing, and complaint all depend on
 * (moved here from being nested inside the visitor module, see that
 * module's comment).
 *
 * `NOTIFICATION_PROVIDER` binds to `FcmNotificationProvider` only when
 * real Firebase credentials are present in env; otherwise it falls back
 * to `ConsoleNotificationProvider` automatically. This is what keeps
 * local dev, CI, and every existing test working unchanged with zero
 * config — real push only turns on once real credentials are actually
 * set, and turning it on is a config change, not a code change.
 */
@Module({
  imports: [TenantScopedTypeOrmModule.forFeature([DeviceToken])],
  controllers: [NotificationController, DeviceTokenController],
  providers: [
    NotificationService,
    DeviceTokenService,
    ConsoleNotificationProvider,
    ...(hasFcmCredentials
      ? [
          {
            provide: FCM_CONFIG,
            useValue: {
              projectId: env.FIREBASE_PROJECT_ID,
              clientEmail: env.FIREBASE_CLIENT_EMAIL,
              privateKey: env.FIREBASE_PRIVATE_KEY,
            },
          },
          FcmNotificationProvider,
          { provide: NOTIFICATION_PROVIDER, useExisting: FcmNotificationProvider },
        ]
      : [{ provide: NOTIFICATION_PROVIDER, useExisting: ConsoleNotificationProvider }]),
  ],
  exports: [NOTIFICATION_PROVIDER, DeviceTokenService],
})
export class NotificationModule {}
