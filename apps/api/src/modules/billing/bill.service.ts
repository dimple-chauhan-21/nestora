import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bill } from '../../database/entities/bill.entity';
import { BillLineItem } from '../../database/entities/bill-line-item.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Resident } from '../../database/entities/resident.entity';
import { BillingPlan } from '../../database/entities/billing-plan.entity';
import { BillingPlanService } from './billing-plan.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from '../notification/notification-provider.interface';
import { CLOCK, type Clock } from '../../common/clock';
import { assertFlatMatch, assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

const DUE_DAYS_AFTER_BILLING_PERIOD = 10;

@Injectable()
export class BillService {
  private readonly logger = new Logger(BillService.name);

  constructor(
    @InjectRepository(Bill) private readonly bills: Repository<Bill>,
    @InjectRepository(BillLineItem) private readonly lineItems: Repository<BillLineItem>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    @InjectRepository(Resident) private readonly residents: Repository<Resident>,
    private readonly billingPlanService: BillingPlanService,
    private readonly auditService: AuditService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Idempotent per (flat_id, billing_period) — relies on the DB's UNIQUE
   * constraint (deliverable #2), not just the pre-check below. The pre-check
   * is a fast path to avoid a pointless INSERT attempt on the common case
   * (already generated); the try/catch below is what actually makes it safe
   * against a genuine concurrent double-call (two schedulers firing at once)
   * — the second insert violates the UNIQUE constraint, and we re-fetch and
   * return the row the other call created instead of erroring.
   */
  async generateForSociety(
    societyId: string,
    billingPeriod: string,
    scope: TenantScope,
    actorId: string,
  ): Promise<Bill[]> {
    assertSocietyMatch(societyId, scope);
    const plan = await this.billingPlanService.getActiveForSociety(societyId);
    const flats = await this.flats.find({ where: { societyId } });

    const results: Bill[] = [];
    for (const flat of flats) {
      if (flat.status === 'vacant') continue;
      results.push(await this.generateOneIdempotent(flat, plan, billingPeriod, actorId));
    }
    return results;
  }

  private async generateOneIdempotent(
    flat: Flat,
    plan: BillingPlan,
    billingPeriod: string,
    actorId: string,
  ): Promise<Bill> {
    const existing = await this.bills.findOne({ where: { flatId: flat.id, billingPeriod } });
    if (existing) return existing;

    const amountDue = await this.computeAmount(plan, flat);
    const dueDate = new Date(billingPeriod);
    dueDate.setDate(dueDate.getDate() + DUE_DAYS_AFTER_BILLING_PERIOD);

    try {
      const bill = this.bills.create({
        societyId: flat.societyId,
        flatId: flat.id,
        billingPeriod,
        amountDue,
        dueDate: dueDate.toISOString().slice(0, 10),
        status: 'unpaid',
      });
      await this.bills.save(bill);

      const lineItem = this.lineItems.create({
        societyId: flat.societyId,
        billId: bill.id,
        description: `Maintenance — ${billingPeriod}`,
        amount: amountDue,
      });
      await this.lineItems.save(lineItem);

      await this.auditService.record({
        actorId,
        societyId: flat.societyId,
        action: AUDIT_ACTIONS.BILL_GENERATED,
        entityType: 'bill',
        entityId: bill.id,
        afterState: { flatId: flat.id, billingPeriod, amountDue },
      });

      return bill;
    } catch {
      // UNIQUE (flat_id, billing_period) violation — a concurrent generate
      // call for the same period beat us to it. Return its row, don't error.
      const raced = await this.bills.findOne({ where: { flatId: flat.id, billingPeriod } });
      if (raced) return raced;
      throw new Error(`Failed to generate or find bill for flat ${flat.id} / ${billingPeriod}`);
    }
  }

  private async computeAmount(plan: BillingPlan, flat: Flat): Promise<string> {
    switch (plan.formulaType) {
      case 'flat_rate':
        return plan.rate;
      case 'per_sqft': {
        const area = Number(flat.areaSqft ?? 0);
        return (Number(plan.rate) * area).toFixed(2);
      }
      case 'per_head': {
        const headCount = await this.residents.count({ where: { flatId: flat.id, status: 'active' } });
        return (Number(plan.rate) * headCount).toFixed(2);
      }
    }
  }

  async listForFlat(flatId: string, scope: TenantScope): Promise<Bill[]> {
    const flat = await this.flats.findOne({ where: { id: flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    await this.applyLateFeesForOverdueBills(flat.societyId);

    return this.bills.find({ where: { flatId }, order: { billingPeriod: 'DESC' } });
  }

  async findByIdScoped(billId: string, scope: TenantScope): Promise<Bill> {
    const bill = await this.bills.findOne({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');
    assertSocietyMatch(bill.societyId, scope);
    const flat = await this.flats.findOne({ where: { id: bill.flatId } });
    if (flat) assertFlatMatch(flat.id, scope);
    return bill;
  }

  /**
   * §4's deliverable text applies to visitor escalation, but the same
   * "concrete trigger, not a vague poll" lesson applies here: this sweep
   * runs as a side effect of `listForFlat` (above) and
   * `FinancialReportService.getFinancialSummary` — both real, frequently-hit
   * read endpoints, not a cron that doesn't exist this session. Idempotent
   * per bill: only applies once (guarded by `late_fee_applied = 0`), so
   * repeated sweeps don't compound the fee.
   */
  async applyLateFeesForOverdueBills(societyId: string, asOf: Date = this.clock.now()): Promise<number> {
    let plan: BillingPlan;
    try {
      plan = await this.billingPlanService.getActiveForSociety(societyId);
    } catch {
      return 0; // no billing plan configured yet — nothing to apply
    }

    const overdue = await this.bills
      .createQueryBuilder('bill')
      .where('bill.society_id = :societyId', { societyId })
      .andWhere('bill.status IN (:...statuses)', { statuses: ['unpaid', 'partial'] })
      .andWhere('bill.late_fee_applied = 0')
      .andWhere(`bill.due_date + (:graceDays || ' days')::interval < :asOf`, {
        graceDays: plan.gracePeriodDays,
        asOf,
      })
      .getMany();

    for (const bill of overdue) {
      const lateFee = (Number(bill.amountDue) * (Number(plan.lateFeePct) / 100)).toFixed(2);

      bill.lateFeeApplied = lateFee;
      bill.amountDue = (Number(bill.amountDue) + Number(lateFee)).toFixed(2);
      bill.status = 'overdue';
      await this.bills.save(bill);

      const lineItem = this.lineItems.create({
        societyId,
        billId: bill.id,
        description: `Late fee (${plan.lateFeePct}%)`,
        amount: lateFee,
      });
      await this.lineItems.save(lineItem);

      await this.auditService.record({
        actorId: null,
        societyId,
        action: AUDIT_ACTIONS.BILL_LATE_FEE_APPLIED,
        entityType: 'bill',
        entityId: bill.id,
        afterState: { lateFee, newAmountDue: bill.amountDue },
      });

      await this.sendOverdueReminder(bill, lateFee);
    }

    return overdue.length;
  }

  /**
   * §9's "overdue reminder (escalating cadence)" — this session sends one
   * on each late-fee application (the sweep is already idempotent per
   * bill via `late_fee_applied = 0`, so this fires exactly once per bill,
   * not on every sweep). A push failure never blocks the late-fee logic
   * above, which has already committed by the time this runs.
   */
  private async sendOverdueReminder(bill: Bill, lateFee: string): Promise<void> {
    const resident = await this.residents.findOne({ where: { flatId: bill.flatId, status: 'active' } });
    if (!resident?.userId) return;

    try {
      await this.notifications.send({
        recipientUserId: resident.userId,
        channel: 'push',
        event: 'bill.overdue_reminder',
        title: 'Maintenance bill overdue',
        body: `A late fee of ₹${lateFee} has been applied. Total due: ₹${bill.amountDue}.`,
        data: { billId: bill.id, amountDue: bill.amountDue },
      });
    } catch (err) {
      // The late fee itself already committed above — a notification
      // failure must never unwind that. Logged, not swallowed silently.
      this.logger.error(`Failed to send overdue reminder for bill ${bill.id}: ${(err as Error).message}`);
    }
  }
}
