import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Follow-up to 1700000000019, discovered while actually wiring
 * TenantConnectionService's per-request session variables into the running
 * app (not just proving RLS blocks a raw bypass query in isolation) — two
 * more genuine system-level, cross-society flows needed the same
 * `app.is_platform_scope` bypass `payments` already got:
 *
 * 1. `user_roles`: simplified from a NULL-society-only platform bypass to a
 *    general one. The narrower form was fine when nothing actually used
 *    `is_platform_scope` against a real (non-NULL) society row; now that
 *    `ComplaintEscalationScheduler`'s cron sweep does (see #2 — it looks up
 *    a manager for an arbitrary society via `user_roles` while resolving
 *    escalations across every society at once), the general form is what
 *    both cases need. The self-user clause from 1700000000019 (needed for
 *    PermissionsService.resolve() during login, before any tenant scope
 *    exists) is unchanged.
 *
 * 2. `complaints` / `complaint_escalations`: the SLA-escalation cron job
 *    (`ComplaintEscalationScheduler`) is a singleton with no HTTP request,
 *    hence no single society to scope to — same structural reason
 *    `AuditService.list()`'s cross-society view was deliberately NOT
 *    reproduced under RLS (see KNOWN_GAPS.md), except here the cross-society
 *    read is a real, load-bearing, already-tested behavior (the cron sweep
 *    covers every society every 5 minutes) rather than a discretionary
 *    admin view, so it gets the bypass rather than being left degraded.
 *    The read-triggered sweep (`ComplaintService.list()`, a real per-request
 *    HTTP path) never needed this — it always passes the caller's own
 *    `scope.societyId`, which the plain (non-bypass) clause already covers.
 */
export class RlsBypassForSystemLevelFlows1700000000020 implements MigrationInterface {
  name = 'RlsBypassForSystemLevelFlows1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY tenant_isolation ON user_roles;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON user_roles
        USING (
          society_id = current_setting('app.current_society_id', true)::UUID
          OR current_setting('app.is_platform_scope', true) = 'true'
          OR user_id = current_setting('app.current_user_id', true)::UUID
        );
    `);

    await queryRunner.query(`DROP POLICY tenant_isolation ON complaints;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON complaints
        USING (
          society_id = current_setting('app.current_society_id', true)::UUID
          OR current_setting('app.is_platform_scope', true) = 'true'
        );
    `);

    await queryRunner.query(`DROP POLICY tenant_isolation ON complaint_escalations;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON complaint_escalations
        USING (
          society_id = current_setting('app.current_society_id', true)::UUID
          OR current_setting('app.is_platform_scope', true) = 'true'
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON complaint_escalations;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON complaint_escalations
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON complaints;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON complaints
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON user_roles;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON user_roles
        USING (
          society_id = current_setting('app.current_society_id', true)::UUID
          OR (society_id IS NULL AND current_setting('app.is_platform_scope', true) = 'true')
          OR user_id = current_setting('app.current_user_id', true)::UUID
        );
    `);
  }
}
