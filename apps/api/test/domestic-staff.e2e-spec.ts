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

/**
 * Two ABAC boundaries specific to domestic-staff, both explicitly requested
 * as a gap-fill on top of the module's other tests:
 *
 * 1. staff_flat_mapping: an Owner querying another flat's staff (even
 *    within their own society) must be rejected, and their own flat's
 *    listing must never leak another flat's mapping into it — same
 *    two-part shape as the resident-module boundary test (reject the
 *    cross-flat read, and prove same-flat reads are correctly scoped).
 *
 * 2. Police-verification read/write: the module's most sensitive field is
 *    gated by a society-wide-*scope* check inside DomesticStaffService, not
 *    just the `domestic-staff:manage` permission (see that service's
 *    `assertSocietyWideScope` + `assertStaffMappedWithinScope`). A Society
 *    Admin from a *different* society holds the same permission but must
 *    still be rejected, because the staff-flat mapping the check relies on
 *    doesn't exist in their society. Proving this specifically (not just
 *    "some Admin can read it") is the point of this test.
 */
describe('Domestic Staff (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;

  let societies: Repository<Society>;
  let flats: Repository<Flat>;
  let residents: Repository<Resident>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;

  let society1Id: string;
  let society2Id: string;
  let flatAId: string;
  let flatBId: string;
  let ownerAToken: string;
  let ownerBToken: string;
  let admin1Token: string; // Society 1's admin
  let admin2Token: string; // Society 2's admin — a different society entirely

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

    const society1 = await societies.save(societies.create({ name: `Domestic Staff Test Society 1 ${Date.now()}` }));
    const society2 = await societies.save(societies.create({ name: `Domestic Staff Test Society 2 ${Date.now()}` }));
    society1Id = society1.id;
    society2Id = society2.id;

    const flatA = await flats.save(flats.create({ societyId: society1Id, flatNumber: `A-${Date.now()}`, status: 'occupied' }));
    const flatB = await flats.save(flats.create({ societyId: society1Id, flatNumber: `B-${Date.now()}`, status: 'occupied' }));
    flatAId = flatA.id;
    flatBId = flatB.id;

    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });
    const adminRole = await roles.findOneOrFail({ where: { code: 'society_admin' } });

    const ownerAPhone = randomPhone();
    const ownerAToken0 = await loginViaOtp(ownerAPhone, 'ds-owner-a');
    const ownerAUserId = decodeUserId(ownerAToken0);
    await userRoles.save(userRoles.create({ userId: ownerAUserId, roleId: ownerRole.id, societyId: society1Id, flatId: flatAId }));
    await residents.save(residents.create({ societyId: society1Id, flatId: flatAId, userId: ownerAUserId, relationType: 'owner', status: 'active' }));

    const ownerBPhone = randomPhone();
    const ownerBToken0 = await loginViaOtp(ownerBPhone, 'ds-owner-b');
    const ownerBUserId = decodeUserId(ownerBToken0);
    await userRoles.save(userRoles.create({ userId: ownerBUserId, roleId: ownerRole.id, societyId: society1Id, flatId: flatBId }));
    await residents.save(residents.create({ societyId: society1Id, flatId: flatBId, userId: ownerBUserId, relationType: 'owner', status: 'active' }));

    const admin1Phone = randomPhone();
    const admin1Token0 = await loginViaOtp(admin1Phone, 'ds-admin-1');
    const admin1UserId = decodeUserId(admin1Token0);
    await userRoles.save(userRoles.create({ userId: admin1UserId, roleId: adminRole.id, societyId: society1Id, flatId: null }));

    const admin2Phone = randomPhone();
    const admin2Token0 = await loginViaOtp(admin2Phone, 'ds-admin-2');
    const admin2UserId = decodeUserId(admin2Token0);
    // Admin 2's user_roles row is society_admin in Society 2 — a completely
    // separate society, with no relationship to flatA/flatB or its staff.
    await userRoles.save(userRoles.create({ userId: admin2UserId, roleId: adminRole.id, societyId: society2Id, flatId: null }));

    // Re-login now that user_roles rows exist, so JWTs carry resolved scope.
    ownerAToken = await loginViaOtp(ownerAPhone, 'ds-owner-a-2');
    ownerBToken = await loginViaOtp(ownerBPhone, 'ds-owner-b-2');
    admin1Token = await loginViaOtp(admin1Phone, 'ds-admin-1-2');
    admin2Token = await loginViaOtp(admin2Phone, 'ds-admin-2-2');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  it("staff_flat_mapping ABAC: an Owner cannot read another flat's staff, and their own flat's listing is correctly scoped", async () => {
    const staffRes = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${admin1Token}`)
      .send({ name: 'Maid A', phone: randomPhone(), staffType: 'maid' })
      .expect(201);
    const staffId = staffRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/staff/${staffId}/flat-mapping`)
      .set('Authorization', `Bearer ${admin1Token}`)
      .send({ flatId: flatAId })
      .expect(201);

    // Owner A can read their own flat's staff — the mapping shows up.
    const ownFlatRes = await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatAId}/staff`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    expect(ownFlatRes.body).toHaveLength(1);
    expect(ownFlatRes.body[0].staff.id).toBe(staffId);

    // Owner A cannot read flat B's staff — explicit rejection, not a silent empty result.
    await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatBId}/staff`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(403);

    // Owner B reading their OWN flat sees no staff — flat A's mapping does
    // not leak across the query scope.
    const ownerBOwnFlatRes = await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatBId}/staff`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(200);
    expect(ownerBOwnFlatRes.body).toHaveLength(0);

    // And Owner B is symmetrically rejected from flat A, same as Owner A was from flat B.
    await request(app.getHttpServer())
      .get(`/api/v1/flats/${flatAId}/staff`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(403);
  });

  it("police-verification read/write: a Society Admin from a different society cannot reach another society's staff record, even holding the same permission", async () => {
    const staffRes = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${admin1Token}`)
      .send({ name: 'Driver A', phone: randomPhone(), staffType: 'driver' })
      .expect(201);
    const staffId = staffRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/staff/${staffId}/flat-mapping`)
      .set('Authorization', `Bearer ${admin1Token}`)
      .send({ flatId: flatAId })
      .expect(201);

    // Society 1's own admin can upload + read + set status — the rightful path.
    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${staffId}/police-verification-document`)
      .set('Authorization', `Bearer ${admin1Token}`)
      .send({ fileUrl: 'https://example.invalid/docs/driver-a-police-verification.pdf' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${staffId}/police-verification-status`)
      .set('Authorization', `Bearer ${admin1Token}`)
      .send({ status: 'verified' })
      .expect(200);

    const ownSocietyRead = await request(app.getHttpServer())
      .get(`/api/v1/staff/${staffId}/police-verification-document`)
      .set('Authorization', `Bearer ${admin1Token}`)
      .expect(200);
    expect(ownSocietyRead.body.status).toBe('verified');
    expect(ownSocietyRead.body.fileUrl).toContain('driver-a-police-verification.pdf');

    // Society 2's admin holds domestic-staff:manage too (in their own
    // society) and is society-wide-scoped (scope.flatId === null) — the
    // scope-shape check alone would let them through. What must actually
    // block them is assertStaffMappedWithinScope finding no staff_flat_mapping
    // for this staffId under Society 2's society_id.
    await request(app.getHttpServer())
      .get(`/api/v1/staff/${staffId}/police-verification-document`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${staffId}/police-verification-document`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ fileUrl: 'https://example.invalid/docs/malicious-overwrite.pdf' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${staffId}/police-verification-status`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ status: 'rejected' })
      .expect(403);

    // Confirm Society 2's rejected attempts had zero effect — the document
    // and status Society 1 set are exactly as they left them.
    const reread = await request(app.getHttpServer())
      .get(`/api/v1/staff/${staffId}/police-verification-document`)
      .set('Authorization', `Bearer ${admin1Token}`)
      .expect(200);
    expect(reread.body.status).toBe('verified');
    expect(reread.body.fileUrl).toContain('driver-a-police-verification.pdf');
  });
});
