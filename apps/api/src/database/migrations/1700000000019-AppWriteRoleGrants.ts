import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Closes the RLS-bypass gap tracked in KNOWN_GAPS.md since the Society/
 * Resident session: `app_write_role` (created by
 * `infra/postgres-init/01-app-write-role.sql`, or manually for an
 * already-initialized volume — see README) is NOT a table owner and is NOT
 * superuser, so Postgres RLS policies actually apply to its queries, unlike
 * the migration-owning role this and every other migration still runs as.
 *
 * `GRANT ... ON ALL TABLES IN SCHEMA public` covers every table that exists
 * *right now*; `ALTER DEFAULT PRIVILEGES` covers every table a future
 * migration creates (this session's own `delivery_agents`/`deliveries`
 * included) without needing another grants migration every time a module
 * ships. Both run as the owning role, which is what makes the DEFAULT
 * PRIVILEGES registration apply to *its own* future CREATE TABLEs.
 *
 * Two narrow, deliberate RLS policy widenings ship here too — not a broad
 * loosening, two specific, justified exceptions:
 *
 * 1. `user_roles`: a user must be able to discover their OWN role
 *    assignments across all societies *before* any tenant scope exists —
 *    that lookup (`PermissionsService.resolve`) is what *establishes* the
 *    JWT's societyId/flatId in the first place, so it can't be gated behind
 *    a society_id session variable that doesn't exist yet. Widened to also
 *    allow `user_id = current_setting('app.current_user_id', true)::UUID`
 *    — self-visibility only, never another user's assignments.
 *
 * 2. `payments`: the payment-gateway webhook (`WebhookService`,
 *    unauthenticated, HMAC-verified) receives only a `gatewayRef` — it has
 *    to look the payment up *before* it knows which society it belongs to,
 *    the same chicken-and-egg as #1 but for a system-level caller instead
 *    of a user. Widened to also allow
 *    `current_setting('app.is_platform_scope', true) = 'true'`, which
 *    `WebhookService` sets on its own dedicated transaction for exactly
 *    this lookup, then narrows immediately to the resolved society for
 *    every write that follows (bills/receipts/ledger_entries/audit_logs
 *    keep their plain, unwidened policies — see webhook.service.ts).
 *
 * No other table gets a platform-scope bypass this session — in particular
 * `AuditService.list()`'s "see every society's logs at once" behavior for a
 * genuine platform-tier caller is NOT reproduced under RLS by this
 * migration (see KNOWN_GAPS.md): that needs a real cross-tenant-aggregation
 * mechanism (SRS §10.5's own suggested "bypass role" for platform/company
 * tiers), which is a separate, bigger piece of infra than what was asked
 * for this session (`app_write_role` only).
 */
export class AppWriteRoleGrants1700000000019 implements MigrationInterface {
  name = 'AppWriteRoleGrants1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ exists }] = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write_role') AS exists;`,
    );
    if (!exists) {
      throw new Error(
        "app_write_role does not exist. Run infra/postgres-init/01-app-write-role.sql against this database first " +
          '(docker compose up on a fresh volume does this automatically; an already-initialized volume needs it run manually — see README).',
      );
    }

    await queryRunner.query(`GRANT USAGE ON SCHEMA public TO app_write_role;`);
    await queryRunner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_write_role;`);
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_write_role;`,
    );

    // Insert-only, for real — re-asserted here because the AuditModule
    // migration's own REVOKE was a structural no-op (app_write_role didn't
    // exist yet when it ran).
    await queryRunner.query(`REVOKE UPDATE, DELETE ON audit_logs, audit_logs_default FROM app_write_role;`);

    // Widening #1 — see class comment.
    await queryRunner.query(`DROP POLICY tenant_isolation ON user_roles;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON user_roles
        USING (
          society_id = current_setting('app.current_society_id', true)::UUID
          OR (society_id IS NULL AND current_setting('app.is_platform_scope', true) = 'true')
          OR user_id = current_setting('app.current_user_id', true)::UUID
        );
    `);

    // Widening #2 — see class comment.
    await queryRunner.query(`DROP POLICY tenant_isolation ON payments;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON payments
        USING (
          society_id = current_setting('app.current_society_id', true)::UUID
          OR current_setting('app.is_platform_scope', true) = 'true'
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON payments;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON payments
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON user_roles;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON user_roles
        USING (
          society_id = current_setting('app.current_society_id', true)::UUID
          OR (society_id IS NULL AND current_setting('app.is_platform_scope', true) = 'true')
        );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write_role') THEN
          ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_write_role;
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_write_role;
          REVOKE USAGE ON SCHEMA public FROM app_write_role;
        END IF;
      END $$;
    `);
  }
}
