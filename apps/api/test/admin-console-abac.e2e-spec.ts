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
import { SocietySettings } from '../src/database/entities/society-settings.entity';
import { Flat } from '../src/database/entities/flat.entity';
import { Role } from '../src/database/entities/role.entity';
import { UserRole } from '../src/database/entities/user-role.entity';

function randomPhone(): string {
  return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

/**
 * Cross-SOCIETY ABAC boundary for the four read endpoints the admin console
 * session added (settings, flat-detail, assignable-staff, paginated
 * residents). `abac-boundary.e2e-spec.ts` already proves same-society,
 * cross-flat isolation (Owner A vs Owner B) for the residents list; this
 * file proves the orthogonal case these new endpoints introduce — a
 * society-wide caller (Admin, flatId null on their scope) reaching across
 * into a DIFFERENT society entirely, which `assertSocietyMatch`/
 * `assertFlatMatch` are what actually stand between "just joined more
 * tables" and a real cross-tenant data leak.
 */
describe('Admin console cross-society ABAC boundary (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;

  let societies: Repository<Society>;
  let settingsRepo: Repository<SocietySettings>;
  let flats: Repository<Flat>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;

  let societyAId: string;
  let societyBId: string;
  let flatAId: string;
  let flatBId: string;
  let adminAToken: string;

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
    settingsRepo = adminDb.getRepository(SocietySettings);
    flats = adminDb.getRepository(Flat);
    roles = adminDb.getRepository(Role);
    userRoles = adminDb.getRepository(UserRole);

    const societyA = await societies.save(societies.create({ name: `Admin Console ABAC Society A ${Date.now()}` }));
    const societyB = await societies.save(societies.create({ name: `Admin Console ABAC Society B ${Date.now()}` }));
    societyAId = societyA.id;
    societyBId = societyB.id;

    await settingsRepo.save(settingsRepo.create({ societyId: societyAId }));
    await settingsRepo.save(settingsRepo.create({ societyId: societyBId }));

    const flatA = await flats.save(flats.create({ societyId: societyAId, flatNumber: `A-${Date.now()}`, status: 'occupied' }));
    const flatB = await flats.save(flats.create({ societyId: societyBId, flatNumber: `B-${Date.now()}`, status: 'occupied' }));
    flatAId = flatA.id;
    flatBId = flatB.id;

    const adminRole = await roles.findOneOrFail({ where: { code: 'society_admin' } });

    const adminAPhone = randomPhone();
    const adminAToken0 = await loginViaOtp(adminAPhone, 'admin-a-device');
    await userRoles.save(
      userRoles.create({ userId: decodeUserId(adminAToken0), roleId: adminRole.id, societyId: societyAId, flatId: null }),
    );
    // Re-login so the JWT carries the newly-granted role's resolved scope.
    adminAToken = await loginViaOtp(adminAPhone, 'admin-a-device-2');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  it("Society A's Admin can read Society A's settings but not Society B's", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyAId}/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyBId}/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(403);
  });

  it("Society A's Admin can read a flat's detail in their own society but not a flat in Society B", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    // 404, not 403: unlike settings/assignable-staff/residents (which assert
    // scope against the URL param before ever touching the DB), getFlatDetail
    // loads the flat row first — and `flats` has its own RLS policy keyed to
    // the connection's current society, so a Society B flat is genuinely
    // invisible to a Society A-scoped connection before assertSocietyMatch's
    // application-layer check ever runs. Double-layer defense producing the
    // stricter (info-leak-minimizing) outcome, not a gap.
    await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);
  });

  it("Society A's Admin can list assignable staff for Society A but not Society B", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyAId}/assignable-staff`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyBId}/assignable-staff`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(403);
  });

  it("Society A's Admin can list Society A's residents but not Society B's", async () => {
    const resA = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyAId}/residents`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(Array.isArray(resA.body.data)).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyBId}/residents`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(403);
  });

  it('an unauthenticated request to any of these endpoints is rejected before any scoping is evaluated', async () => {
    await request(app.getHttpServer()).get(`/api/v1/societies/${societyAId}/settings`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/flats/${flatAId}`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/societies/${societyAId}/assignable-staff`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/societies/${societyAId}/residents`).expect(401);
  });
});
