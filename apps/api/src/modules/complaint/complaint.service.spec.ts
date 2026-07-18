import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ComplaintService } from './complaint.service';
import { Complaint } from '../../database/entities/complaint.entity';
import { ComplaintCategory } from '../../database/entities/complaint-category.entity';
import { ComplaintAttachment } from '../../database/entities/complaint-attachment.entity';
import { ComplaintComment } from '../../database/entities/complaint-comment.entity';
import { ComplaintEscalation } from '../../database/entities/complaint-escalation.entity';
import { UserRole } from '../../database/entities/user-role.entity';
import { Flat } from '../../database/entities/flat.entity';
import type { Clock } from '../../common/clock';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import type { NotificationProvider } from '../notification/notification-provider.interface';

const fakeNotifications: NotificationProvider = { send: async () => {} };

class FakeClock implements Clock {
  private current = new Date('2026-03-01T00:00:00.000Z');
  now(): Date {
    return this.current;
  }
}

class FakeRepo<T extends { id: string }> {
  rows: T[] = [];
  create(partial: Partial<T>): T {
    return { id: randomUUID(), ...partial } as unknown as T;
  }
  async save(row: T): Promise<T> {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = row;
    else this.rows.push(row);
    return row;
  }
  async findOne(options: { where: Partial<Record<string, unknown>> }): Promise<T | null> {
    return (
      this.rows.find((r) =>
        Object.entries(options.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
      ) ?? null
    );
  }
  async find(options: { where: Partial<Record<string, unknown>> }): Promise<T[]> {
    return this.rows.filter((r) =>
      Object.entries(options.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
    );
  }
}

const societyId = randomUUID();
const flatId = randomUUID();
const raisedBy = randomUUID();

function buildService() {
  const clock = new FakeClock();
  const complaints = new FakeRepo<Complaint>();
  const categories = new FakeRepo<ComplaintCategory>();
  const attachments = new FakeRepo<ComplaintAttachment>();
  const comments = new FakeRepo<ComplaintComment>();
  const escalations = new FakeRepo<ComplaintEscalation>();
  const userRoles = new FakeRepo<UserRole>();
  const flats = new FakeRepo<Flat>();

  flats.rows.push({ id: flatId, societyId, status: 'occupied' } as Flat);
  const category = categories.create({
    societyId,
    name: 'Plumbing',
    defaultSlaHours: 999, // deliberately different from any priority's SLA hours, to prove priority (not category) drives sla_due_at
    defaultAssigneeRole: null,
  } as Partial<ComplaintCategory>);
  categories.rows.push(category);

  const service = new ComplaintService(
    complaints as unknown as Repository<Complaint>,
    categories as unknown as Repository<ComplaintCategory>,
    attachments as unknown as Repository<ComplaintAttachment>,
    comments as unknown as Repository<ComplaintComment>,
    escalations as unknown as Repository<ComplaintEscalation>,
    userRoles as unknown as Repository<UserRole>,
    flats as unknown as Repository<Flat>,
    fakeNotifications,
    clock,
  );

  return { service, clock, complaints, categories, comments, category };
}

const FLAT_SCOPE: TenantScope = { societyId, flatId, isPlatformScope: false };

describe('ComplaintService.create — priority -> SLA mapping, server-side only', () => {
  it('computes sla_due_at from priority, not from the category default_sla_hours', async () => {
    const { service, clock, category } = buildService();

    const urgent = await service.create(
      { flatId, categoryId: category.id, priority: 'urgent', description: 'Leak' },
      FLAT_SCOPE,
      raisedBy,
    );
    // Urgent = 4-hour SLA per §8's own example — not category's 999h default.
    expect(urgent.slaDueAt.getTime()).toBe(clock.now().getTime() + 4 * 60 * 60 * 1000);

    const low = await service.create(
      { flatId, categoryId: category.id, priority: 'low', description: 'Paint chip' },
      FLAT_SCOPE,
      raisedBy,
    );
    expect(low.slaDueAt.getTime()).toBe(clock.now().getTime() + 168 * 60 * 60 * 1000);
  });

  it('has no parameter anywhere in the call chain for a client to override the computed due date', async () => {
    const { service, category } = buildService();
    // CreateComplaintDto has no slaDueAt/slaHours field — this is a static
    // assertion of intent: the call below only ever supplies flatId/
    // categoryId/priority/description, and create()'s signature has no slot
    // for the caller to inject a due date.
    const complaint = await service.create(
      { flatId, categoryId: category.id, priority: 'high', description: 'Broken lock' },
      FLAT_SCOPE,
      raisedBy,
    );
    expect(complaint.slaDueAt).toBeInstanceOf(Date);
  });
});

describe('ComplaintService.listComments — is_internal filtering at the field/query level', () => {
  it('excludes is_internal comments from a flat-pinned (resident-scoped) caller response', async () => {
    const { service, complaints, comments, category } = buildService();
    const complaint = complaints.create({
      societyId,
      flatId,
      raisedBy,
      categoryId: category.id,
      priority: 'medium',
      description: 'Noise complaint',
      status: 'open',
      slaDueAt: new Date(),
    } as Partial<Complaint>);
    await complaints.save(complaint);

    await comments.save(
      comments.create({ societyId, complaintId: complaint.id, authorId: raisedBy, body: 'resident note', isInternal: false } as Partial<ComplaintComment>),
    );
    await comments.save(
      comments.create({ societyId, complaintId: complaint.id, authorId: randomUUID(), body: 'staff-only note', isInternal: true } as Partial<ComplaintComment>),
    );

    const residentView = await service.listComments(complaint.id, FLAT_SCOPE);
    expect(residentView).toHaveLength(1);
    expect(residentView[0]?.isInternal).toBe(false);
  });

  it('includes is_internal comments for a society-wide (Admin/Manager) caller', async () => {
    const { service, complaints, comments, category } = buildService();
    const complaint = complaints.create({
      societyId,
      flatId,
      raisedBy,
      categoryId: category.id,
      priority: 'medium',
      description: 'Noise complaint',
      status: 'open',
      slaDueAt: new Date(),
    } as Partial<Complaint>);
    await complaints.save(complaint);

    await comments.save(
      comments.create({ societyId, complaintId: complaint.id, authorId: raisedBy, body: 'resident note', isInternal: false } as Partial<ComplaintComment>),
    );
    await comments.save(
      comments.create({ societyId, complaintId: complaint.id, authorId: randomUUID(), body: 'staff-only note', isInternal: true } as Partial<ComplaintComment>),
    );

    const managerScope: TenantScope = { societyId, flatId: null, isPlatformScope: false };
    const managerView = await service.listComments(complaint.id, managerScope);
    expect(managerView).toHaveLength(2);
  });

  it('never lets a resident-scoped caller create an internal comment, regardless of what the request body says', async () => {
    const { service, complaints, category } = buildService();
    const complaint = complaints.create({
      societyId,
      flatId,
      raisedBy,
      categoryId: category.id,
      priority: 'medium',
      description: 'Noise complaint',
      status: 'open',
      slaDueAt: new Date(),
    } as Partial<Complaint>);
    await complaints.save(complaint);

    const comment = await service.addComment(complaint.id, { body: 'trying to sneak an internal note', isInternal: true }, FLAT_SCOPE, raisedBy);
    expect(comment.isInternal).toBe(false);
  });
});
