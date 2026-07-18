import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fixes a real, previously-latent bug in EVERY `tenant_isolation` RLS
 * policy in this schema (all ~48 of them, going back to the very first
 * Society/Resident session) — not something this session introduced, but
 * something this session was the first to actually exercise end-to-end,
 * since RLS was structurally inert (table-owner bypass) until now.
 *
 * `current_setting('app.current_society_id', true)::UUID` assumes an unset
 * GUC evaluates to SQL NULL, which then makes `society_id = NULL` cleanly
 * false. That's true if the GUC was never set at all. It is NOT true for
 * `TenantConnectionService`'s actual mechanism: unset context (e.g. no
 * caller society — login, an unauthenticated webhook, a platform-tier
 * request) is represented by calling `set_config('app.current_society_id',
 * NULL, true)`, and — confirmed empirically, not assumed —
 * `set_config(name, NULL, is_local)` sets the GUC to an EMPTY STRING, not
 * to "unset". `current_setting(..., true)` then returns `''`, and
 * `''::UUID` throws `invalid input syntax for type uuid`, not "no match".
 * Every request with no society in scope (which is exactly the login flow,
 * PermissionsService.resolve() being the first thing that exercises this)
 * hit this immediately.
 *
 * Fix: wrap every such cast in `NULLIF(x, '')` so an empty-string GUC
 * value converts to genuine SQL NULL before the `::UUID` cast, restoring
 * the "no match, not an error" behavior the policies were always meant to
 * have. Applied generically via a loop over `pg_policies` rather than
 * hand-editing every migration this session touched (1700000000001 through
 * 1700000000020) or the ones before it — same table, same fix, no reason
 * to duplicate ~48 near-identical DROP/CREATE POLICY statements by hand.
 * Any *future* migration writing a new `tenant_isolation` policy must use
 * this same `NULLIF(current_setting(...), '')::UUID` form from the start.
 */
export class FixRlsEmptyStringUuidCast1700000000021 implements MigrationInterface {
  name = 'FixRlsEmptyStringUuidCast1700000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        rec RECORD;
        new_qual TEXT;
      BEGIN
        FOR rec IN
          SELECT schemaname, tablename, policyname, qual
          FROM pg_policies
          WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
        LOOP
          new_qual := replace(
            rec.qual,
            $repl$(current_setting('app.current_society_id'::text, true))::uuid$repl$,
            $repl$NULLIF(current_setting('app.current_society_id'::text, true), '')::uuid$repl$
          );
          new_qual := replace(
            new_qual,
            $repl$(current_setting('app.current_user_id'::text, true))::uuid$repl$,
            $repl$NULLIF(current_setting('app.current_user_id'::text, true), '')::uuid$repl$
          );
          EXECUTE format('DROP POLICY %I ON %I.%I', rec.policyname, rec.schemaname, rec.tablename);
          EXECUTE format('CREATE POLICY %I ON %I.%I USING (%s)', rec.policyname, rec.schemaname, rec.tablename, new_qual);
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        rec RECORD;
        old_qual TEXT;
      BEGIN
        FOR rec IN
          SELECT schemaname, tablename, policyname, qual
          FROM pg_policies
          WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
        LOOP
          old_qual := replace(
            rec.qual,
            $repl$NULLIF(current_setting('app.current_society_id'::text, true), '')::uuid$repl$,
            $repl$(current_setting('app.current_society_id'::text, true))::uuid$repl$
          );
          old_qual := replace(
            old_qual,
            $repl$NULLIF(current_setting('app.current_user_id'::text, true), '')::uuid$repl$,
            $repl$(current_setting('app.current_user_id'::text, true))::uuid$repl$
          );
          EXECUTE format('DROP POLICY %I ON %I.%I', rec.policyname, rec.schemaname, rec.tablename);
          EXECUTE format('CREATE POLICY %I ON %I.%I USING (%s)', rec.policyname, rec.schemaname, rec.tablename, old_qual);
        END LOOP;
      END $$;
    `);
  }
}
