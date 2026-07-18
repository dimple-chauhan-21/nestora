import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import request from 'supertest';
import { randomInt, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { SMS_PROVIDER } from '../src/modules/auth/sms/sms-provider.interface';
import { CapturingSmsProvider } from './capturing-sms.provider';
import { getAdminDataSource, closeAdminDataSource } from './admin-datasource';
import { Society } from '../src/database/entities/society.entity';
import { Flat } from '../src/database/entities/flat.entity';
import { Role } from '../src/database/entities/role.entity';
import { UserRole } from '../src/database/entities/user-role.entity';
import { AmenityMaster } from '../src/database/entities/amenity-master.entity';
import { AmenityBookingRule } from '../src/database/entities/amenity-booking-rule.entity';

function randomPhone(): string {
  return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

/**
 * The double-booking guarantee under test here lives in the DB (the
 * EXCLUDE USING gist constraint), not in application code — these tests
 * fire genuinely concurrent HTTP requests (Promise.all, same style as the
 * billing webhook-race test) rather than sequential awaits, because a
 * sequential test can only prove the app-layer pre-check works, never the
 * actual race condition the exclusion constraint exists to close.
 */
describe('Amenity Booking (e2e) — concurrency', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;

  let societies: Repository<Society>;
  let flats: Repository<Flat>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;
  let amenities: Repository<AmenityMaster>;
  let bookingRules: Repository<AmenityBookingRule>;

  let societyId: string;
  let amenityId: string;
  let adminToken: string;
  const flatIds: string[] = [];

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
    // Explicit eager listen (rather than relying on supertest's lazy
    // listen-on-first-request) — the concurrency test below fires 10 brand
    // new sockets at once, and a server that's still completing its first
    // bind exactly as that burst arrives is a plausible source of a stray
    // connection reset unrelated to the exclusion-constraint logic under
    // test.
    await app.listen(0);

    sms = moduleRef.get(SMS_PROVIDER);
    const adminDb = await getAdminDataSource();
    societies = adminDb.getRepository(Society);
    flats = adminDb.getRepository(Flat);
    roles = adminDb.getRepository(Role);
    userRoles = adminDb.getRepository(UserRole);
    amenities = adminDb.getRepository(AmenityMaster);
    bookingRules = adminDb.getRepository(AmenityBookingRule);

    const society = await societies.save(societies.create({ name: `Amenity Test Society ${Date.now()}` }));
    societyId = society.id;

    // 12 distinct flats — admin books on behalf of a different flat per
    // concurrent request, so this is a genuine multi-party race, not one
    // caller retrying itself. Admin isn't ABAC-narrowed to any single flat,
    // so this avoids needing 12 separate OTP logins (and the rate limit
    // that comes with it) while the race still plays out at the DB layer
    // exactly as it would across 12 different residents.
    for (let i = 0; i < 12; i++) {
      const flat = await flats.save(flats.create({ societyId, flatNumber: `AB-${Date.now()}-${i}`, status: 'occupied' }));
      flatIds.push(flat.id);
    }

    const amenity = await amenities.save(
      amenities.create({ societyId, name: 'Clubhouse', type: 'clubhouse', bookingRequired: true }),
    );
    amenityId = amenity.id;

    await bookingRules.save(
      bookingRules.create({
        societyId,
        amenityId,
        minDurationMins: 30,
        maxDurationMins: 240,
        advanceBookingDays: 30,
        cancellationWindowHours: 24,
        feeAmount: '0',
      }),
    );

    const adminRole = await roles.findOneOrFail({ where: { code: 'society_admin' } });
    const adminPhone = randomPhone();
    const adminToken0 = await loginViaOtp(adminPhone, 'ab-admin-device');
    const adminPayload = JSON.parse(Buffer.from(adminToken0.split('.')[1]!, 'base64url').toString('utf8'));
    await userRoles.save(userRoles.create({ userId: adminPayload.sub, roleId: adminRole.id, societyId, flatId: null }));
    adminToken = await loginViaOtp(adminPhone, 'ab-admin-device-2');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  /** N days from "now" (test run time), at a fixed hour — avoids hardcoded dates drifting into the past as real time passes. */
  function daysFromNow(days: number, hour: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  function bookRequest(flatId: string, startAt: string, endAt: string, idempotencyKey: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/amenities/${amenityId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ flatId, startAt, endAt });
  }

  it('10 genuinely concurrent overlapping bookings on the same amenity: exactly one succeeds, the rest get 409 from the exclusion constraint', async () => {
    const startAt = daysFromNow(3, 10);
    const endAt = daysFromNow(3, 11); // same window for all 10 — they all overlap each other

    const requests = flatIds
      .slice(0, 10)
      .map((flatId) => bookRequest(flatId, startAt, endAt, randomUUID()));

    // Promise.all, not sequential awaits — this is the whole point: all 10
    // requests hit the DB layer at once, racing for the same slot.
    const responses = await Promise.all(requests);

    const succeeded = responses.filter((r) => r.status === 201);
    const conflicted = responses.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(9);

    // The winner's booking is real and confirmed.
    expect(succeeded[0]?.body.status).toBe('confirmed');
    expect(succeeded[0]?.body.amenityId).toBe(amenityId);

    // The losers got a real conflict message, not a generic 500 — this
    // confirms the exclusion-violation path specifically, not just "any
    // error became a 409."
    for (const loss of conflicted) {
      expect(loss.body.message).toMatch(/already booked/i);
    }
  });

  it('two genuinely concurrent NON-overlapping bookings on the same amenity: both succeed', async () => {
    const [flatX, flatY] = flatIds.slice(10, 12);

    const [resA, resB] = await Promise.all([
      bookRequest(flatX!, daysFromNow(4, 9), daysFromNow(4, 10), randomUUID()),
      bookRequest(flatY!, daysFromNow(4, 14), daysFromNow(4, 15), randomUUID()),
    ]);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.id).not.toBe(resB.body.id);
  });

  it('rejects a booking request with no Idempotency-Key header', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/amenities/${amenityId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ flatId: flatIds[0], startAt: daysFromNow(5, 9), endAt: daysFromNow(5, 10) })
      .expect(400);
  });

  it('replaying the exact same Idempotency-Key returns the original booking, not a duplicate or a conflict', async () => {
    const key = randomUUID();
    const startAt = daysFromNow(6, 9);
    const endAt = daysFromNow(6, 10);

    const first = await bookRequest(flatIds[0]!, startAt, endAt, key).expect(201);
    const replay = await bookRequest(flatIds[0]!, startAt, endAt, key).expect(201);

    expect(replay.body.id).toBe(first.body.id);
  });

  it('cancellation is a status change, not a row delete — the freed slot can be re-booked afterward', async () => {
    const startAt = daysFromNow(7, 9);
    const endAt = daysFromNow(7, 10);

    const created = await bookRequest(flatIds[0]!, startAt, endAt, randomUUID()).expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/amenity-bookings/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe('cancelled');
      });

    // Same amenity, same window, a different flat — succeeds now that the
    // original booking is cancelled (excluded from the constraint's WHERE
    // status = 'confirmed' clause), proving the row still exists, just
    // with status flipped.
    const rebooked = await bookRequest(flatIds[1]!, startAt, endAt, randomUUID());
    expect(rebooked.status).toBe(201);
  });

  it('ABAC boundary: a flat-pinned Owner cannot book on behalf of another flat, nor cancel another flat\'s booking', async () => {
    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });
    const flatX = flatIds[3]!;
    const flatY = flatIds[4]!;

    const phoneX = randomPhone();
    const tokenX0 = await loginViaOtp(phoneX, 'ab-owner-x-setup');
    const payloadX = JSON.parse(Buffer.from(tokenX0.split('.')[1]!, 'base64url').toString('utf8'));
    await userRoles.save(userRoles.create({ userId: payloadX.sub, roleId: ownerRole.id, societyId, flatId: flatX }));
    const tokenX = await loginViaOtp(phoneX, 'ab-owner-x-2');

    const phoneY = randomPhone();
    const tokenY0 = await loginViaOtp(phoneY, 'ab-owner-y-setup');
    const payloadY = JSON.parse(Buffer.from(tokenY0.split('.')[1]!, 'base64url').toString('utf8'));
    await userRoles.save(userRoles.create({ userId: payloadY.sub, roleId: ownerRole.id, societyId, flatId: flatY }));
    const tokenY = await loginViaOtp(phoneY, 'ab-owner-y-2');

    const startAt = daysFromNow(8, 9);
    const endAt = daysFromNow(8, 10);

    // Owner X cannot book on behalf of Owner Y's flat.
    await request(app.getHttpServer())
      .post(`/api/v1/amenities/${amenityId}/bookings`)
      .set('Authorization', `Bearer ${tokenX}`)
      .set('Idempotency-Key', randomUUID())
      .send({ flatId: flatY, startAt, endAt })
      .expect(403);

    // Owner X books their own flat — succeeds.
    const ownBooking = await request(app.getHttpServer())
      .post(`/api/v1/amenities/${amenityId}/bookings`)
      .set('Authorization', `Bearer ${tokenX}`)
      .set('Idempotency-Key', randomUUID())
      .send({ flatId: flatX, startAt, endAt })
      .expect(201);

    // Owner Y cannot cancel Owner X's booking.
    await request(app.getHttpServer())
      .delete(`/api/v1/amenity-bookings/${ownBooking.body.id}`)
      .set('Authorization', `Bearer ${tokenY}`)
      .expect(403);
  });
});
