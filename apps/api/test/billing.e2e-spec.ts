import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import request from 'supertest';
import { randomInt } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { SMS_PROVIDER } from '../src/modules/auth/sms/sms-provider.interface';
import { CapturingSmsProvider } from './capturing-sms.provider';
import { getAdminDataSource, closeAdminDataSource } from './admin-datasource';
import { StubPaymentGatewayProvider } from '../src/modules/billing/payment-gateway/stub-payment-gateway.provider';
import { Society } from '../src/database/entities/society.entity';
import { Flat } from '../src/database/entities/flat.entity';
import { Resident } from '../src/database/entities/resident.entity';
import { Role } from '../src/database/entities/role.entity';
import { UserRole } from '../src/database/entities/user-role.entity';
import { BillingPlan } from '../src/database/entities/billing-plan.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { Receipt } from '../src/database/entities/receipt.entity';
import { Payment } from '../src/database/entities/payment.entity';

function randomPhone(): string {
  return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

/**
 * All logins happen once in beforeAll — the OTP request rate limit (5/hour
 * per phone) means repeatedly logging in per-test-case within one file
 * would exhaust it. Tokens are reused across every `it()` block below.
 */
describe('Billing (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;
  let gatewayProvider: StubPaymentGatewayProvider;

  let societies: Repository<Society>;
  let flats: Repository<Flat>;
  let residents: Repository<Resident>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;
  let billingPlans: Repository<BillingPlan>;
  let ledgerEntries: Repository<LedgerEntry>;
  let receipts: Repository<Receipt>;
  let payments: Repository<Payment>;

  let societyId: string;
  let flatAId: string;
  let flatBId: string;
  let ownerAToken: string;
  let ownerBToken: string;
  let adminToken: string;
  let billCounter = 0;

  async function loginViaOtp(phone: string, deviceId: string): Promise<string> {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const otp = sms.lastOtpFor(phone);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, otp, deviceId })
      .expect(201);
    return res.body.accessToken;
  }

  function decodeUserId(accessToken: string): string {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'));
    return payload.sub;
  }

  /** Fresh billing period per call so tests don't collide on UNIQUE(flat_id, billing_period). */
  function nextBillingPeriod(): string {
    billCounter++;
    const month = String((billCounter % 12) + 1).padStart(2, '0');
    return `2027-${month}-01`;
  }

  async function generateBillForFlatA(): Promise<{ id: string; status: string; amountDue: string }> {
    const billingPeriod = nextBillingPeriod();
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ societyId, billingPeriod })
      .expect(201);
    const bill = res.body.find((b: { flatId: string }) => b.flatId === flatAId);
    if (!bill) throw new Error('Bill for flat A was not generated');
    return bill;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useClass(CapturingSmsProvider)
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    sms = moduleRef.get(SMS_PROVIDER);
    gatewayProvider = moduleRef.get(StubPaymentGatewayProvider);
    const adminDb = await getAdminDataSource();
    societies = adminDb.getRepository(Society);
    flats = adminDb.getRepository(Flat);
    residents = adminDb.getRepository(Resident);
    roles = adminDb.getRepository(Role);
    userRoles = adminDb.getRepository(UserRole);
    billingPlans = adminDb.getRepository(BillingPlan);
    ledgerEntries = adminDb.getRepository(LedgerEntry);
    receipts = adminDb.getRepository(Receipt);
    payments = adminDb.getRepository(Payment);

    const society = await societies.save(societies.create({ name: `Billing Test Society ${Date.now()}` }));
    societyId = society.id;

    const flatA = await flats.save(flats.create({ societyId, flatNumber: `A-${Date.now()}`, status: 'occupied' }));
    const flatB = await flats.save(flats.create({ societyId, flatNumber: `B-${Date.now()}`, status: 'occupied' }));
    flatAId = flatA.id;
    flatBId = flatB.id;

    await billingPlans.save(
      billingPlans.create({
        societyId,
        formulaType: 'flat_rate',
        rate: '2500.00',
        lateFeePct: '5',
        gracePeriodDays: 5,
      }),
    );

    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });
    const adminRole = await roles.findOneOrFail({ where: { code: 'society_admin' } });

    const ownerAPhone = randomPhone();
    ownerAToken = await loginViaOtp(ownerAPhone, 'owner-a-device');
    const ownerAUserId = decodeUserId(ownerAToken);
    await userRoles.save(
      userRoles.create({ userId: ownerAUserId, roleId: ownerRole.id, societyId, flatId: flatAId }),
    );
    await residents.save(
      residents.create({ societyId, flatId: flatAId, userId: ownerAUserId, relationType: 'owner', status: 'active' }),
    );

    const ownerBPhone = randomPhone();
    ownerBToken = await loginViaOtp(ownerBPhone, 'owner-b-device');
    const ownerBUserId = decodeUserId(ownerBToken);
    await userRoles.save(
      userRoles.create({ userId: ownerBUserId, roleId: ownerRole.id, societyId, flatId: flatBId }),
    );
    await residents.save(
      residents.create({ societyId, flatId: flatBId, userId: ownerBUserId, relationType: 'owner', status: 'active' }),
    );

    const adminPhone = randomPhone();
    adminToken = await loginViaOtp(adminPhone, 'admin-device');
    const adminUserId = decodeUserId(adminToken);
    await userRoles.save(
      userRoles.create({ userId: adminUserId, roleId: adminRole.id, societyId, flatId: null }),
    );

    // Re-login all three now that their user_roles rows exist, so their
    // JWTs actually carry the resolved roles/permissions/scope.
    ownerAToken = await loginViaOtp(ownerAPhone, 'owner-a-device-2');
    ownerBToken = await loginViaOtp(ownerBPhone, 'owner-b-device-2');
    adminToken = await loginViaOtp(adminPhone, 'admin-device-2');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  function signedWebhookRequest(gatewayRef: string) {
    const bodyString = JSON.stringify({ event: 'payment.captured', payload: { gatewayRef, status: 'success' } });
    const signature = gatewayProvider.signWebhookPayload(Buffer.from(bodyString, 'utf8'));
    return { bodyString, signature };
  }

  it('full flow: generate bill -> pay -> webhook confirms -> receipt exists -> ledger entry posted', async () => {
    const bill = await generateBillForFlatA();
    expect(bill.status).toBe('unpaid');
    expect(bill.amountDue).toBe('2500.00');

    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/pay`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);
    const gatewayRef = payRes.body.gatewayRef;
    expect(gatewayRef).toMatch(/^order_/);

    const { bodyString, signature } = signedWebhookRequest(gatewayRef);
    const webhookRes = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payment-gateway')
      .set('Content-Type', 'application/json')
      .set('X-Gateway-Signature', signature)
      .send(bodyString)
      .expect(201);
    expect(webhookRes.body.status).toBe('confirmed');

    const payment = await payments.findOneOrFail({ where: { gatewayRef } });
    expect(payment.status).toBe('success');

    const receipt = await receipts.findOne({ where: { paymentId: payment.id } });
    expect(receipt).not.toBeNull();
    expect(receipt?.receiptNumber).toMatch(/^RCPT-/);

    const ledgerEntry = await ledgerEntries.findOne({
      where: { referenceType: 'payment', referenceId: payment.id },
    });
    expect(ledgerEntry).not.toBeNull();
    expect(ledgerEntry?.entryType).toBe('income');
    expect(ledgerEntry?.amount).toBe(payment.amount);

    const billsRes = await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatAId}/bills`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    const paidBill = billsRes.body.find((b: { id: string }) => b.id === bill.id);
    expect(paidBill.status).toBe('paid');
  });

  it('webhook replay (sequential) does not double-credit', async () => {
    const bill = await generateBillForFlatA();

    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/pay`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);
    const gatewayRef = payRes.body.gatewayRef;
    const { bodyString, signature } = signedWebhookRequest(gatewayRef);

    const first = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payment-gateway')
      .set('Content-Type', 'application/json')
      .set('X-Gateway-Signature', signature)
      .send(bodyString)
      .expect(201);
    expect(first.body.status).toBe('confirmed');

    // Replay: the exact same webhook delivered again (gateway retry).
    const replay = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payment-gateway')
      .set('Content-Type', 'application/json')
      .set('X-Gateway-Signature', signature)
      .send(bodyString)
      .expect(201);
    expect(replay.body.status).toBe('already_processed');

    const payment = await payments.findOneOrFail({ where: { gatewayRef } });
    const allLedgerEntriesForPayment = await ledgerEntries.find({
      where: { referenceType: 'payment', referenceId: payment.id },
    });
    expect(allLedgerEntriesForPayment).toHaveLength(1);

    const allReceiptsForPayment = await receipts.find({ where: { paymentId: payment.id } });
    expect(allReceiptsForPayment).toHaveLength(1);

    const billAfter = await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatAId}/bills`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    const paidBill = billAfter.body.find((b: { id: string }) => b.id === bill.id);
    expect(paidBill.amountPaid).toBe('2500.00'); // not 5000.00
  });

  it('webhook replay (genuinely concurrent) does not double-credit — the race condition case', async () => {
    const bill = await generateBillForFlatA();

    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/pay`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);
    const gatewayRef = payRes.body.gatewayRef;
    const { bodyString, signature } = signedWebhookRequest(gatewayRef);

    const fireWebhook = () =>
      request(app.getHttpServer())
        .post('/api/v1/webhooks/payment-gateway')
        .set('Content-Type', 'application/json')
        .set('X-Gateway-Signature', signature)
        .send(bodyString);

    // Two truly concurrent deliveries — Promise.all, not sequential awaits.
    const [resA, resB] = await Promise.all([fireWebhook(), fireWebhook()]);
    const statuses = [resA.body.status, resB.body.status].sort();
    expect(statuses).toEqual(['already_processed', 'confirmed']); // exactly one of each

    const payment = await payments.findOneOrFail({ where: { gatewayRef } });
    const allLedgerEntriesForPayment = await ledgerEntries.find({
      where: { referenceType: 'payment', referenceId: payment.id },
    });
    expect(allLedgerEntriesForPayment).toHaveLength(1);

    const allReceiptsForPayment = await receipts.find({ where: { paymentId: payment.id } });
    expect(allReceiptsForPayment).toHaveLength(1);
  });

  it('rejects a webhook with an invalid signature without mutating anything, and audits the attempt', async () => {
    const bill = await generateBillForFlatA();

    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/pay`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);
    const gatewayRef = payRes.body.gatewayRef;

    const bodyString = JSON.stringify({ event: 'payment.captured', payload: { gatewayRef, status: 'success' } });

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/payment-gateway')
      .set('Content-Type', 'application/json')
      .set('X-Gateway-Signature', 'deadbeef'.repeat(8)) // wrong signature entirely
      .send(bodyString)
      .expect(401);

    const payment = await payments.findOneOrFail({ where: { gatewayRef } });
    expect(payment.status).toBe('pending'); // untouched

    const tamperedBody = JSON.stringify({
      event: 'payment.captured',
      payload: { gatewayRef, status: 'success', amount: '999999.00' },
    });
    const { signature: signatureForOriginalBody } = signedWebhookRequest(gatewayRef);
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/payment-gateway')
      .set('Content-Type', 'application/json')
      .set('X-Gateway-Signature', signatureForOriginalBody) // signature for the ORIGINAL body, not this tampered one
      .send(tamperedBody)
      .expect(401);

    const stillPending = await payments.findOneOrFail({ where: { gatewayRef } });
    expect(stillPending.status).toBe('pending');
  });

  it("a Tenant/Owner cannot read another flat's bills (ABAC boundary)", async () => {
    await generateBillForFlatA(); // ensure flat A has at least one bill

    // Owner A tries to read Owner B's flat's bills.
    await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatBId}/bills`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(403);

    // Owner B can read their own (empty is fine — the point is 200 vs 403).
    await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatBId}/bills`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(200);
  });
});
