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

describe('Visitor walk-in + gate flow (e2e)', () => {
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
  let gateAId: string;
  let gateBId: string;
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

    const society = await societies.save(societies.create({ name: `Gate Test Society ${Date.now()}` }));
    societyId = society.id;

    const flat = await flats.save(flats.create({ societyId, flatNumber: `G-${Date.now()}`, status: 'occupied' }));
    flatId = flat.id;

    const gateA = await gates.save(gates.create({ societyId, name: 'Main Gate', type: 'main' }));
    const gateB = await gates.save(gates.create({ societyId, name: 'Service Gate', type: 'service' }));
    gateAId = gateA.id;
    gateBId = gateB.id;

    // Owner: login (creates the user), then bind flat_owner role to this flat.
    const ownerToken = await loginViaOtp(ownerPhone, 'owner-device-setup');
    const ownerUserId = decodeUserId(ownerToken);
    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });
    await userRoles.save(userRoles.create({ userId: ownerUserId, roleId: ownerRole.id, societyId, flatId }));
    await residents.save(
      residents.create({ societyId, flatId, userId: ownerUserId, relationType: 'owner', status: 'active' }),
    );

    // Guard: login (creates the user), bind security_guard role + a guards row pinned to Gate A.
    const guardToken = await loginViaOtp(guardPhone, 'guard-device-setup');
    const guardUserId = decodeUserId(guardToken);
    const guardRole = await roles.findOneOrFail({ where: { code: 'security_guard' } });
    await userRoles.save(userRoles.create({ userId: guardUserId, roleId: guardRole.id, societyId, flatId: null }));
    await guardRepo.save(guardRepo.create({ societyId, userId: guardUserId, gateId: gateAId }));
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  it('full walk-in flow: register -> approve -> check-in -> check-out', async () => {
    // Guard logs in at Gate A (explicit gate-switch via login). beforeAll's
    // setup already consumed an OTP for this phone, so request a fresh one.
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: guardPhone }).expect(202);
    const freshOtp = sms.lastOtpFor(guardPhone);
    const guardLogin = await request(app.getHttpServer())
      .post('/api/v1/guard/login')
      .send({ phone: guardPhone, otp: freshOtp, deviceId: 'kiosk-gate-a', gateId: gateAId })
      .expect(201);
    const guardToken = guardLogin.body.accessToken;
    expect(guardLogin.body.guard.gateId).toBe(gateAId);

    // 1. Register a walk-in visitor.
    const walkInRes = await request(app.getHttpServer())
      .post('/api/v1/visits/walk-in')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ flatId, name: 'Amit Courier', phone: randomPhone(), purpose: 'Package delivery' })
      .expect(201);
    const visitId = walkInRes.body.id;
    expect(walkInRes.body.status).toBe('pending');

    // 2. Owner approves.
    const ownerToken = await loginViaOtp(ownerPhone, 'owner-device-approve');
    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/visits/${visitId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(approveRes.body.status).toBe('approved');
    expect(approveRes.body.qrCode).toEqual(expect.any(String));
    const qrToken = approveRes.body.qrCode;

    // 3. Guard scans to check in.
    const checkInRes = await request(app.getHttpServer())
      .post('/api/v1/gate/scan')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ token: qrToken, direction: 'in', gateId: gateAId })
      .expect(201);
    expect(checkInRes.body.direction).toBe('in');
    expect(checkInRes.body.entityType).toBe('visitor');

    const historyAfterCheckIn = await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatId}/visits/history`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const visitAfterCheckIn = historyAfterCheckIn.body.data.find((v: { id: string }) => v.id === visitId);
    expect(visitAfterCheckIn.status).toBe('checked_in');

    // 4. Guard scans again to check out.
    const checkOutRes = await request(app.getHttpServer())
      .post('/api/v1/gate/scan')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ token: qrToken, direction: 'out', gateId: gateAId })
      .expect(201);
    expect(checkOutRes.body.direction).toBe('out');

    const historyAfterCheckOut = await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatId}/visits/history`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const visitAfterCheckOut = historyAfterCheckOut.body.data.find((v: { id: string }) => v.id === visitId);
    expect(visitAfterCheckOut.status).toBe('checked_out');
  });

  it('gate-scope enforcement: a guard logged in at Gate A is rejected acting on Gate B without an explicit gate-switch', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: guardPhone }).expect(202);
    const otp = sms.lastOtpFor(guardPhone);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/guard/login')
      .send({ phone: guardPhone, otp, deviceId: 'kiosk-gate-a-2', gateId: gateAId })
      .expect(201);
    const guardToken = loginRes.body.accessToken;

    // Acting on Gate A (own gate) succeeds.
    const okRes = await request(app.getHttpServer())
      .post('/api/v1/gate/manual-entry')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ gateId: gateAId, entityType: 'staff', direction: 'in', overrideReason: 'No QR, known staff' })
      .expect(201);
    expect(okRes.body.gateId).toBe(gateAId);

    // Acting on Gate B (not logged in there) is rejected.
    await request(app.getHttpServer())
      .post('/api/v1/gate/manual-entry')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ gateId: gateBId, entityType: 'staff', direction: 'in', overrideReason: 'Attempting Gate B' })
      .expect(403);

    // Explicit gate-switch: re-login at Gate B, now it works.
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: guardPhone }).expect(202);
    const otp2 = sms.lastOtpFor(guardPhone);
    const switchRes = await request(app.getHttpServer())
      .post('/api/v1/guard/login')
      .send({ phone: guardPhone, otp: otp2, deviceId: 'kiosk-gate-b', gateId: gateBId })
      .expect(201);
    const gateBToken = switchRes.body.accessToken;

    const gateBRes = await request(app.getHttpServer())
      .post('/api/v1/gate/manual-entry')
      .set('Authorization', `Bearer ${gateBToken}`)
      .send({ gateId: gateBId, entityType: 'staff', direction: 'in', overrideReason: 'Now at Gate B' })
      .expect(201);
    expect(gateBRes.body.gateId).toBe(gateBId);
  });

  it("ABAC boundary: a different flat's Owner (same society) cannot view or approve/reject another flat's visit", async () => {
    // A second flat + owner, distinct from beforeAll's flat/owner.
    const otherFlat = await flats.save(flats.create({ societyId, flatNumber: `GO-${Date.now()}`, status: 'occupied' }));
    const otherOwnerPhone = randomPhone();
    const otherOwnerToken0 = await loginViaOtp(otherOwnerPhone, 'other-owner-setup');
    const otherOwnerUserId = decodeUserId(otherOwnerToken0);
    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });
    await userRoles.save(
      userRoles.create({ userId: otherOwnerUserId, roleId: ownerRole.id, societyId, flatId: otherFlat.id }),
    );
    const otherOwnerToken = await loginViaOtp(otherOwnerPhone, 'other-owner-check');

    // A fresh walk-in for the ORIGINAL flat (beforeAll's flatId).
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: guardPhone }).expect(202);
    const guardOtp = sms.lastOtpFor(guardPhone);
    const guardLoginRes = await request(app.getHttpServer())
      .post('/api/v1/guard/login')
      .send({ phone: guardPhone, otp: guardOtp, deviceId: 'kiosk-abac-visitor', gateId: gateAId })
      .expect(201);
    const guardToken = guardLoginRes.body.accessToken;
    const walkInRes = await request(app.getHttpServer())
      .post('/api/v1/visits/walk-in')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ flatId, name: 'Priya Guest', phone: randomPhone(), purpose: 'Personal visit' })
      .expect(201);
    const visitId = walkInRes.body.id;

    // The other flat's owner cannot see it in history...
    await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatId}/visits/history`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .expect(403);

    // ...nor approve it...
    await request(app.getHttpServer())
      .post(`/api/v1/visits/${visitId}/approve`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .expect(403);

    // ...nor reject it.
    await request(app.getHttpServer())
      .post(`/api/v1/visits/${visitId}/reject`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .expect(403);

    // The actual owner still can, proving this isn't a broken endpoint.
    const ownerToken = await loginViaOtp(ownerPhone, 'owner-device-abac-check');
    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/visits/${visitId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(approveRes.body.status).toBe('approved');
  });
});
