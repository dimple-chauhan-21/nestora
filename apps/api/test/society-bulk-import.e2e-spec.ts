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
import { Role } from '../src/database/entities/role.entity';
import { UserRole } from '../src/database/entities/user-role.entity';

function randomPhone(): string {
  return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

/**
 * The one genuine multipart file-upload endpoint in the API today (every
 * other module's "document"/"photo" field is just a client-supplied URL
 * string, not a real upload — see KNOWN_GAPS.md). Confirms the MIME
 * allow-list + size cap added to FileInterceptor's options actually reject
 * bad input, not just that they compile.
 */
describe('Society bulk flat import — upload validation (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;
  let societies: Repository<Society>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;
  let societyId: string;
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
    roles = adminDb.getRepository(Role);
    userRoles = adminDb.getRepository(UserRole);

    const society = await societies.save(societies.create({ name: `Bulk Import Society ${Date.now()}` }));
    societyId = society.id;

    const adminRole = await roles.findOneOrFail({ where: { code: 'society_admin' } });
    const adminPhone = randomPhone();
    const adminToken0 = await loginViaOtp(adminPhone, 'bulk-admin-setup');
    await userRoles.save(
      userRoles.create({ userId: decodeUserId(adminToken0), roleId: adminRole.id, societyId, flatId: null }),
    );
    adminToken = await loginViaOtp(adminPhone, 'bulk-admin-2');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  it('accepts a well-formed CSV and imports the flats', async () => {
    const csv = 'flat_number\nBI-101\nBI-102\n';
    const res = await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/flats/bulk-import`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(csv), { filename: 'flats.csv', contentType: 'text/csv' })
      .expect(201);
    expect(res.body.imported).toBe(2);
  });

  it('rejects a file whose declared MIME type is not on the CSV allow-list', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/flats/bulk-import`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('<html>not a csv</html>'), { filename: 'flats.html', contentType: 'text/html' })
      .expect(415);
  });

  it('rejects a file larger than the configured size cap', async () => {
    // MAX_CSV_UPLOAD_BYTES is 5 MiB — one byte over trips the limit.
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');
    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/flats/bulk-import`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', oversized, { filename: 'huge.csv', contentType: 'text/csv' })
      .expect((res) => {
        if (![400, 413].includes(res.status)) {
          throw new Error(`expected 400 or 413 for oversized upload, got ${res.status}`);
        }
      });
  });
});
