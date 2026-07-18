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
import { Role } from '../src/database/entities/role.entity';
import { UserRole } from '../src/database/entities/user-role.entity';
import { Resident } from '../src/database/entities/resident.entity';

/**
 * Proves the ABAC boundary itself, not just the happy path: two Flat Owners
 * in the *same* society, each pinned (via user_roles.flat_id) to their own
 * flat. The same request, run as each owner's JWT, must return different,
 * correctly-narrowed results — and an owner explicitly acting on the other's
 * resident must be rejected outright, not silently no-op.
 */
describe('ABAC boundary (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;

  let societies: Repository<Society>;
  let flats: Repository<Flat>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;
  let residents: Repository<Resident>;

  let societyId: string;
  let flatAId: string;
  let flatBId: string;
  let residentAId: string;
  let residentBId: string;
  const phoneA = randomPhone();
  const phoneB = randomPhone();

  function randomPhone(): string {
    return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
  }

  async function loginViaOtp(phone: string, deviceId: string): Promise<string> {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const otp = sms.lastOtpFor(phone);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, otp, deviceId })
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
    roles = adminDb.getRepository(Role);
    userRoles = adminDb.getRepository(UserRole);
    residents = adminDb.getRepository(Resident);

    // Fixture setup via repositories directly (not HTTP) — this test is
    // about the read/write boundary, not re-proving the create endpoints
    // (covered elsewhere).
    const society = await societies.save(societies.create({ name: `ABAC Test Society ${Date.now()}` }));
    societyId = society.id;

    const flatA = await flats.save(
      flats.create({ societyId, flatNumber: `A-${Date.now()}`, status: 'occupied' }),
    );
    const flatB = await flats.save(
      flats.create({ societyId, flatNumber: `B-${Date.now()}`, status: 'occupied' }),
    );
    flatAId = flatA.id;
    flatBId = flatB.id;

    const residentA = await residents.save(
      residents.create({ societyId, flatId: flatAId, relationType: 'owner', status: 'active' }),
    );
    const residentB = await residents.save(
      residents.create({ societyId, flatId: flatBId, relationType: 'owner', status: 'active' }),
    );
    residentAId = residentA.id;
    residentBId = residentB.id;

    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });

    // Login first (creates the `users` rows via the OTP flow), then assign
    // each user_roles row to their respective flat — same mechanism a real
    // admin action would use.
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: phoneA }).expect(202);
    let otp = sms.lastOtpFor(phoneA);
    let res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: phoneA, otp, deviceId: 'owner-a-device' })
      .expect(201);
    const userAId = res.body.user?.id ?? (await decodeUserId(res.body.accessToken));

    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone: phoneB }).expect(202);
    otp = sms.lastOtpFor(phoneB);
    res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: phoneB, otp, deviceId: 'owner-b-device' })
      .expect(201);
    const userBId = res.body.user?.id ?? (await decodeUserId(res.body.accessToken));

    await userRoles.save(
      userRoles.create({ userId: userAId, roleId: ownerRole.id, societyId, flatId: flatAId }),
    );
    await userRoles.save(
      userRoles.create({ userId: userBId, roleId: ownerRole.id, societyId, flatId: flatBId }),
    );
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  function decodeUserId(accessToken: string): string {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'));
    return payload.sub;
  }

  it('Owner A and Owner B, logging in again, only ever see their own flat in GET /societies/{id}/residents', async () => {
    const tokenA = await loginViaOtp(phoneA, 'owner-a-device-2');
    const tokenB = await loginViaOtp(phoneB, 'owner-b-device-2');

    const resA = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/residents`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/residents`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const idsSeenByA: string[] = resA.body.map((r: { id: string }) => r.id);
    const idsSeenByB: string[] = resB.body.map((r: { id: string }) => r.id);

    expect(idsSeenByA).toContain(residentAId);
    expect(idsSeenByA).not.toContain(residentBId);

    expect(idsSeenByB).toContain(residentBId);
    expect(idsSeenByB).not.toContain(residentAId);
  });

  it("Owner A is rejected (403) attempting to act on Owner B's resident directly", async () => {
    const tokenA = await loginViaOtp(phoneA, 'owner-a-device-3');

    await request(app.getHttpServer())
      .post(`/api/v1/residents/${residentBId}/vehicles`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'car', registrationNumber: 'MH12AB1234' })
      .expect(403);
  });

  it("Owner B, symmetrically, is rejected acting on Owner A's resident", async () => {
    const tokenB = await loginViaOtp(phoneB, 'owner-b-device-3');

    await request(app.getHttpServer())
      .post(`/api/v1/residents/${residentAId}/vehicles`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ type: 'car', registrationNumber: 'MH14CD5678' })
      .expect(403);
  });

  it('an unauthenticated request to the same endpoint is rejected before any scoping is even evaluated', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/residents`)
      .expect(401);
  });
});
