import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { getAdminDataSource, closeAdminDataSource } from './admin-datasource';
import { Society } from '../src/database/entities/society.entity';
import { Flat } from '../src/database/entities/flat.entity';

/**
 * The proof this session's RLS fix actually did something — deliberately
 * NOT going through the app, a controller, a service, or TenantScopeUtil's
 * application-layer ABAC filter at all. Every other e2e spec proves the
 * app behaves correctly when it's the one setting the session variables;
 * this one proves the DATABASE ITSELF refuses to hand over another
 * society's rows even to a raw, hand-written query — the actual thing
 * "close the RLS enforcement gap" means, independent of whether the app's
 * own code is ever correct.
 *
 * Connects directly as `app_write_role` (the exact role the running app
 * uses — see .env's DATABASE_URL) via its own bare DataSource, with no
 * NestJS module, controller, or interceptor anywhere in the picture. The
 * only thing under test is: does Postgres's own row-level security enforce
 * the boundary when a non-owner role queries a real table with a real
 * cross-tenant dataset already in it.
 */
describe('RLS enforcement — raw bypass of the app entirely (e2e)', () => {
  let appWriteRoleDb: DataSource;
  let ownerDb: DataSource;

  let societyAId: string;
  let societyBId: string;
  let flatAId: string;
  let flatBId: string;

  beforeAll(async () => {
    // The exact role/connection the running app uses — see .env's
    // DATABASE_URL, not MIGRATION_DATABASE_URL. A fresh, dedicated
    // DataSource, not reused from anywhere else, so there's no risk of an
    // open transaction/session variable leaking in from other test code.
    appWriteRoleDb = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgres://app_write_role:app_write_role_dev_password@localhost:5433/society_test',
      entities: [],
      synchronize: false,
      logging: false,
    });
    await appWriteRoleDb.initialize();

    ownerDb = await getAdminDataSource();

    const societies = ownerDb.getRepository(Society);
    const flats = ownerDb.getRepository(Flat);

    const societyA = await societies.save(societies.create({ name: `RLS Proof Society A ${Date.now()}` }));
    const societyB = await societies.save(societies.create({ name: `RLS Proof Society B ${Date.now()}` }));
    societyAId = societyA.id;
    societyBId = societyB.id;

    const flatA = await flats.save(flats.create({ societyId: societyAId, flatNumber: `A-${Date.now()}`, status: 'occupied' }));
    const flatB = await flats.save(flats.create({ societyId: societyBId, flatNumber: `B-${Date.now()}`, status: 'occupied' }));
    flatAId = flatA.id;
    flatBId = flatB.id;
  });

  afterAll(async () => {
    if (appWriteRoleDb.isInitialized) await appWriteRoleDb.destroy();
    await closeAdminDataSource();
  });

  it('sanity check: the owner role (migrations/seeds) is NOT RLS-restricted — sees both societies, proving the fixture setup itself is real', async () => {
    const rows: Array<{ id: string }> = await ownerDb.query(
      `SELECT id FROM flats WHERE id = $1 OR id = $2`,
      [flatAId, flatBId],
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(flatAId);
    expect(ids).toContain(flatBId);
  });

  it('app_write_role with NO session variable set sees NEITHER society — RLS defaults to deny, not allow', async () => {
    const runner = appWriteRoleDb.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // Deliberately no set_config call at all here — this is the "a
      // request came in with no tenant scope established" case.
      const rows: Array<{ id: string }> = await runner.query(
        `SELECT id FROM flats WHERE id = $1 OR id = $2`,
        [flatAId, flatBId],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('app_write_role scoped to Society A sees Society A\'s flat and NEVER Society B\'s — the actual isolation guarantee', async () => {
    const runner = appWriteRoleDb.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SELECT set_config('app.current_society_id', $1, true)`, [societyAId]);

      const rows: Array<{ id: string }> = await runner.query(
        `SELECT id FROM flats WHERE id = $1 OR id = $2`,
        [flatAId, flatBId],
      );
      const ids = rows.map((r) => r.id);

      expect(ids).toContain(flatAId);
      expect(ids).not.toContain(flatBId);
      expect(rows).toHaveLength(1);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('app_write_role scoped to Society A cannot read Society B\'s flat even by its exact, known primary key', async () => {
    const runner = appWriteRoleDb.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SELECT set_config('app.current_society_id', $1, true)`, [societyAId]);

      // Not a filtered list query — a direct point lookup by primary key,
      // the same shape a compromised or buggy application-layer query
      // (missing a WHERE society_id = ... clause entirely) would run. RLS
      // is what has to catch this, since the query itself doesn't try to.
      const rows: Array<{ id: string }> = await runner.query(`SELECT id FROM flats WHERE id = $1`, [flatBId]);
      expect(rows).toHaveLength(0);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('app_write_role cannot INSERT a row into Society B while scoped to Society A — RLS gates writes too, not just reads', async () => {
    const runner = appWriteRoleDb.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SELECT set_config('app.current_society_id', $1, true)`, [societyAId]);

      await expect(
        runner.query(
          `INSERT INTO flats (society_id, flat_number, status) VALUES ($1, $2, 'vacant')`,
          [societyBId, randomUUID().slice(0, 20)],
        ),
      ).rejects.toThrow(/new row violates row-level security policy/);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('switching the same connection\'s scope from Society A to Society B swaps what\'s visible — proves this is genuinely per-query-session state, not a cached/stale grant', async () => {
    const runner = appWriteRoleDb.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SELECT set_config('app.current_society_id', $1, true)`, [societyAId]);
      const asA: Array<{ id: string }> = await runner.query(`SELECT id FROM flats WHERE id = $1 OR id = $2`, [flatAId, flatBId]);
      expect(asA.map((r) => r.id)).toEqual([flatAId]);

      await runner.query(`SELECT set_config('app.current_society_id', $1, true)`, [societyBId]);
      const asB: Array<{ id: string }> = await runner.query(`SELECT id FROM flats WHERE id = $1 OR id = $2`, [flatAId, flatBId]);
      expect(asB.map((r) => r.id)).toEqual([flatBId]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
