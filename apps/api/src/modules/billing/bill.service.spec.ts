import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { BillService } from './bill.service';
import { BillingPlanService } from './billing-plan.service';
import { AuditService } from '../audit/audit.service';
import { Bill } from '../../database/entities/bill.entity';
import { BillLineItem } from '../../database/entities/bill-line-item.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Resident } from '../../database/entities/resident.entity';
import { BillingPlan } from '../../database/entities/billing-plan.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import type { Clock } from '../../common/clock';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import type { NotificationProvider } from '../notification/notification-provider.interface';

const fakeNotifications: NotificationProvider = { send: async () => {} };

class FakeClock implements Clock {
  private current = new Date('2026-02-15T00:00:00.000Z');
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
        Object.entries(options.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
      ) ?? null
    );
  }
  async find(options: { where: Partial<Record<string, unknown>> }): Promise<T[]> {
    return this.rows.filter((r) =>
      Object.entries(options.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
    );
  }
  async count(options: { where: Partial<Record<string, unknown>> }): Promise<number> {
    return (await this.find(options)).length;
  }
  createQueryBuilder() {
    const rows = this.rows;
    const conditions: Array<(r: T) => boolean> = [];
    const qb = {
      where(sql: string, params?: Record<string, unknown>) {
        conditions.push(buildPredicate(sql, params));
        return qb;
      },
      andWhere(sql: string, params?: Record<string, unknown>) {
        conditions.push(buildPredicate(sql, params));
        return qb;
      },
      async getMany(): Promise<T[]> {
        return rows.filter((r) => conditions.every((c) => c(r)));
      },
    };
    function buildPredicate(sql: string, params?: Record<string, unknown>): (r: T) => boolean {
      return (r: T) => {
        const rec = r as unknown as Record<string, unknown>;
        if (sql.includes('society_id') && params?.societyId !== undefined) {
          if (rec.societyId !== params.societyId) return false;
        }
        if (sql.includes('status IN') && params?.statuses !== undefined) {
          if (!(params.statuses as string[]).includes(rec.status as string)) return false;
        }
        if (sql.includes('late_fee_applied = 0')) {
          if (Number(rec.lateFeeApplied) !== 0) return false;
        }
        if (sql.includes('due_date') && params?.asOf !== undefined && params?.graceDays !== undefined) {
          const dueDate = new Date(rec.dueDate as string);
          dueDate.setDate(dueDate.getDate() + Number(params.graceDays));
          if (!(dueDate < (params.asOf as Date))) return false;
        }
        return true;
      };
    }
    return qb;
  }
}

const PLATFORM_SCOPE: TenantScope = { societyId: null, flatId: null, isPlatformScope: true };

describe('BillService.generateForSociety — idempotent bill generation', () => {
  let bills: FakeRepo<Bill>;
  let lineItems: FakeRepo<BillLineItem>;
  let flats: FakeRepo<Flat>;
  let residents: FakeRepo<Resident>;
  let billingPlans: FakeRepo<BillingPlan>;
  let auditLogs: FakeRepo<AuditLog>;
  let clock: FakeClock;
  let service: BillService;

  const societyId = randomUUID();
  const flatId = randomUUID();

  beforeEach(async () => {
    clock = new FakeClock();
    bills = new FakeRepo<Bill>(clock);
    lineItems = new FakeRepo<BillLineItem>(clock);
    flats = new FakeRepo<Flat>(clock);
    residents = new FakeRepo<Resident>(clock);
    billingPlans = new FakeRepo<BillingPlan>(clock);
    auditLogs = new FakeRepo<AuditLog>(clock);

    flats.rows.push({ id: flatId, societyId, status: 'occupied', areaSqft: '1000' } as Flat);
    const plan = billingPlans.create({
      societyId,
      formulaType: 'flat_rate',
      rate: '2500.00',
      lateFeePct: '5',
      gracePeriodDays: 5,
    } as Partial<BillingPlan>);
    await billingPlans.save(plan);

    const billingPlanService = new BillingPlanService(billingPlans as unknown as Repository<BillingPlan>);
    const auditService = new AuditService(auditLogs as unknown as Repository<AuditLog>);

    service = new BillService(
      bills as unknown as Repository<Bill>,
      lineItems as unknown as Repository<BillLineItem>,
      flats as unknown as Repository<Flat>,
      residents as unknown as Repository<Resident>,
      billingPlanService,
      auditService,
      fakeNotifications,
      clock,
    );
  });

  it('generating bills for the same society/period twice produces exactly one bill per flat', async () => {
    const firstRun = await service.generateForSociety(societyId, '2026-02-01', PLATFORM_SCOPE, 'admin-1');
    expect(firstRun).toHaveLength(1);
    expect(firstRun[0]?.amountDue).toBe('2500.00');

    const secondRun = await service.generateForSociety(societyId, '2026-02-01', PLATFORM_SCOPE, 'admin-1');
    expect(secondRun).toHaveLength(1);
    expect(secondRun[0]?.id).toBe(firstRun[0]?.id); // same bill returned, not a new one

    const allBillsForFlat = await bills.find({ where: { flatId, billingPeriod: '2026-02-01' } });
    expect(allBillsForFlat).toHaveLength(1); // never double-billed
  });

  it('a different billing period for the same flat produces a separate bill', async () => {
    await service.generateForSociety(societyId, '2026-02-01', PLATFORM_SCOPE, 'admin-1');
    await service.generateForSociety(societyId, '2026-03-01', PLATFORM_SCOPE, 'admin-1');

    const allBillsForFlat = await bills.find({ where: { flatId } });
    expect(allBillsForFlat).toHaveLength(2);
  });

  it('skips vacant flats', async () => {
    const vacantFlatId = randomUUID();
    flats.rows.push({ id: vacantFlatId, societyId, status: 'vacant', areaSqft: '800' } as Flat);

    const result = await service.generateForSociety(societyId, '2026-02-01', PLATFORM_SCOPE, 'admin-1');
    expect(result.find((b) => b.flatId === vacantFlatId)).toBeUndefined();
  });
});

describe('BillService.applyLateFeesForOverdueBills — server-side-only late fee', () => {
  let bills: FakeRepo<Bill>;
  let lineItems: FakeRepo<BillLineItem>;
  let flats: FakeRepo<Flat>;
  let residents: FakeRepo<Resident>;
  let billingPlans: FakeRepo<BillingPlan>;
  let auditLogs: FakeRepo<AuditLog>;
  let clock: FakeClock;
  let service: BillService;

  const societyId = randomUUID();
  const flatId = randomUUID();
  let billId: string;

  beforeEach(async () => {
    clock = new FakeClock(); // 2026-02-15
    bills = new FakeRepo<Bill>(clock);
    lineItems = new FakeRepo<BillLineItem>(clock);
    flats = new FakeRepo<Flat>(clock);
    residents = new FakeRepo<Resident>(clock);
    billingPlans = new FakeRepo<BillingPlan>(clock);
    auditLogs = new FakeRepo<AuditLog>(clock);

    const plan = billingPlans.create({
      societyId,
      formulaType: 'flat_rate',
      rate: '2500.00',
      lateFeePct: '5', // server-controlled — never accepted from a client
      gracePeriodDays: 5,
    } as Partial<BillingPlan>);
    await billingPlans.save(plan);

    // Overdue: due 2026-01-01 + 5 day grace, well before "now" (2026-02-15).
    const bill = bills.create({
      societyId,
      flatId,
      billingPeriod: '2026-01-01',
      amountDue: '1000.00',
      amountPaid: '0',
      dueDate: '2026-01-01',
      status: 'unpaid',
      lateFeeApplied: '0',
    } as Partial<Bill>);
    await bills.save(bill);
    billId = bill.id;

    const billingPlanService = new BillingPlanService(billingPlans as unknown as Repository<BillingPlan>);
    const auditService = new AuditService(auditLogs as unknown as Repository<AuditLog>);

    service = new BillService(
      bills as unknown as Repository<Bill>,
      lineItems as unknown as Repository<BillLineItem>,
      flats as unknown as Repository<Flat>,
      residents as unknown as Repository<Resident>,
      billingPlanService,
      auditService,
      fakeNotifications,
      clock,
    );
  });

  it('computes the late fee purely from billing_plans.late_fee_pct — there is no parameter for a client to override it', async () => {
    // Note the method signature: (societyId, asOf) — no lateFeeAmount
    // parameter exists anywhere in this call chain to override.
    const applied = await service.applyLateFeesForOverdueBills(societyId, clock.now());
    expect(applied).toBe(1);

    const bill = await bills.findOne({ where: { id: billId } });
    // 5% of 1000.00 = 50.00, computed server-side from the plan.
    expect(bill?.lateFeeApplied).toBe('50.00');
    expect(bill?.amountDue).toBe('1050.00');
    expect(bill?.status).toBe('overdue');
  });

  it('does not re-apply a late fee on a bill that already has one (idempotent sweep)', async () => {
    await service.applyLateFeesForOverdueBills(societyId, clock.now());
    const secondSweep = await service.applyLateFeesForOverdueBills(societyId, clock.now());
    expect(secondSweep).toBe(0);

    const bill = await bills.findOne({ where: { id: billId } });
    expect(bill?.lateFeeApplied).toBe('50.00'); // unchanged, not compounded
  });

  it('does not apply a late fee to a bill still within its grace period', async () => {
    const freshBill = bills.create({
      societyId,
      flatId,
      billingPeriod: '2026-02-01',
      amountDue: '1000.00',
      amountPaid: '0',
      dueDate: '2026-02-14', // due yesterday, but grace period is 5 days
      status: 'unpaid',
      lateFeeApplied: '0',
    } as Partial<Bill>);
    await bills.save(freshBill);

    await service.applyLateFeesForOverdueBills(societyId, clock.now());

    const reloaded = await bills.findOne({ where: { id: freshBill.id } });
    expect(reloaded?.lateFeeApplied).toBe('0');
    expect(reloaded?.status).toBe('unpaid');
  });
});
