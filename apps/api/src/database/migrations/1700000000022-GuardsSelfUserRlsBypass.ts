import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Same structural fix as `user_roles`' self-user bypass (migration
 * 1700000000019) — discovered the same way, by actually exercising guard
 * login end-to-end rather than assuming the policy was fine.
 *
 * `GuardService.login()` calls `GuardContextService.resolveOrThrow(userId)`
 * — "is this user a registered guard, and if so which gate are they on" —
 * immediately after `AuthService.verifyOtp()` issues their JWT. At that
 * point in the SAME request, `app.current_society_id` is whatever it was
 * set to when the request STARTED — which, for a fresh unauthenticated
 * `/guard/login` call, is NULL (no caller scope exists yet; the whole point
 * of this call is to establish one). `guards`' plain policy has no
 * self-user clause, so the lookup found zero rows under RLS and
 * `resolveOrThrow` threw `ForbiddenException` for every guard login,
 * despite an entirely valid OTP and an entirely real guards row.
 *
 * Fix: allow a guard to always find their OWN row, the same reasoning as
 * `user_roles` — resolving your own identity isn't a tenant-isolation
 * concern (nothing about a different tenant is exposed by it), it's a
 * prerequisite for tenant scope to exist in the first place.
 * `app.current_user_id` is already correctly set by the time this lookup
 * runs (`PermissionsService.resolve()`, called earlier in the same
 * `verifyOtp()` call, sets it — same transaction, same session).
 */
export class GuardsSelfUserRlsBypass1700000000022 implements MigrationInterface {
  name = 'GuardsSelfUserRlsBypass1700000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY tenant_isolation ON guards;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON guards
        USING (
          society_id = NULLIF(current_setting('app.current_society_id', true), '')::UUID
          OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON guards;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON guards
        USING (society_id = NULLIF(current_setting('app.current_society_id', true), '')::UUID);
    `);
  }
}
