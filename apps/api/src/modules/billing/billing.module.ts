import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { BillingPlan } from '../../database/entities/billing-plan.entity';
import { Bill } from '../../database/entities/bill.entity';
import { BillLineItem } from '../../database/entities/bill-line-item.entity';
import { Payment } from '../../database/entities/payment.entity';
import { Receipt } from '../../database/entities/receipt.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Resident } from '../../database/entities/resident.entity';

import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

import { BillingPlanController } from './billing-plan.controller';
import { BillController } from './bill.controller';
import { WebhookController } from './webhook.controller';
import { FinancialReportController } from './financial-report.controller';

import { BillingPlanService } from './billing-plan.service';
import { BillService } from './bill.service';
import { PaymentService } from './payment.service';
import { WebhookService } from './webhook.service';
import { LedgerService } from './ledger.service';
import { FinancialReportService } from './financial-report.service';

import { PAYMENT_GATEWAY_PROVIDER } from './payment-gateway/payment-gateway-provider.interface';
import { StubPaymentGatewayProvider } from './payment-gateway/stub-payment-gateway.provider';

import { CLOCK, SystemClock } from '../../common/clock';

@Module({
  imports: [
    TenantScopedTypeOrmModule.forFeature([BillingPlan, Bill, BillLineItem, Payment, Receipt, LedgerEntry, Flat, Resident]),
    AuditModule,
    NotificationModule,
  ],
  controllers: [BillingPlanController, BillController, WebhookController, FinancialReportController],
  providers: [
    BillingPlanService,
    BillService,
    PaymentService,
    WebhookService,
    LedgerService,
    FinancialReportService,
    StubPaymentGatewayProvider,
    { provide: PAYMENT_GATEWAY_PROVIDER, useExisting: StubPaymentGatewayProvider },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [BillService, PaymentService, LedgerService],
})
export class BillingModule {}
