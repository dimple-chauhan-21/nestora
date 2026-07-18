/**
 * Local dev default: a separate database/schema (society_test) on the same
 * Postgres instance the dev docker-compose stack already runs (localhost:5433)
 * — not the dev database, and not a new port, so there's no risk of colliding
 * with the remapped dev-compose ports or the unrelated lifeOS/infra stack on
 * the default 5432/6379. Redis DB index 1 keeps rate limiter keys isolated
 * from dev/manual testing on DB index 0.
 *
 * CI sets DATABASE_URL/REDIS_URL itself (GitHub Actions service containers on
 * the standard 5432/6379) — `??=` only fills these in when unset, so CI's
 * values always win and this file never fights them.
 *
 * DATABASE_URL is app_write_role (RLS-restricted) — the same role the real
 * app connects as, since the whole point of running e2e tests against a real
 * Postgres instead of mocks is to exercise the real RLS-enforced path.
 * MIGRATION_DATABASE_URL (owner role) is for test-fixture setup/verification
 * only — see test/admin-datasource.ts — never for anything under test.
 */
process.env.DATABASE_URL ??= 'postgres://app_write_role:app_write_role_dev_password@localhost:5433/society_test';
process.env.MIGRATION_DATABASE_URL ??= 'postgres://nestora:nestora@localhost:5433/society_test';
process.env.REDIS_URL ??= 'redis://localhost:6380/1';
process.env.JWT_PRIVATE_KEY_PATH ??= 'keys/jwt-private.pem';
process.env.JWT_PUBLIC_KEY_PATH ??= 'keys/jwt-public.pem';
process.env.NODE_ENV = 'test';
