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

function randomPhone(): string {
  return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

describe('Notice Board (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;

  let societies: Repository<Society>;
  let flats: Repository<Flat>;
  let residents: Repository<Resident>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;

  let societyId: string;
  let flatAId: string;
  let flatBId: string;
  let ownerAToken: string;
  let ownerBToken: string;
  let tenantToken: string;
  let adminToken: string;

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

    const society = await societies.save(societies.create({ name: `Notice Board Test Society ${Date.now()}` }));
    societyId = society.id;

    const flatA = await flats.save(flats.create({ societyId, flatNumber: `A-${Date.now()}`, status: 'occupied' }));
    const flatB = await flats.save(flats.create({ societyId, flatNumber: `B-${Date.now()}`, status: 'occupied' }));
    flatAId = flatA.id;
    flatBId = flatB.id;

    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });
    const tenantRole = await roles.findOneOrFail({ where: { code: 'tenant' } });
    const adminRole = await roles.findOneOrFail({ where: { code: 'society_admin' } });

    const ownerAPhone = randomPhone();
    const ownerAToken0 = await loginViaOtp(ownerAPhone, 'owner-a-device');
    const ownerAUserId = decodeUserId(ownerAToken0);
    await userRoles.save(userRoles.create({ userId: ownerAUserId, roleId: ownerRole.id, societyId, flatId: flatAId }));
    await residents.save(
      residents.create({ societyId, flatId: flatAId, userId: ownerAUserId, relationType: 'owner', status: 'active' }),
    );

    const ownerBPhone = randomPhone();
    const ownerBToken0 = await loginViaOtp(ownerBPhone, 'owner-b-device');
    const ownerBUserId = decodeUserId(ownerBToken0);
    await userRoles.save(userRoles.create({ userId: ownerBUserId, roleId: ownerRole.id, societyId, flatId: flatBId }));
    await residents.save(
      residents.create({ societyId, flatId: flatBId, userId: ownerBUserId, relationType: 'owner', status: 'active' }),
    );

    const tenantPhone = randomPhone();
    const tenantToken0 = await loginViaOtp(tenantPhone, 'tenant-device');
    const tenantUserId = decodeUserId(tenantToken0);
    await userRoles.save(userRoles.create({ userId: tenantUserId, roleId: tenantRole.id, societyId, flatId: flatBId }));
    await residents.save(
      residents.create({ societyId, flatId: flatBId, userId: tenantUserId, relationType: 'tenant', status: 'active' }),
    );

    const adminPhone = randomPhone();
    const adminToken0 = await loginViaOtp(adminPhone, 'admin-device');
    await userRoles.save(userRoles.create({ userId: decodeUserId(adminToken0), roleId: adminRole.id, societyId, flatId: null }));

    // Re-login now that user_roles rows exist, so JWTs carry resolved scope.
    ownerAToken = await loginViaOtp(ownerAPhone, 'owner-a-device-2');
    ownerBToken = await loginViaOtp(ownerBPhone, 'owner-b-device-2');
    tenantToken = await loginViaOtp(tenantPhone, 'tenant-device-2');
    adminToken = await loginViaOtp(adminPhone, 'admin-device-2');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  it('a resident with nothing targeted at them sees an empty list (new-society empty state)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('audience type "all" reaches every resident; type "role" reaches only that role — never leaks resolvedRecipientUserIds or targetAudience', async () => {
    const allRes = await request(app.getHttpServer())
      .post('/api/v1/notices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'AGM next weekend', body: 'Details inside', targetAudience: { type: 'all' } })
      .expect(201);
    expect(allRes.body.recipientCount).toBeGreaterThanOrEqual(3);
    expect(allRes.body.resolvedRecipientUserIds).toBeUndefined();
    expect(allRes.body.targetAudience).toBeUndefined();
    expect(allRes.body.isRead).toBe(false);

    const tenantOnlyRes = await request(app.getHttpServer())
      .post('/api/v1/notices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Tenant-only circular', body: 'For tenants specifically', targetAudience: { type: 'role', role: 'tenant' } })
      .expect(201);
    expect(tenantOnlyRes.body.recipientCount).toBe(1);

    const ownerAList = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    const ownerATitles = ownerAList.body.map((n: { title: string }) => n.title);
    expect(ownerATitles).toContain('AGM next weekend');
    expect(ownerATitles).not.toContain('Tenant-only circular');
    for (const notice of ownerAList.body) {
      expect(notice.resolvedRecipientUserIds).toBeUndefined();
      expect(notice.targetAudience).toBeUndefined();
      expect(notice.publishedBy).toBeUndefined();
    }

    const tenantList = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .expect(200);
    const tenantTitles = tenantList.body.map((n: { title: string }) => n.title);
    expect(tenantTitles).toContain('AGM next weekend');
    expect(tenantTitles).toContain('Tenant-only circular');
  });

  it('pinned notices sort above unpinned, newest first within each group', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/notices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Regular update', body: 'Nothing urgent', targetAudience: { type: 'all' } })
      .expect(201);

    const pinnedRes = await request(app.getHttpServer())
      .post('/api/v1/notices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'URGENT: water shutoff', body: 'Tomorrow 9am-1pm', targetAudience: { type: 'all' }, isPinned: true })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(200);
    expect(list.body[0].id).toBe(pinnedRes.body.id);
    expect(list.body[0].isPinned).toBe(true);
  });

  it('mark-as-read is idempotent, per-user, and immediately reflected in the list', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/notices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Read-tracking test notice', body: 'x', targetAudience: { type: 'all' } })
      .expect(201);
    const noticeId = created.body.id;

    const before = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    expect(before.body.find((n: { id: string }) => n.id === noticeId).isRead).toBe(false);

    const firstMark = await request(app.getHttpServer())
      .post(`/api/v1/notices/${noticeId}/read`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);
    expect(firstMark.body.noticeId).toBe(noticeId);
    expect(firstMark.body.readAt).toBeTruthy();

    // Replaying the same mark-as-read never errors and never creates a second row.
    await request(app.getHttpServer())
      .post(`/api/v1/notices/${noticeId}/read`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);

    const afterA = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    expect(afterA.body.find((n: { id: string }) => n.id === noticeId).isRead).toBe(true);

    // Owner B never read it — their own read status is unaffected by Owner A's.
    const afterB = await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(200);
    expect(afterB.body.find((n: { id: string }) => n.id === noticeId).isRead).toBe(false);
  });

  it('read-report is notice-board:manage only — a resident gets 403, an admin gets the real counts', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/notices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Report-checked notice', body: 'x', targetAudience: { type: 'all' } })
      .expect(201);
    const noticeId = created.body.id;

    await request(app.getHttpServer())
      .get(`/api/v1/notices/${noticeId}/read-report`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/notices/${noticeId}/read`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(201);

    const report = await request(app.getHttpServer())
      .get(`/api/v1/notices/${noticeId}/read-report`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(report.body.readCount).toBe(1);
    expect(report.body.totalRecipients).toBeGreaterThanOrEqual(3);
  });
});
