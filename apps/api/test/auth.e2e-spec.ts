import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomInt } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { SMS_PROVIDER } from '../src/modules/auth/sms/sms-provider.interface';
import { CapturingSmsProvider } from './capturing-sms.provider';

/**
 * Full otp/request -> otp/verify -> me -> refresh -> logout flow against a
 * real Postgres (society_test database, see env.setup.ts) and real Redis —
 * only the SMS gateway is swapped for a capturing double, since there's no
 * real SMS provider to call in CI/local dev.
 */
describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;
  const phone = `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
  const deviceId = 'e2e-test-device';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SMS_PROVIDER)
      .useClass(CapturingSmsProvider)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    sms = moduleRef.get(SMS_PROVIDER);
  });

  afterAll(async () => {
    await app.close();
  });

  let accessToken: string;
  let refreshToken: string;

  it('POST /auth/otp/request accepts a valid phone and sends an OTP', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone })
      .expect(202);

    expect(res.body).toEqual({ status: 'sent' });
    expect(() => sms.lastOtpFor(phone)).not.toThrow();
  });

  it('POST /auth/otp/verify with the correct OTP issues a token pair', async () => {
    const otp = sms.lastOtpFor(phone);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, otp, deviceId })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.expiresIn).toBe(900);

    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('GET /auth/me returns the authenticated user with resolved roles/permissions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.user.phone).toBe(phone);
    expect(res.body.roles).toEqual([]); // brand-new user, no user_roles assigned yet
    expect(res.body.permissions).toEqual([]);
  });

  it('GET /auth/me without a token is rejected', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('POST /auth/refresh rotates the refresh token and invalidates the old one', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(201);

    expect(res.body.refreshToken).not.toBe(refreshToken);

    // The old refresh token must now be rejected (rotated out).
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('POST /auth/logout revokes the current refresh token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(204);

    // The just-revoked refresh token can no longer be used.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
