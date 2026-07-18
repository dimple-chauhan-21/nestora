import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { randomInt, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SMS_PROVIDER } from '../src/modules/auth/sms/sms-provider.interface';
import { CapturingSmsProvider } from './capturing-sms.provider';
import { getAdminDataSource, closeAdminDataSource } from './admin-datasource';
import { Society } from '../src/database/entities/society.entity';
import { Flat } from '../src/database/entities/flat.entity';
import { Role } from '../src/database/entities/role.entity';
import { UserRole } from '../src/database/entities/user-role.entity';
import { Gate } from '../src/database/entities/gate.entity';
import { Guard as GuardEntity } from '../src/database/entities/guard.entity';
import { GateLog } from '../src/database/entities/gate-log.entity';

/**
 * Mirrors apps/desktop/src/main/offline-queue.ts's schema and
 * apps/desktop/src/main/sync.ts's sync algorithm exactly (same columns,
 * same "stop at first failure, strict local order, idempotency_key from
 * enqueue time" behavior) — duplicated here rather than cross-imported
 * because apps/desktop's queue module is Electron-coupled and the two
 * packages aren't linked; this proves the same *contract* end-to-end
 * against the real running API + Postgres, which is what actually matters.
 */
function openTestQueue(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      occurred_at_client_reported TEXT NOT NULL,
      synced_at TEXT
    );
  `);
  return db;
}

function enqueue(db: Database.Database, operationType: string, payload: unknown): number {
  const idempotencyKey = randomUUID();
  const occurredAtClientReported = new Date().toISOString();
  const result = db
    .prepare(
      'INSERT INTO offline_queue (operation_type, payload, idempotency_key, occurred_at_client_reported) VALUES (?, ?, ?, ?)',
    )
    .run(operationType, JSON.stringify(payload), idempotencyKey, occurredAtClientReported);
  return Number(result.lastInsertRowid);
}

function listUnsynced(db: Database.Database): Array<{
  id: number;
  operationType: string;
  payload: string;
  idempotencyKey: string;
  occurredAtClientReported: string;
}> {
  const rows = db.prepare('SELECT * FROM offline_queue WHERE synced_at IS NULL ORDER BY id ASC').all() as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: r.id as number,
    operationType: r.operation_type as string,
    payload: r.payload as string,
    idempotencyKey: r.idempotency_key as string,
    occurredAtClientReported: r.occurred_at_client_reported as string,
  }));
}

function markSynced(db: Database.Database, id: number): void {
  db.prepare("UPDATE offline_queue SET synced_at = datetime('now') WHERE id = ?").run(id);
}

async function syncQueue(
  db: Database.Database,
  apiBaseUrl: string,
  accessToken: string,
): Promise<{ syncedIds: number[]; failedAt: number | null; error?: string }> {
  const pending = listUnsynced(db);
  const syncedIds: number[] = [];

  for (const op of pending) {
    const endpoint = op.operationType === 'gate.manual-entry' ? '/api/v1/gate/manual-entry' : null;
    if (!endpoint) continue;

    const body = {
      ...(JSON.parse(op.payload) as Record<string, unknown>),
      idempotencyKey: op.idempotencyKey,
      occurredAtClientReported: op.occurredAtClientReported,
    };

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return { syncedIds, failedAt: op.id, error: err instanceof Error ? err.message : 'network error' };
    }

    if (!response.ok) {
      return { syncedIds, failedAt: op.id, error: `HTTP ${response.status}` };
    }

    markSynced(db, op.id);
    syncedIds.push(op.id);
  }

  return { syncedIds, failedAt: null };
}

function randomPhone(): string {
  return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

describe('Guard desktop offline-sync round-trip (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;
  let realApiBaseUrl: string;

  let societies: Repository<Society>;
  let flats: Repository<Flat>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;
  let gates: Repository<Gate>;
  let guardRepo: Repository<GuardEntity>;
  let gateLogs: Repository<GateLog>;

  let societyId: string;
  let gateId: string;
  const guardPhone = randomPhone();

  function decodeUserId(accessToken: string): string {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'));
    return payload.sub;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useClass(CapturingSmsProvider)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    // Real listening port — the sync function uses genuine fetch() over a
    // real socket, so "API down" can be simulated by pointing at a closed
    // port, and "reconnect" by pointing at this real one. In-process
    // supertest (used elsewhere in this suite) can't represent that.
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    realApiBaseUrl = `http://127.0.0.1:${port}`;

    sms = moduleRef.get(SMS_PROVIDER);
    const adminDb = await getAdminDataSource();
    societies = adminDb.getRepository(Society);
    flats = adminDb.getRepository(Flat);
    roles = adminDb.getRepository(Role);
    userRoles = adminDb.getRepository(UserRole);
    gates = adminDb.getRepository(Gate);
    guardRepo = adminDb.getRepository(GuardEntity);
    gateLogs = adminDb.getRepository(GateLog);

    const society = await societies.save(societies.create({ name: `Offline Sync Society ${Date.now()}` }));
    societyId = society.id;
    await flats.save(flats.create({ societyId, flatNumber: `OS-${Date.now()}`, status: 'occupied' }));
    const gate = await gates.save(gates.create({ societyId, name: 'Main Gate', type: 'main' }));
    gateId = gate.id;

    async function loginViaOtp(phone: string, deviceId: string): Promise<string> {
      await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
      const otp = sms.lastOtpFor(phone);
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phone, otp, deviceId })
        .expect(201);
      return res.body.accessToken;
    }

    const guardToken = await loginViaOtp(guardPhone, 'guard-setup');
    const guardUserId = decodeUserId(guardToken);
    const guardRole = await roles.findOneOrFail({ where: { code: 'security_guard' } });
    await userRoles.save(userRoles.create({ userId: guardUserId, roleId: guardRole.id, societyId, flatId: null }));
    await guardRepo.save(guardRepo.create({ societyId, userId: guardUserId, gateId }));
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  it('accepts a check-in into the local queue while the API is unreachable, then syncs it once reconnected — without double-logging on retry', async () => {
    // Fresh guard login (device the kiosk is actually using for this test).
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: guardPhone }).expect(202);
    const otp = sms.lastOtpFor(guardPhone);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/guard/login')
      .send({ phone: guardPhone, otp, deviceId: 'kiosk-offline-test', gateId })
      .expect(201);
    const accessToken = loginRes.body.accessToken;

    const tmpDir = mkdtempSync(join(tmpdir(), 'nestora-offline-queue-'));
    const db = openTestQueue(join(tmpDir, 'queue.sqlite'));

    // --- DISCONNECTED: guard performs a manual check-in while the API is down. ---
    const queueId = enqueue(db, 'gate.manual-entry', {
      gateId,
      entityType: 'staff',
      direction: 'in',
      overrideReason: 'Known staff, kiosk was offline',
    });
    expect(listUnsynced(db)).toHaveLength(1);

    const unreachableUrl = 'http://127.0.0.1:1'; // reserved/closed port — guaranteed connection refused
    const offlineAttempt = await syncQueue(db, unreachableUrl, accessToken);
    expect(offlineAttempt.failedAt).toBe(queueId);
    expect(offlineAttempt.syncedIds).toHaveLength(0);
    expect(listUnsynced(db)).toHaveLength(1); // still queued locally — nothing was lost

    // --- RECONNECTED: point sync at the real, live API. ---
    const onlineResult = await syncQueue(db, realApiBaseUrl, accessToken);
    expect(onlineResult.failedAt).toBeNull();
    expect(onlineResult.syncedIds).toEqual([queueId]);
    expect(listUnsynced(db)).toHaveLength(0);

    const rows = await gateLogs.find({ where: { gateId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.method).toBe('manual');
    expect(rows[0]?.entityType).toBe('staff');
    expect(rows[0]?.overrideReason).toBe('Known staff, kiosk was offline');
    expect(rows[0]?.occurredAtClientReported).not.toBeNull();

    // --- RETRY: sync runs again on a queue with nothing new pending. ---
    // Server-side idempotency itself (replaying the same idempotency_key
    // never double-logs) is proven directly in the next test.
    const retryResult = await syncQueue(db, realApiBaseUrl, accessToken);
    expect(retryResult.syncedIds).toHaveLength(0);
    expect(retryResult.failedAt).toBeNull();
    expect(await gateLogs.find({ where: { gateId } })).toHaveLength(1); // still exactly one row

    db.close();
  });

  it('server-side idempotency: replaying the same idempotency_key never creates a second gate_logs row', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: guardPhone }).expect(202);
    const otp = sms.lastOtpFor(guardPhone);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/guard/login')
      .send({ phone: guardPhone, otp, deviceId: 'kiosk-idempotency-test', gateId })
      .expect(201);
    const accessToken = loginRes.body.accessToken;

    const idempotencyKey = randomUUID();
    const body = {
      gateId,
      entityType: 'staff',
      direction: 'in',
      overrideReason: 'Idempotency replay test',
      idempotencyKey,
      occurredAtClientReported: new Date().toISOString(),
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/gate/manual-entry')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/gate/manual-entry')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body)
      .expect(201);

    expect(second.body.id).toBe(first.body.id); // same row returned, not a new one

    const rows = await gateLogs.find({ where: { gateId, overrideReason: 'Idempotency replay test' } });
    expect(rows).toHaveLength(1);
  });
});
