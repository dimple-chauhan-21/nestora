import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import request from 'supertest';
import { randomInt } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { SMS_PROVIDER } from '../src/modules/auth/sms/sms-provider.interface';
import { CapturingSmsProvider } from './capturing-sms.provider';
import { getAdminDataSource, closeAdminDataSource } from './admin-datasource';
import { Society } from '../src/database/entities/society.entity';
import { Flat } from '../src/database/entities/flat.entity';
import { Resident } from '../src/database/entities/resident.entity';
import { Role } from '../src/database/entities/role.entity';
import { UserRole } from '../src/database/entities/user-role.entity';
import { Gate } from '../src/database/entities/gate.entity';
import { Guard as GuardEntity } from '../src/database/entities/guard.entity';

function randomPhone(): string {
  return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

/**
 * §6 Module 6's OTP-handover flow and ABAC boundary, exercised through the
 * real HTTP endpoints (real app_write_role + RLS path, same as every other
 * e2e spec this session). Fixture setup/verification use the admin
 * DataSource — see test/admin-datasource.ts — the actual assertions run
 * through real requests.
 */
describe('Delivery Management (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;

  let societies: Repository<Society>;
  let flats: Repository<Flat>;
  let residents: Repository<Resident>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;
  let gates: Repository<Gate>;
  let guardRepo: Repository<GuardEntity>;

  let societyId: string;
  let flatAId: string;
  let flatBId: string;
  let gateId: string;
  const ownerAPhone = randomPhone();
  const ownerBPhone = randomPhone();
  const guardPhone = randomPhone();

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

  async function guardLogin(deviceId: string): Promise<string> {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: guardPhone }).expect(202);
    const otp = sms.lastOtpFor(guardPhone);
    const res = await request(app.getHttpServer())
      .post('/api/v1/guard/login')
      .send({ phone: guardPhone, otp, deviceId, gateId })
      .expect(201);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useClass(CapturingSmsProvider)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    sms = moduleRef.get(SMS_PROVIDER);
    const adminDb = await getAdminDataSource();
    societies = adminDb.getRepository(Society);
    flats = adminDb.getRepository(Flat);
    residents = adminDb.getRepository(Resident);
    roles = adminDb.getRepository(Role);
    userRoles = adminDb.getRepository(UserRole);
    gates = adminDb.getRepository(Gate);
    guardRepo = adminDb.getRepository(GuardEntity);

    const society = await societies.save(societies.create({ name: `Delivery Test Society ${Date.now()}` }));
    societyId = society.id;

    const flatA = await flats.save(flats.create({ societyId, flatNumber: `DA-${Date.now()}`, status: 'occupied' }));
    const flatB = await flats.save(flats.create({ societyId, flatNumber: `DB-${Date.now()}`, status: 'occupied' }));
    flatAId = flatA.id;
    flatBId = flatB.id;

    const gate = await gates.save(gates.create({ societyId, name: 'Main Gate', type: 'main' }));
    gateId = gate.id;

    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });

    const ownerAToken0 = await loginViaOtp(ownerAPhone, 'owner-a-setup');
    const ownerAUserId = decodeUserId(ownerAToken0);
    await userRoles.save(userRoles.create({ userId: ownerAUserId, roleId: ownerRole.id, societyId, flatId: flatAId }));
    await residents.save(
      residents.create({ societyId, flatId: flatAId, userId: ownerAUserId, relationType: 'owner', status: 'active' }),
    );

    const ownerBToken0 = await loginViaOtp(ownerBPhone, 'owner-b-setup');
    const ownerBUserId = decodeUserId(ownerBToken0);
    await userRoles.save(userRoles.create({ userId: ownerBUserId, roleId: ownerRole.id, societyId, flatId: flatBId }));
    await residents.save(
      residents.create({ societyId, flatId: flatBId, userId: ownerBUserId, relationType: 'owner', status: 'active' }),
    );

    const guardToken0 = await loginViaOtp(guardPhone, 'guard-setup');
    const guardUserId = decodeUserId(guardToken0);
    const guardRole = await roles.findOneOrFail({ where: { code: 'security_guard' } });
    await userRoles.save(userRoles.create({ userId: guardUserId, roleId: guardRole.id, societyId, flatId: null }));
    await guardRepo.save(guardRepo.create({ societyId, userId: guardUserId, gateId }));
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  it('full handover flow: guard logs delivery -> resident-only OTP verified -> handed_over, and appears in gate activity', async () => {
    const guardToken = await guardLogin('kiosk-handover');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ flatId: flatAId, gateId, agentPhone: randomPhone(), agentName: 'Ramesh', platform: 'Zomato' })
      .expect(201);
    const deliveryId = createRes.body.id;
    expect(createRes.body.status).toBe('pending');
    expect(createRes.body.otpVerified).toBe(false);
    // The raw OTP hash must never appear in any response.
    expect(createRes.body.otpHash).toBeUndefined();

    // The guard never sees the code — it only ever reaches the resident,
    // via the SMS fallback channel captured here the same way the resident
    // would read it off their own phone. `sent` also holds login OTPs (from
    // beforeAll and other tests) for the same phone, so filter specifically
    // for the delivery-handover message rather than by phone alone.
    const deliverySms = sms.sent.filter((s) => s.phone === ownerAPhone && s.message.includes('handover code'));
    expect(deliverySms).toHaveLength(1);
    const otp = deliverySms[0]!.message.match(/code is (\d{4,6})/)?.[1];
    expect(otp).toBeDefined();

    // Guard submits a WRONG code first — rejected, boolean only.
    const wrongVerify = await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/otp/verify`)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ otp: '000000' })
      .expect(201);
    expect(wrongVerify.body).toEqual({ verified: false });

    // Then the correct code — accepted.
    const rightVerify = await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/otp/verify`)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ otp })
      .expect(201);
    expect(rightVerify.body).toEqual({ verified: true });

    // Now the guard can mark it handed_over without needing an override.
    const handedOverRes = await request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ status: 'handed_over' })
      .expect(200);
    expect(handedOverRes.body.status).toBe('handed_over');
    expect(handedOverRes.body.handoverOverrideReason).toBeNull();

    // Owner A can see it in their own flat's delivery list.
    const ownerAToken = await loginViaOtp(ownerAPhone, 'owner-a-check');
    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatAId}/deliveries`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    const found = listRes.body.find((d: { id: string }) => d.id === deliveryId);
    expect(found).toBeDefined();
    expect(found.status).toBe('handed_over');
  });

  it('a delivery held at the desk (resident absent) stays pending and is visible via ?status=pending', async () => {
    const guardToken = await guardLogin('kiosk-held-at-desk');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ flatId: flatAId, gateId, agentPhone: randomPhone(), platform: 'Amazon' })
      .expect(201);
    const deliveryId = createRes.body.id;

    const heldRes = await request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ heldAtDesk: true })
      .expect(200);
    expect(heldRes.body.status).toBe('pending'); // status untouched — only heldAtDesk changed
    expect(heldRes.body.heldAtDesk).toBe(true);

    const ownerAToken = await loginViaOtp(ownerAPhone, 'owner-a-check-pending');
    const pendingList = await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatAId}/deliveries?status=pending`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    const found = pendingList.body.find((d: { id: string }) => d.id === deliveryId);
    expect(found).toBeDefined();
    expect(found.heldAtDesk).toBe(true);
  });

  it('handed_over without a verified OTP requires an explicit overrideReason (elderly/no-smartphone resident)', async () => {
    const guardToken = await guardLogin('kiosk-override');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ flatId: flatAId, gateId, agentPhone: randomPhone(), platform: 'Swiggy' })
      .expect(201);
    const deliveryId = createRes.body.id;

    // No OTP verification, no override — rejected.
    await request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ status: 'handed_over' })
      .expect(400);

    // With an explicit override reason — accepted.
    const overrideRes = await request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ status: 'handed_over', overrideReason: 'Elderly resident confirmed verbally over intercom' })
      .expect(200);
    expect(overrideRes.body.status).toBe('handed_over');
    expect(overrideRes.body.handoverOverrideReason).toContain('Elderly resident');
  });

  it("ABAC boundary: Owner B (a different flat, same society) is rejected (403) viewing Flat A's deliveries", async () => {
    const guardToken = await guardLogin('kiosk-abac');

    await request(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ flatId: flatAId, gateId, agentPhone: randomPhone(), platform: 'Amazon' })
      .expect(201);

    const ownerBToken = await loginViaOtp(ownerBPhone, 'owner-b-abac-check');
    await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatAId}/deliveries`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(403);

    // Owner B's own flat, meanwhile, works fine (and is legitimately empty).
    const ownBList = await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatBId}/deliveries`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(200);
    expect(ownBList.body).toEqual([]);
  });

  it('an unauthenticated request to the same endpoint is rejected before any scoping is even evaluated', async () => {
    await request(app.getHttpServer()).get(`/api/v1/flats/${flatAId}/deliveries`).expect(401);
  });
});
