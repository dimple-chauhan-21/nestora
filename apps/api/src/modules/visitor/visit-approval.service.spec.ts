import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { VisitApprovalService } from './visit-approval.service';
import { BlacklistService } from './blacklist.service';
import { QrTokenService } from './qr/qr-token.service';
import { VisitorVisit } from '../../database/entities/visitor-visit.entity';
import { Visitor } from '../../database/entities/visitor.entity';
import { Resident } from '../../database/entities/resident.entity';
import { Flat } from '../../database/entities/flat.entity';
import { VisitorBlacklist } from '../../database/entities/visitor-blacklist.entity';
import type { Clock } from '../../common/clock';
import type { NotificationProvider, NotificationPayload } from '../notification/notification-provider.interface';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

class FakeClock implements Clock {
  private current = new Date('2026-01-01T00:00:00.000Z');
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class FakeRepo<T extends { id: string }> {
  rows: T[] = [];
  constructor(private readonly clock?: Clock) {}
  create(partial: Partial<T>): T {
    return { id: randomUUID(), createdAt: this.clock?.now() ?? new Date(), ...partial } as unknown as T;
  }
  async save(row: T): Promise<T> {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = row;
    else this.rows.push(row);
    return row;
  }
  async findOne(options: { where: Partial<Record<string, unknown>> }): Promise<T | null> {
    return (
      this.rows.find((r) =>
        Object.entries(options.where).every(
          ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
        ),
      ) ?? null
    );
  }
  async findOneOrFail(options: { where: Partial<Record<string, unknown>> }): Promise<T> {
    const row = await this.findOne(options);
    if (!row) throw new Error('not found');
    return row;
  }
  async find(options: { where: Partial<Record<string, unknown>> }): Promise<T[]> {
    return this.rows.filter((r) =>
      Object.entries(options.where).every(([k, v]) => {
        const rec = r as unknown as Record<string, unknown>;
        // Duck-types TypeORM's In() FindOperator rather than importing the
        // real class — this fake only needs to understand the operators the
        // service actually issues.
        if (v && typeof v === 'object' && (v as { _type?: string })._type === 'in') {
          return ((v as { _value: unknown[] })._value).includes(rec[k]);
        }
        return rec[k] === v;
      }),
    );
  }
  createQueryBuilder(alias: string) {
    const rows = this.rows;
    const conditions: Array<(r: T) => boolean> = [];
    const order: Array<{ field: string; dir: 'ASC' | 'DESC' }> = [];
    let limit: number | undefined;
    const qb = {
      where(_sql: string, params?: Record<string, unknown>) {
        conditions.push(buildPredicate(_sql, params));
        return qb;
      },
      andWhere(_sql: string, params?: Record<string, unknown>) {
        conditions.push(buildPredicate(_sql, params));
        return qb;
      },
      orderBy(field: string, dir: 'ASC' | 'DESC') {
        order.push({ field: toCamelCase(field.split('.').pop()!), dir });
        return qb;
      },
      addOrderBy(field: string, dir: 'ASC' | 'DESC') {
        order.push({ field: toCamelCase(field.split('.').pop()!), dir });
        return qb;
      },
      take(n: number) {
        limit = n;
        return qb;
      },
      async getMany(): Promise<T[]> {
        let result = rows.filter((r) => conditions.every((c) => c(r)));
        for (const { field, dir } of [...order].reverse()) {
          result = [...result].sort((a, b) => {
            const av = (a as unknown as Record<string, unknown>)[field];
            const bv = (b as unknown as Record<string, unknown>)[field];
            const cmp = av! > bv! ? 1 : av! < bv! ? -1 : 0;
            return dir === 'DESC' ? -cmp : cmp;
          });
        }
        return limit !== undefined ? result.slice(0, limit) : result;
      },
      async getOne(): Promise<T | null> {
        return rows.find((r) => conditions.every((c) => c(r))) ?? null;
      },
    };
    function buildPredicate(sql: string, params?: Record<string, unknown>): (r: T) => boolean {
      // Minimal matcher for the specific queries VisitApprovalService/BlacklistService issue.
      return (r: T) => {
        const rec = r as unknown as Record<string, unknown>;
        if (sql.includes('flat_id') && params?.flatId !== undefined) {
          if (rec.flatId !== params.flatId) return false;
        }
        if (sql.includes('society_id') && params?.societyId !== undefined) {
          if (rec.societyId !== params.societyId) return false;
        }
        if (sql.includes("status = :status") && params?.status !== undefined) {
          if (rec.status !== params.status) return false;
        }
        if (sql.includes('escalated_at IS NULL')) {
          if (rec.escalatedAt != null) return false;
        }
        if (sql.includes('created_at < :cutoff') && params?.cutoff !== undefined) {
          if (!((rec.createdAt as Date) < (params.cutoff as Date))) return false;
        }
        if (sql.includes('cursorCreatedAt') && params?.cursorCreatedAt !== undefined) {
          const cursorCreatedAt = params.cursorCreatedAt as string;
          const cursorId = params.cursorId as string;
          const rowCreatedAt = (rec.createdAt as Date).toISOString();
          return rowCreatedAt < cursorCreatedAt || (rowCreatedAt === cursorCreatedAt && (rec.id as string) < cursorId);
        }
        if (sql.startsWith('(') && sql.endsWith(')') && sql.includes('=') && !sql.includes('cursorCreatedAt')) {
          // BlacklistService's OR-combined identity clause — handles both a
          // single field and multiple fields joined by ' OR '.
          const clauses = sql.slice(1, -1).split(' OR ');
          return clauses.some((clause) => {
            if (clause.includes('phone') && params?.phone !== undefined) return rec.phone === params.phone;
            if (clause.includes('name') && params?.name !== undefined) return rec.name === params.name;
            if (clause.includes('idProofNumber') && params?.idProofNumber !== undefined)
              return rec.idProofNumber === params.idProofNumber;
            return false;
          });
        }
        return true;
      };
    }
    void alias;
    return qb;
  }
}

class CapturingNotificationProvider implements NotificationProvider {
  sent: NotificationPayload[] = [];
  async send(notification: NotificationPayload): Promise<void> {
    this.sent.push(notification);
  }
}

const PLATFORM_SCOPE: TenantScope = { societyId: null, flatId: null, isPlatformScope: true };

describe('VisitApprovalService', () => {
  let visits: FakeRepo<VisitorVisit>;
  let visitors: FakeRepo<Visitor>;
  let residents: FakeRepo<Resident>;
  let flats: FakeRepo<Flat>;
  let blacklist: FakeRepo<VisitorBlacklist>;
  let notifications: CapturingNotificationProvider;
  let clock: FakeClock;
  let service: VisitApprovalService;

  const societyId = randomUUID();
  const flatId = randomUUID();
  const ownerUserId = randomUUID();

  beforeEach(async () => {
    process.env.QR_TOKEN_SECRET = 'test-secret';
    clock = new FakeClock();
    visits = new FakeRepo<VisitorVisit>(clock);
    visitors = new FakeRepo<Visitor>();
    residents = new FakeRepo<Resident>();
    flats = new FakeRepo<Flat>();
    blacklist = new FakeRepo<VisitorBlacklist>();
    notifications = new CapturingNotificationProvider();

    flats.rows.push({ id: flatId, societyId } as Flat);
    const owner = residents.create({
      societyId,
      flatId,
      userId: ownerUserId,
      relationType: 'owner',
      status: 'active',
    } as Partial<Resident>);
    await residents.save(owner);

    const blacklistService = new BlacklistService(blacklist as unknown as Repository<VisitorBlacklist>);
    const qrTokenService = new QrTokenService(new JwtService());

    service = new VisitApprovalService(
      visits as unknown as Repository<VisitorVisit>,
      visitors as unknown as Repository<Visitor>,
      residents as unknown as Repository<Resident>,
      flats as unknown as Repository<Flat>,
      blacklistService,
      qrTokenService,
      notifications,
      clock,
    );
  });

  it('blocks pass issuance at approval time even if the visitor was blacklisted AFTER the walk-in was created', async () => {
    const visit = await service.createWalkIn(
      flatId,
      { flatId, name: 'Suspicious Person', phone: '+919812345678' },
      PLATFORM_SCOPE,
      'guard-1',
    );
    expect(visit.status).toBe('pending');

    // Blacklisted *after* the walk-in was registered but *before* approval.
    const entry = blacklist.create({
      societyId,
      phone: '+919812345678',
      reason: 'Reported by resident',
    } as Partial<VisitorBlacklist>);
    await blacklist.save(entry);

    await expect(service.approve(visit.id, PLATFORM_SCOPE, ownerUserId)).rejects.toThrow(ForbiddenException);
    await expect(service.approve(visit.id, PLATFORM_SCOPE, ownerUserId)).rejects.toThrow(/Blacklisted/);

    const reloaded = await visits.findOne({ where: { id: visit.id } });
    expect(reloaded?.status).toBe('pending'); // never got to 'approved' — no pass issued
    expect(reloaded?.qrCode).toBeFalsy(); // never set — no pass was issued
  });

  it('a blacklisted visitor is blocked at walk-in creation too (synchronous check before any pending row even helps them)', async () => {
    const entry = blacklist.create({
      societyId,
      phone: '+919800000000',
      reason: 'Prior incident',
    } as Partial<VisitorBlacklist>);
    await blacklist.save(entry);

    await expect(
      service.createWalkIn(flatId, { flatId, name: 'Blocked', phone: '+919800000000' }, PLATFORM_SCOPE, 'guard-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('escalates a pending visit past the timeout window and notifies a second contact', async () => {
    const secondResidentUserId = randomUUID();
    const secondResident = residents.create({
      societyId,
      flatId,
      userId: secondResidentUserId,
      relationType: 'family',
      status: 'active',
    } as Partial<Resident>);
    await residents.save(secondResident);

    const visit = await service.createWalkIn(
      flatId,
      { flatId, name: 'Waiting Visitor', phone: '+919811111111' },
      PLATFORM_SCOPE,
      'guard-1',
    );
    notifications.sent = []; // clear the walk-in notification, focus on escalation

    // Not yet past the window — no escalation.
    let escalatedCount = await service.checkAndEscalate(societyId, 300);
    expect(escalatedCount).toBe(0);
    expect(notifications.sent).toHaveLength(0);

    clock.advance(301 * 1000); // just past the 300s window

    escalatedCount = await service.checkAndEscalate(societyId, 300);
    expect(escalatedCount).toBe(1);
    expect(notifications.sent).toHaveLength(1);
    expect(notifications.sent[0]?.recipientUserId).toBe(secondResidentUserId);
    expect(notifications.sent[0]?.event).toBe('visitor.escalated');

    const reloaded = await visits.findOne({ where: { id: visit.id } });
    expect(reloaded?.escalatedAt).not.toBeNull();

    // Running the sweep again must NOT re-escalate (and re-notify) the same visit.
    notifications.sent = [];
    const secondSweepCount = await service.checkAndEscalate(societyId, 300);
    expect(secondSweepCount).toBe(0);
    expect(notifications.sent).toHaveLength(0);
  });

  it("walk-in and approve responses embed the visitor's name/phone/photo, not just an opaque visitorId", async () => {
    const walkIn = await service.createWalkIn(
      flatId,
      {
        flatId,
        name: 'Ramesh Patel',
        phone: '+919822233344',
        photoUrl: 'https://cdn.example.com/v1.jpg',
        purpose: 'Courier',
      },
      PLATFORM_SCOPE,
      'guard-1',
    );
    expect(walkIn.visitor).toEqual({
      id: expect.any(String),
      name: 'Ramesh Patel',
      phone: '+919822233344',
      photoUrl: 'https://cdn.example.com/v1.jpg',
    });
    expect((walkIn as unknown as { visitorId?: string }).visitorId).toBeUndefined();

    const approved = await service.approve(walkIn.id, PLATFORM_SCOPE, ownerUserId);
    expect(approved.visitor.name).toBe('Ramesh Patel');
    expect(approved.status).toBe('approved');
  });

  it('history() paginates with a keyset cursor, newest first, and reports hasMore/nextCursor correctly', async () => {
    const names = ['Visitor A', 'Visitor B', 'Visitor C', 'Visitor D', 'Visitor E'];
    for (const name of names) {
      await service.createWalkIn(flatId, { flatId, name }, PLATFORM_SCOPE, 'guard-1');
      clock.advance(1000); // distinct created_at per visit — newest is 'Visitor E'
    }

    const page1 = await service.history(flatId, PLATFORM_SCOPE, { limit: 2 });
    expect(page1.data.map((v) => v.visitor.name)).toEqual(['Visitor E', 'Visitor D']);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.nextCursor).toEqual(expect.any(String));

    const page2 = await service.history(flatId, PLATFORM_SCOPE, {
      limit: 2,
      cursor: page1.pagination.nextCursor!,
    });
    expect(page2.data.map((v) => v.visitor.name)).toEqual(['Visitor C', 'Visitor B']);
    expect(page2.pagination.hasMore).toBe(true);

    const page3 = await service.history(flatId, PLATFORM_SCOPE, {
      limit: 2,
      cursor: page2.pagination.nextCursor!,
    });
    expect(page3.data.map((v) => v.visitor.name)).toEqual(['Visitor A']);
    expect(page3.pagination.hasMore).toBe(false);
    expect(page3.pagination.nextCursor).toBeNull();
  });
});
