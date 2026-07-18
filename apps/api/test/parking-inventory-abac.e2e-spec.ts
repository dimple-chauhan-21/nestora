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

function randomPhone(): string {
  return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

/**
 * Parking: Owner/Tenant hold `parking:read` only, not `parking:manage` —
 * defining slots is an Admin action per §10's own user flow. Inventory:
 * Owner/Tenant hold *neither* `inventory:manage` nor `inventory:read` at
 * all (deliverable #4/§15's "not general residents"), so cost-field
 * visibility is proven by the fact that residents can't reach an asset
 * endpoint at all — the strongest form of the restriction, not a
 * field-level filter. Committee, which SRS explicitly authorizes to see
 * cost, is asserted to actually receive `purchase_cost` in its response.
 */
describe('Parking & Inventory ABAC boundary (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;

  let societies: Repository<Society>;
  let flats: Repository<Flat>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;

  let societyId: string;
  let flatId: string;
  let ownerToken: string;
  let adminToken: string;
  let committeeToken: string;

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
    roles = adminDb.getRepository(Role);
    userRoles = adminDb.getRepository(UserRole);

    const society = await societies.save(societies.create({ name: `Parking Inventory ABAC Society ${Date.now()}` }));
    societyId = society.id;

    const flat = await flats.save(flats.create({ societyId, flatNumber: `PI-${Date.now()}`, status: 'occupied' }));
    flatId = flat.id;

    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });
    const adminRole = await roles.findOneOrFail({ where: { code: 'society_admin' } });
    const committeeRole = await roles.findOneOrFail({ where: { code: 'committee_member' } });

    const ownerPhone = randomPhone();
    const ownerToken0 = await loginViaOtp(ownerPhone, 'pi-owner-device');
    await userRoles.save(
      userRoles.create({ userId: decodeUserId(ownerToken0), roleId: ownerRole.id, societyId, flatId }),
    );

    const adminPhone = randomPhone();
    const adminToken0 = await loginViaOtp(adminPhone, 'pi-admin-device');
    await userRoles.save(
      userRoles.create({ userId: decodeUserId(adminToken0), roleId: adminRole.id, societyId, flatId: null }),
    );

    const committeePhone = randomPhone();
    const committeeToken0 = await loginViaOtp(committeePhone, 'pi-committee-device');
    await userRoles.save(
      userRoles.create({ userId: decodeUserId(committeeToken0), roleId: committeeRole.id, societyId, flatId: null }),
    );

    ownerToken = await loginViaOtp(ownerPhone, 'pi-owner-device-2');
    adminToken = await loginViaOtp(adminPhone, 'pi-admin-device-2');
    committeeToken = await loginViaOtp(committeePhone, 'pi-committee-device-2');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  it('parking: an Owner (parking:read only) cannot define a slot; an Admin (parking:manage) can', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/parking/slots')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ slotNumber: 'P-100', type: 'covered' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/parking/slots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slotNumber: 'P-100', type: 'covered' })
      .expect(201);
  });

  it('parking: an Owner CAN read availability (parking:read covers this)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/parking/availability`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  });

  it("inventory: an Owner holds neither inventory:manage nor inventory:read — every asset endpoint is unreachable, not just cost fields", async () => {
    const assetRes = await request(app.getHttpServer())
      .post('/api/v1/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Diesel Generator', category: 'equipment', purchaseCost: 250000, vendor: 'Kirloskar' })
      .expect(201);
    const assetId = assetRes.body.id;

    // Owner cannot even list assets...
    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/assets`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);

    // ...nor read a specific asset's warranty alert.
    await request(app.getHttpServer())
      .get(`/api/v1/assets/${assetId}/warranty-alerts`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
  });

  it('inventory: Committee (inventory:read) and Admin (inventory:manage) both see purchase_cost — §15 explicitly authorizes both', async () => {
    const assetRes = await request(app.getHttpServer())
      .post('/api/v1/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Clubhouse Furniture Set', category: 'furniture', purchaseCost: 85000, vendor: 'Godrej' })
      .expect(201);
    expect(Number(assetRes.body.purchaseCost)).toBe(85000);

    const committeeListRes = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/assets`)
      .set('Authorization', `Bearer ${committeeToken}`)
      .expect(200);
    const seenByCommittee = committeeListRes.body.find((a: { id: string }) => a.id === assetRes.body.id);
    expect(Number(seenByCommittee.purchaseCost)).toBe(85000);

    const adminListRes = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/assets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const seenByAdmin = adminListRes.body.find((a: { id: string }) => a.id === assetRes.body.id);
    expect(Number(seenByAdmin.purchaseCost)).toBe(85000);
  });
});
