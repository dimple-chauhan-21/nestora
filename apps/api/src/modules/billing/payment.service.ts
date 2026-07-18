import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bill } from '../../database/entities/bill.entity';
import { Payment } from '../../database/entities/payment.entity';
import { Receipt } from '../../database/entities/receipt.entity';
import { BillService } from './bill.service';
import { LedgerService } from './ledger.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import {
  PAYMENT_GATEWAY_PROVIDER,
  type PaymentGatewayProvider,
  type PaymentSession,
} from './payment-gateway/payment-gateway-provider.interface';
import { assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { RecordOfflinePaymentDto } from './dto/record-offline-payment.dto';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Bill) private readonly bills: Repository<Bill>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Receipt) private readonly receipts: Repository<Receipt>,
    private readonly billService: BillService,
    private readonly ledgerService: LedgerService,
    private readonly auditService: AuditService,
    @Inject(PAYMENT_GATEWAY_PROVIDER) private readonly gatewayProvider: PaymentGatewayProvider,
  ) {}

  async initiatePayment(billId: string, scope: TenantScope, actorId: string): Promise<PaymentSession> {
    const bill = await this.billService.findByIdScoped(billId, scope);
    if (bill.status === 'paid') {
      throw new BadRequestException('Bill is already fully paid');
    }

    const amountRemaining = (Number(bill.amountDue) - Number(bill.amountPaid)).toFixed(2);
    const session = await this.gatewayProvider.createSession({
      societyId: bill.societyId,
      billId: bill.id,
      amount: amountRemaining,
      currency: bill.currency,
    });

    await this.auditService.record({
      actorId,
      societyId: bill.societyId,
      action: AUDIT_ACTIONS.PAYMENT_SESSION_INITIATED,
      entityType: 'bill',
      entityId: bill.id,
      afterState: { gatewayRef: session.gatewayRef, amount: amountRemaining },
    });

    return session;
  }

  /**
   * Accountant-recorded cash/cheque/bank-transfer payment — distinct from
   * the webhook-confirmed online path (deliverable #6). `reconciled`
   * defaults false: the payment is recorded immediately (resident gets
   * credit right away) but flagged for the Accountant's bank-statement
   * reconciliation pass, a separate later step not built this session.
   */
  async recordOfflinePayment(
    billId: string,
    dto: RecordOfflinePaymentDto,
    scope: TenantScope,
    actorId: string,
  ): Promise<Payment> {
    const bill = await this.billService.findByIdScoped(billId, scope);

    const amountRemaining = Number(bill.amountDue) - Number(bill.amountPaid);
    if (dto.amount > amountRemaining) {
      throw new BadRequestException(
        `Payment amount ${dto.amount} exceeds remaining balance ${amountRemaining.toFixed(2)}`,
      );
    }

    const payment = this.payments.create({
      societyId: bill.societyId,
      billId: bill.id,
      amount: String(dto.amount),
      currency: bill.currency,
      method: dto.method,
      gatewayRef: null,
      status: 'success',
      reconciled: false,
      paidAt: new Date(),
      recordedBy: actorId,
    });
    await this.payments.save(payment);

    const newAmountPaid = (Number(bill.amountPaid) + dto.amount).toFixed(2);
    bill.amountPaid = newAmountPaid;
    bill.status = Number(newAmountPaid) >= Number(bill.amountDue) ? 'paid' : 'partial';
    await this.bills.save(bill);

    await this.ledgerService.post({
      societyId: bill.societyId,
      entryType: 'income',
      category: 'maintenance_payment_offline',
      amount: payment.amount,
      referenceType: 'payment',
      referenceId: payment.id,
      createdBy: actorId,
    });

    const receipt = this.receipts.create({
      societyId: bill.societyId,
      paymentId: payment.id,
      receiptNumber: `RCPT-${payment.id.slice(0, 8).toUpperCase()}`,
      pdfUrl: null,
    });
    await this.receipts.save(receipt);

    await this.auditService.record({
      actorId,
      societyId: bill.societyId,
      action: AUDIT_ACTIONS.PAYMENT_RECORDED_OFFLINE,
      entityType: 'payment',
      entityId: payment.id,
      afterState: { billId: bill.id, amount: payment.amount, method: dto.method, reconciled: false },
    });

    return payment;
  }

  async findReceiptForPayment(paymentId: string, scope: TenantScope): Promise<Receipt> {
    const receipt = await this.receipts.findOne({ where: { paymentId } });
    if (!receipt) throw new NotFoundException('Receipt not found');
    assertSocietyMatch(receipt.societyId, scope);
    return receipt;
  }
}
