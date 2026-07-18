import { DataSource } from 'typeorm';
import { join } from 'node:path';

/**
 * Owner-role connection for e2e test fixture setup and ground-truth
 * verification — deliberately NOT the app's own DataSource (which now
 * connects as `app_write_role`, RLS-restricted, see .env's DATABASE_URL).
 *
 * Before this session, e2e tests grabbed repositories straight off the
 * running app (`moduleRef.get(getRepositoryToken(Entity))`) for both
 * fixture setup and post-request verification. That doesn't work cleanly
 * anymore for two independent reasons: (1) those tokens are now
 * request-scoped (TenantScopedTypeOrmModule), so `moduleRef.get()` outside
 * an HTTP request context throws; (2) even if it didn't, fixture rows
 * inserted directly (bypassing the real endpoints) need something to set
 * `app.current_society_id` correctly per RLS's WITH CHECK, which a raw
 * repo grab has no mechanism to do.
 *
 * The fix mirrors how migrations and seeds already work: fixture setup was
 * never "the thing under test" — the actual HTTP requests made through
 * `request(app.getHttpServer())...` are, and those genuinely exercise the
 * app_write_role + RLS path. Fixture data underneath them is fine to write
 * with full owner access, the same way a migration creating a table is.
 *
 * Lazily initialized, shared across every e2e spec file's lifetime process
 * (Jest runs each spec file in its own worker, so this is one connection
 * per file, not per test).
 */
let dataSource: DataSource | null = null;

export async function getAdminDataSource(): Promise<DataSource> {
  if (dataSource?.isInitialized) return dataSource;

  dataSource = new DataSource({
    type: 'postgres',
    url: process.env.MIGRATION_DATABASE_URL ?? 'postgres://nestora:nestora@localhost:5433/society_test',
    entities: [join(__dirname, '..', 'src', 'database', 'entities', '**', '*.entity{.ts,.js}')],
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();
  return dataSource;
}

export async function closeAdminDataSource(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  dataSource = null;
}
