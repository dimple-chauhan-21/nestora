import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import request from 'supertest';
import { randomInt } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { SMS_PROVIDER } from '../src/modules/auth/sms/sms-provider.interface';
import { CapturingSmsProvider } from './capturing-sms.provider';
import { getAdminDataSource, closeAdminDataSource } from './admin-datasource';
import { CLOCK, type Clock } from '../src/common/clock';
import { COMPLAINT_SLA_ESCALATION_CRON_NAME } from '../src/modules/complaint/complaint-escalation.scheduler';
import { Society } from '../src/database/entities/society.entity';
import { Flat } from '../src/database/entities/flat.entity';
import { Resident } from '../src/database/entities/resident.entity';
import { Role } from '../src/database/entities/role.entity';
import { UserRole } from '../src/database/entities/user-role.entity';
import { ComplaintCategory } from '../src/database/entities/complaint-category.entity';
import { Complaint } from '../src/database/entities/complaint.entity';
import { ComplaintEscalation } from '../src/database/entities/complaint-escalation.entity';

function randomPhone(): string {
  return `+91${randomInt(6, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

/** A settable Clock the test controls directly — overridden into every module's CLOCK provider for this test run. */
class ControllableClock implements Clock {
  private current = new Date('2026-04-01T00:00:00.000Z');
  now(): Date {
    return this.current;
  }
  setNow(d: Date): void {
    this.current = d;
  }
  advanceHours(hours: number): void {
    this.current = new Date(this.current.getTime() + hours * 60 * 60 * 1000);
  }
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
}

describe('Complaint (e2e)', () => {
  let app: INestApplication;
  let sms: CapturingSmsProvider;
  let clock: ControllableClock;
  let schedulerRegistry: SchedulerRegistry;

  let societies: Repository<Society>;
  let flats: Repository<Flat>;
  let residents: Repository<Resident>;
  let roles: Repository<Role>;
  let userRoles: Repository<UserRole>;
  let categories: Repository<ComplaintCategory>;
  let complaints: Repository<Complaint>;
  let escalations: Repository<ComplaintEscalation>;

  let societyId: string;
  let flatAId: string;
  let flatBId: string;
  let categoryId: string;
  let ownerAToken: string;
  let ownerBToken: string;
  let adminToken: string;
  let adminUserId: string;

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
    clock = new ControllableClock();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useClass(CapturingSmsProvider)
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    sms = moduleRef.get(SMS_PROVIDER);
    schedulerRegistry = moduleRef.get(SchedulerRegistry);

    const adminDb = await getAdminDataSource();
    societies = adminDb.getRepository(Society);
    flats = adminDb.getRepository(Flat);
    residents = adminDb.getRepository(Resident);
    roles = adminDb.getRepository(Role);
    userRoles = adminDb.getRepository(UserRole);
    categories = adminDb.getRepository(ComplaintCategory);
    complaints = adminDb.getRepository(Complaint);
    escalations = adminDb.getRepository(ComplaintEscalation);

    const society = await societies.save(societies.create({ name: `Complaint Test Society ${Date.now()}` }));
    societyId = society.id;

    const flatA = await flats.save(flats.create({ societyId, flatNumber: `A-${Date.now()}`, status: 'occupied' }));
    const flatB = await flats.save(flats.create({ societyId, flatNumber: `B-${Date.now()}`, status: 'occupied' }));
    flatAId = flatA.id;
    flatBId = flatB.id;

    const category = await categories.save(
      categories.create({ societyId, name: 'General', defaultSlaHours: 999, defaultAssigneeRole: null }),
    );
    categoryId = category.id;

    const ownerRole = await roles.findOneOrFail({ where: { code: 'flat_owner' } });
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

    const adminPhone = randomPhone();
    const adminToken0 = await loginViaOtp(adminPhone, 'admin-device');
    adminUserId = decodeUserId(adminToken0);
    await userRoles.save(userRoles.create({ userId: adminUserId, roleId: adminRole.id, societyId, flatId: null }));

    // Re-login now that user_roles rows exist, so JWTs carry resolved scope.
    ownerAToken = await loginViaOtp(ownerAPhone, 'owner-a-device-2');
    ownerBToken = await loginViaOtp(ownerBPhone, 'owner-b-device-2');
    adminToken = await loginViaOtp(adminPhone, 'admin-device-2');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminDataSource();
  });

  it('full lifecycle: raise -> assign -> comment -> resolve -> feedback', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ flatId: flatAId, categoryId, priority: 'medium', description: 'Leaking tap in kitchen' })
      .expect(201);
    const complaintId = createRes.body.id;
    expect(createRes.body.status).toBe('open');
    expect(createRes.body.raisedBy).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/api/v1/complaints/${complaintId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedTo: adminUserId })
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe('assigned');
        expect(res.body.assignedTo).toBe(adminUserId);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/complaints/${complaintId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'Plumber scheduled for tomorrow', isInternal: false })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' })
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe('resolved');
        expect(res.body.resolvedAt).toBeTruthy();
      });

    await request(app.getHttpServer())
      .post(`/api/v1/complaints/${complaintId}/feedback`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ rating: 5, comments: 'Fixed quickly, thanks!' })
      .expect(201)
      .then((res) => {
        expect(res.body.satisfactionRating).toBe(5);
      });

    const commentsRes = await request(app.getHttpServer())
      .get(`/api/v1/complaints/${complaintId}/comments`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    expect(commentsRes.body.length).toBeGreaterThanOrEqual(2); // status-note + feedback comment
  });

  it("a Tenant/Owner cannot read another flat's complaint (ABAC boundary)", async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ flatId: flatAId, categoryId, priority: 'low', description: "Flat A's private complaint" })
      .expect(201);
    const complaintId = createRes.body.id;

    // Owner A can read their own complaint's comments.
    await request(app.getHttpServer())
      .get(`/api/v1/complaints/${complaintId}/comments`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    // Owner B cannot.
    await request(app.getHttpServer())
      .get(`/api/v1/complaints/${complaintId}/comments`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(403);
  });

  it('SLA-breach escalation actually fires via the registered cron job, not a direct service call', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ flatId: flatAId, categoryId, priority: 'urgent', description: 'No water since morning' })
      .expect(201);
    const complaintId = createRes.body.id;

    const before = await complaints.findOneOrFail({ where: { id: complaintId } });
    // urgent = 4h SLA — confirm no escalation exists yet, well before breach.
    expect(await escalations.findOne({ where: { complaintId } })).toBeNull();

    // Move the shared clock 5 hours past creation — now overdue (SLA was 4h).
    clock.setNow(new Date(before.createdAt.getTime() + 5 * 60 * 60 * 1000));

    // Fire the *registered* cron job through SchedulerRegistry/CronJob's own
    // API — not a direct call to ComplaintService.escalateOverdueComplaints.
    // This proves the job is actually wired into the scheduler under its
    // expected name, not just that the underlying logic works standalone.
    const job = schedulerRegistry.getCronJob(COMPLAINT_SLA_ESCALATION_CRON_NAME);
    job.fireOnTick();

    // fireOnTick() doesn't return/await the async handler's promise, so poll
    // briefly for the side effect rather than asserting synchronously.
    await waitFor(async () => (await escalations.findOne({ where: { complaintId } })) !== null);

    const escalationRows = await escalations.find({ where: { complaintId } });
    expect(escalationRows).toHaveLength(1);
    expect(escalationRows[0]?.escalatedTo).toBe(adminUserId);
    expect(escalationRows[0]?.reason).toContain('SLA breached');

    // Re-firing the same job again must not double-escalate (idempotency).
    job.fireOnTick();
    await new Promise((r) => setTimeout(r, 300));
    const stillOne = await escalations.find({ where: { complaintId } });
    expect(stillOne).toHaveLength(1);
  });
});
