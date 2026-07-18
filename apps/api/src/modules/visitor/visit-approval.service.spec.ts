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
      Object.entries(options.where).every(
        ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
      ),
    );
  }
  createQueryBuilder(alias: string) {
    const rows = this.rows;
    const conditions: Array<(r: T) => boolean> = [];
    const qb = {
      where(_sql: string, params?: Record<string, unknown>) {
        conditions.push(buildPredicate(_sql, params));
        return qb;
      },
      andWhere(_sql: string, params?: Record<string, unknown>) {
        conditions.push(buildPredicate(_sql, params));
        return qb;
      },
      async getMany(): Promise<T[]> {
        return rows.filter((r) => conditions.every((c) => c(r)));
      },
      async getOne(): Promise<T | null> {
        return rows.find((r) => conditions.every((c) => c(r))) ?? null;
      },
    };
    function buildPredicate(sql: string, params?: Record<string, unknown>): (r: T) => boolean {
      // Minimal matcher for the specific queries VisitApprovalService/BlacklistService issue.
      return (r: T) => {
        const rec = r as unknown as Record<string, unknown>;
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
        if (sql.startsWith('(') && sql.endsWith(')') && sql.includes('=')) {
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
});
