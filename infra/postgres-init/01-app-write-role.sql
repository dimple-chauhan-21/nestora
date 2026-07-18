-- Runs once, automatically, on first init of a fresh postgres data volume
-- (postgres:16's docker-entrypoint-initdb.d convention — never re-run against
-- an existing volume, hence the IF NOT EXISTS guard is a safety net for local
-- `psql` re-runs, not something this script relies on for normal operation).
--
-- `app_write_role` is the restricted role the running API connects as at
-- request time (see .env's DATABASE_URL) — NOT a table owner, so Postgres
-- Row-Level Security actually applies to its queries (RLS never applies to a
-- table's owner, regardless of policies present — see KNOWN_GAPS.md's now-
-- resolved entry). Migrations keep running as the owning/admin role
-- (MIGRATION_DATABASE_URL) — this role only ever GRANTs privileges to
-- app_write_role, never owns anything itself.
--
-- Table-level GRANTs live in migration 1700000000019-AppWriteRoleGrants.ts,
-- not here — they need to run every time new tables are added (and via
-- ALTER DEFAULT PRIVILEGES for tables that don't exist yet), which is a
-- migration's job, not a one-time init script's.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write_role') THEN
    CREATE ROLE app_write_role LOGIN PASSWORD 'app_write_role_dev_password';
  END IF;
END
$$;
