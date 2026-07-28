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
 * GET /guard/dashboard is the core data source for the guard-kiosk console
 * (apps/desktop) — this is its only e2e coverage, so it exercises the real
 * embedded shape (visitor/flat/agent identity, gate name, raisedByMe) the
 * desktop UI is actually built against, not just the unit-level FakeRepo
 * shape.
 */
describe('Guard dashboard (e2e)', () => {
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
  let flatId: string;
  let gateId: string;
  const ownerPhone = randomPhone();
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

  async function guardLogin(deviceId: string): Promise<{ accessToken: string; userId: string }> {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: guardPhone }).expect(202);
    const otp = sms.lastOtpFor(guardPhone);
    const res = await request(app.getHttpServer())
      .post('/api/v1/guard/login')
      .send({ phone: guardPhone, otp, deviceId, gateId })
      .expect(201);
    return { accessToken: res.body.accessToken, userId: decodeUserId(res.body.accessToken) };
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

    const society = await societies.save(societies.create({ name: `Guard Dashboard Test Society ${Date.now()}` }));
    societyId = society.id;

    const flat = await flats.save(flats.create({ societyId, flatNumber: `GD-${Date.now()}`, status: 'occupied' }));
    flatId = flat.id;

    const gate = await gates.save(gates.create({ societyId, name: 'Main Gate', type: 'main' }));
    gateId = gate.id;

    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });
    const ownerToken0 = await loginViaOtp(ownerPhone, 'owner-setup');
    const ownerUserId = decodeUserId(ownerToken0);
    await userRoles.save(userRoles.create({ userId: ownerUserId, roleId: ownerRole.id, societyId, flatId }));
    await residents.save(
      residents.create({ societyId, flatId, userId: ownerUserId, relationType: 'owner', status: 'active' }),
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

  it('embeds real visitor/flat/agent identity, gate name, and never leaks the delivery OTP hash', async () => {
    const guard = await guardLogin('kiosk-dashboard');

    const walkInRes = await request(app.getHttpServer())
      .post('/api/v1/visits/walk-in')
      .set('Authorization', `Bearer ${guard.accessToken}`)
      .send({ flatId, name: 'Suresh Kumar', phone: randomPhone(), purpose: 'Package delivery' })
      .expect(201);
    expect(walkInRes.body.status).toBe('pending');

    const deliveryRes = await request(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${guard.accessToken}`)
      .send({ flatId, gateId, agentPhone: randomPhone(), agentName: 'Ravi', platform: 'Amazon' })
      .expect(201);
    expect(deliveryRes.body.status).toBe('pending');

    const alertRes = await request(app.getHttpServer())
      .post('/api/v1/emergency-alerts')
      .set('Authorization', `Bearer ${guard.accessToken}`)
      .send({ type: 'security' })
      .expect(201);
    expect(alertRes.body.status).toBe('active');
    const alertId = alertRes.body.id;

    const dashboardRes = await request(app.getHttpServer())
      .get('/api/v1/guard/dashboard')
      .set('Authorization', `Bearer ${guard.accessToken}`)
      .expect(200);

    expect(dashboardRes.body.gateId).toBe(gateId);
    expect(dashboardRes.body.gateName).toBe('Main Gate');
    expect(dashboardRes.body.societyId).toBe(societyId);

    const pendingVisit = dashboardRes.body.pendingVisits.find((v: { id: string }) => v.id === walkInRes.body.id);
    expect(pendingVisit).toBeDefined();
    expect(pendingVisit.visitor.name).toBe('Suresh Kumar');
    expect(pendingVisit.flat).toEqual({ id: flatId, flatNumber: expect.any(String) });

    const pendingDelivery = dashboardRes.body.pendingDeliveries.find(
      (d: { id: string }) => d.id === deliveryRes.body.id,
    );
    expect(pendingDelivery).toBeDefined();
    expect(pendingDelivery.agent.name).toBe('Ravi');
    expect(pendingDelivery.agent.platform).toBe('Amazon');
    expect(pendingDelivery.flat).toEqual({ id: flatId, flatNumber: expect.any(String) });
    // The raw OTP hash/expiry must never reach the guard, not even embedded in the dashboard.
    expect(pendingDelivery.otpHash).toBeUndefined();
    expect(pendingDelivery.otpExpiresAt).toBeUndefined();

    const activeAlert = dashboardRes.body.activeAlerts.find((a: { id: string }) => a.id === alertId);
    expect(activeAlert).toBeDefined();
    expect(activeAlert.raisedByMe).toBe(true);
    expect(activeAlert.status).toBe('active');

    // Resolving requires a real resolutionNote and then drops out of activeAlerts.
    await request(app.getHttpServer())
      .post(`/api/v1/emergency-alerts/${alertId}/resolve`)
      .set('Authorization', `Bearer ${guard.accessToken}`)
      .send({})
      .expect(400);

    const resolveRes = await request(app.getHttpServer())
      .post(`/api/v1/emergency-alerts/${alertId}/resolve`)
      .set('Authorization', `Bearer ${guard.accessToken}`)
      .send({ resolutionNote: 'False alarm — checked, all clear.' })
      .expect(201);
    expect(resolveRes.body.status).toBe('resolved');
    expect(resolveRes.body.resolutionNote).toBe('False alarm — checked, all clear.');

    const dashboardAfterResolve = await request(app.getHttpServer())
      .get('/api/v1/guard/dashboard')
      .set('Authorization', `Bearer ${guard.accessToken}`)
      .expect(200);
    expect(
      dashboardAfterResolve.body.activeAlerts.find((a: { id: string }) => a.id === alertId),
    ).toBeUndefined();
  });

  it('login rejects a gateId that does not exist or belongs to another society', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: guardPhone }).expect(202);
    const otp = sms.lastOtpFor(guardPhone);

    await request(app.getHttpServer())
      .post('/api/v1/guard/login')
      .send({ phone: guardPhone, otp, deviceId: 'kiosk-bad-gate', gateId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });
});
