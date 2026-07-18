import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Payment } from '../../database/entities/payment.entity';
import { Bill } from '../../database/entities/bill.entity';
import { Receipt } from '../../database/entities/receipt.entity';
import { StubPaymentGatewayProvider } from './payment-gateway/stub-payment-gateway.provider';
import { LedgerService } from './ledger.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';

export interface WebhookRequestContext {
  ip: string | null;
  userAgent: string | null;
}

interface GatewayWebhookPayload {
  event: string;
  payload: {
    gatewayRef: string;
    status: 'success' | 'failed';
  };
}

@Injectable()
export class WebhookService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gatewayProvider: StubPaymentGatewayProvider,
    private readonly ledgerService: LedgerService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Signature verified BEFORE anything touches the payments table — an
   * invalid signature never mutates a row. Valid-but-unprocessable payloads
   * (unknown gatewayRef) and already-processed replays are both handled
   * without erroring the caller (a real gateway would just see a 200 and
   * stop retrying either way).
   *
   * The core status flip + side effects run as a single atomic operation:
   * `UPDATE ... WHERE status = 'pending' RETURNING *` inside one DB
   * transaction that also posts the ledger entry and receipt. This is what
   * makes concurrent webhook deliveries for the same gatewayRef safe (the
   * second one's UPDATE matches zero rows once the first has committed) and
   * what makes a mid-transaction failure recoverable (rollback reverts the
   * status flip too, so a retried webhook still matches `status='pending'`).
   */
  async handlePaymentWebhook(rawBody: Buffer, signature: string | undefined, ctx: WebhookRequestContext): Promise<{ status: string }> {
    const isValid = !!signature && this.gatewayProvider.verifyWebhookSignature(rawBody, signature);

    let payload: GatewayWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed webhook payload');
    }
    const gatewayRef = payload?.payload?.gatewayRef;

    // The queryRunner (and its platform-scope session var) is created
    // before signature verification and used for every path below,
    // including the rejection paths — this is a single unauthenticated,
    // HMAC-verified, system-level caller throughout, not a tenant user, and
    // every audit_logs write it makes needs the same RLS treatment as the
    // payments lookup does (same chicken-and-egg PermissionsService.resolve()
    // has at login: it doesn't know which society it's dealing with,
    // sometimes never does, until it looks). Previously only the final
    // "confirmed" path's audit write went through this transaction's own
    // manager — the other three used the ambient per-HTTP-request
    // connection instead, which is a *different*, un-platform-scoped
    // connection for this same unauthenticated request. That inconsistency
    // was harmless while RLS was inert; it isn't anymore.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    await queryRunner.query(`SELECT set_config('app.is_platform_scope', 'true', true)`);
    let committed = false;

    try {
      const manager = queryRunner.manager;

      if (!isValid) {
        await this.auditService.record(
          {
            actorId: null,
            societyId: null,
            action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_REJECTED,
            entityType: 'payment',
            entityId: null,
            afterState: { gatewayRef: gatewayRef ?? null, reason: 'invalid_signature' },
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          },
          manager,
        );
        await queryRunner.commitTransaction();
        committed = true;
        throw new UnauthorizedException('Invalid webhook signature');
      }

      if (!gatewayRef) {
        throw new BadRequestException('Missing gatewayRef in webhook payload');
      }

      const paymentRepo = manager.getRepository(Payment);

      // `payments`' RLS policy (migration 1700000000019) has a
      // platform-scope bypass specifically for this lookup. Every OTHER
      // table this transaction touches (bills/receipts/ledger_entries/
      // audit_logs) keeps its plain, unwidened policy — narrowed to the
      // resolved society below instead, once it's known.
      const updateResult = await paymentRepo
        .createQueryBuilder()
        .update(Payment)
        .set({ status: 'success', paidAt: new Date() })
        .where('gateway_ref = :gatewayRef AND status = :pending', { gatewayRef, pending: 'pending' })
        .execute();

      if (updateResult.affected === 0) {
        const existing = await paymentRepo.findOne({ where: { gatewayRef } });
        if (existing) {
          await queryRunner.query(`SELECT set_config('app.current_society_id', $1, true)`, [existing.societyId]);
        }

        if (!existing) {
          await this.auditService.record(
            {
              actorId: null,
              societyId: null,
              action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_UNKNOWN_REF,
              entityType: 'payment',
              entityId: null,
              afterState: { gatewayRef },
              ip: ctx.ip,
              userAgent: ctx.userAgent,
            },
            manager,
          );
          await queryRunner.commitTransaction();
          committed = true;
          throw new NotFoundException(`No payment session found for gatewayRef ${gatewayRef}`);
        }

        // Replay of an already-processed webhook — idempotent no-op.
        await this.auditService.record(
          {
            actorId: null,
            societyId: existing.societyId,
            action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_REPLAYED,
            entityType: 'payment',
            entityId: existing.id,
            afterState: { gatewayRef, status: existing.status },
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          },
          manager,
        );
        await queryRunner.commitTransaction();
        committed = true;
        return { status: 'already_processed' };
      }

      // Re-fetch through the repository for proper entity hydration —
      // `.returning('*')`'s raw result is snake_case DB columns, not mapped
      // to camelCase entity properties, and reading it directly here would
      // silently produce `undefined` for billId/gatewayRef/etc. This read
      // happens inside the same still-open transaction, so it sees the
      // update we just made (a transaction always sees its own writes). It
      // still runs under the platform-scope bypass (society not narrowed
      // yet) since that's still the only way `payments` RLS lets this
      // gatewayRef-only lookup through.
      const payment = await paymentRepo.findOneOrFail({ where: { gatewayRef } });

      // Every write from here on is scoped to this one resolved society —
      // no more platform-scope bypass needed, `bills`/`receipts`/
      // `ledger_entries`/`audit_logs` all use their plain, unwidened policies.
      await queryRunner.query(`SELECT set_config('app.current_society_id', $1, true)`, [payment.societyId]);

      const billRepo = manager.getRepository(Bill);
      const bill = await billRepo.findOne({ where: { id: payment.billId } });
      if (!bill) throw new NotFoundException('Bill for this payment no longer exists');

      const newAmountPaid = (Number(bill.amountPaid) + Number(payment.amount)).toFixed(2);
      bill.amountPaid = newAmountPaid;
      bill.status = Number(newAmountPaid) >= Number(bill.amountDue) ? 'paid' : 'partial';
      await billRepo.save(bill);

      await this.ledgerService.post(
        {
          societyId: payment.societyId,
          entryType: 'income',
          category: 'maintenance_payment',
          amount: payment.amount,
          referenceType: 'payment',
          referenceId: payment.id,
          createdBy: null,
        },
        manager,
      );

      const receiptRepo = manager.getRepository(Receipt);
      const receipt = receiptRepo.create({
        societyId: payment.societyId,
        paymentId: payment.id,
        receiptNumber: `RCPT-${payment.id.slice(0, 8).toUpperCase()}`,
        pdfUrl: null,
      });
      await receiptRepo.save(receipt);

      await this.auditService.record(
        {
          actorId: null,
          societyId: payment.societyId,
          action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_CONFIRMED,
          entityType: 'payment',
          entityId: payment.id,
          afterState: { gatewayRef, amount: payment.amount, billId: bill.id, billStatus: bill.status },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        manager,
      );

      await queryRunner.commitTransaction();
      committed = true;
      return { status: 'confirmed' };
    } catch (err) {
      if (!committed) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
