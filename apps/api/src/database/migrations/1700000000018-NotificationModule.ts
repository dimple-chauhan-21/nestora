import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 19's own schema (`notification_templates`, `notification_
 * preferences`, `notification_logs`, `notification_schedule`) is the full
 * async queue-based architecture — not what this session builds. This
 * migration adds only what a real push provider needs right now:
 * `device_tokens`, so `NotificationProvider.send()` has somewhere to
 * resolve a `recipientUserId` into actual FCM registration tokens.
 *
 * No RLS — device tokens belong to a user account, not a tenant-scoped
 * resource, same posture as `users`/`refresh_tokens`.
 *
 * A stale/invalid token is soft-revoked (`deleted_at` set), never hard-
 * deleted — same precedent as `refresh_tokens.revoked_at`, not a fresh
 * pattern invented here.
 */
export class NotificationModule1700000000018 implements MigrationInterface {
  name = 'NotificationModule1700000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE device_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        token TEXT NOT NULL,
        platform VARCHAR(20) NOT NULL DEFAULT 'unknown',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_device_token_platform CHECK (platform IN ('ios', 'android', 'web', 'unknown'))
      );
    `);
    // Idempotent registration: re-registering the same token for the same
    // user (app reinstall, token-refresh replay) is a no-op, not a
    // duplicate row — same natural-unique-constraint idempotency pattern
    // as everywhere else in this codebase. Partial (WHERE deleted_at IS
    // NULL) so a previously-revoked token can be re-registered later.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_device_tokens_user_token ON device_tokens(user_id, token) WHERE deleted_at IS NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX idx_device_tokens_user ON device_tokens(user_id) WHERE deleted_at IS NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS device_tokens;`);
  }
}
