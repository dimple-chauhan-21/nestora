import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Complaint, ComplaintPriority, ComplaintStatus } from '../../database/entities/complaint.entity';
import { ComplaintCategory } from '../../database/entities/complaint-category.entity';
import { ComplaintAttachment } from '../../database/entities/complaint-attachment.entity';
import { ComplaintComment } from '../../database/entities/complaint-comment.entity';
import { ComplaintEscalation } from '../../database/entities/complaint-escalation.entity';
import { UserRole } from '../../database/entities/user-role.entity';
import { User } from '../../database/entities/user.entity';
import { Flat } from '../../database/entities/flat.entity';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from '../notification/notification-provider.interface';
import { CLOCK, type Clock } from '../../common/clock';
import { applyResidentScope, assertFlatMatch, assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { CreateComplaintCategoryDto } from './dto/create-complaint-category.dto';
import { ComplaintCategoryResponseDto } from './dto/complaint-category-response.dto';
import { AssignComplaintDto } from './dto/assign-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { ComplaintResponseDto } from './dto/complaint-response.dto';
import { ComplaintCommentResponseDto } from './dto/complaint-comment-response.dto';
import { AssignableStaffDto } from './dto/assignable-staff.dto';

/**
 * Priority -> SLA hours, per §8's own user-flow example ("Urgent = 4-hour
 * SLA") and deliverable #5's explicit "priority->SLA mapping enforced
 * server-side (not client-editable)". `complaint_categories.default_sla_hours`
 * (the SRS's own column) drives auto-routing/assignee defaults instead —
 * see `defaultAssigneeRole` usage below — so the two columns don't compete
 * for the same job. A client can never supply `slaDueAt` directly; it's
 * always derived from `priority` here.
 */
const PRIORITY_SLA_HOURS: Record<string, number> = {
  urgent: 4,
  high: 24,
  medium: 72,
  low: 168,
};

/** Also the assignable-staff pool (§8's assign-to-staff action) — the same people ComplaintService already escalates SLA breaches to. */
export const MANAGER_ROLE_CODES = ['society_admin', 'society_manager'];

function toUserDto(user: User | null | undefined): { id: string; phone: string | null } | null {
  return user ? { id: user.id, phone: user.phone } : null;
}

@Injectable()
export class ComplaintService {
  private readonly logger = new Logger(ComplaintService.name);

  constructor(
    @InjectRepository(Complaint) private readonly complaints: Repository<Complaint>,
    @InjectRepository(ComplaintCategory) private readonly categories: Repository<ComplaintCategory>,
    @InjectRepository(ComplaintAttachment) private readonly attachments: Repository<ComplaintAttachment>,
    @InjectRepository(ComplaintComment) private readonly comments: Repository<ComplaintComment>,
    @InjectRepository(ComplaintEscalation) private readonly escalations: Repository<ComplaintEscalation>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Single-complaint embed — used by every write endpoint (create/assign/updateStatus/submitFeedback), each of which only ever touches one row, so batching isn't relevant here (see toComplaintResponseDtoBatch for `list()`). */
  private async toResponseDto(complaint: Complaint): Promise<ComplaintResponseDto> {
    const [flat, category, raisedByUser, assignedToUser] = await Promise.all([
      this.flats.findOne({ where: { id: complaint.flatId } }),
      this.categories.findOne({ where: { id: complaint.categoryId } }),
      this.users.findOne({ where: { id: complaint.raisedBy } }),
      complaint.assignedTo ? this.users.findOne({ where: { id: complaint.assignedTo } }) : Promise.resolve(null),
    ]);
    return {
      id: complaint.id,
      flat: { id: complaint.flatId, flatNumber: flat?.flatNumber ?? '—' },
      category: { id: complaint.categoryId, name: category?.name ?? '—' },
      raisedBy: toUserDto(raisedByUser),
      assignedTo: toUserDto(assignedToUser),
      priority: complaint.priority,
      description: complaint.description,
      status: complaint.status,
      slaDueAt: complaint.slaDueAt.toISOString(),
      resolvedAt: complaint.resolvedAt ? complaint.resolvedAt.toISOString() : null,
      satisfactionRating: complaint.satisfactionRating,
      createdAt: complaint.createdAt.toISOString(),
    };
  }

  /** Batched embed for `list()` — N complaints, 4 lookup queries total (flats/categories/raisedBy/assignedTo), never N+1. */
  private async toResponseDtoBatch(rows: Complaint[]): Promise<ComplaintResponseDto[]> {
    const flatIds = [...new Set(rows.map((c) => c.flatId))];
    const categoryIds = [...new Set(rows.map((c) => c.categoryId))];
    const userIds = [
      ...new Set([...rows.map((c) => c.raisedBy), ...rows.map((c) => c.assignedTo).filter((id): id is string => id !== null)]),
    ];
    const [flatRows, categoryRows, userRows] = await Promise.all([
      flatIds.length ? this.flats.find({ where: { id: In(flatIds) } }) : Promise.resolve([]),
      categoryIds.length ? this.categories.find({ where: { id: In(categoryIds) } }) : Promise.resolve([]),
      userIds.length ? this.users.find({ where: { id: In(userIds) } }) : Promise.resolve([]),
    ]);
    const flatsById = new Map(flatRows.map((f) => [f.id, f]));
    const categoriesById = new Map(categoryRows.map((c) => [c.id, c]));
    const usersById = new Map(userRows.map((u) => [u.id, u]));

    return rows.map((complaint) => ({
      id: complaint.id,
      flat: { id: complaint.flatId, flatNumber: flatsById.get(complaint.flatId)?.flatNumber ?? '—' },
      category: { id: complaint.categoryId, name: categoriesById.get(complaint.categoryId)?.name ?? '—' },
      raisedBy: toUserDto(usersById.get(complaint.raisedBy)),
      assignedTo: complaint.assignedTo ? toUserDto(usersById.get(complaint.assignedTo)) : null,
      priority: complaint.priority,
      description: complaint.description,
      status: complaint.status,
      slaDueAt: complaint.slaDueAt.toISOString(),
      resolvedAt: complaint.resolvedAt ? complaint.resolvedAt.toISOString() : null,
      satisfactionRating: complaint.satisfactionRating,
      createdAt: complaint.createdAt.toISOString(),
    }));
  }

  async createCategory(dto: CreateComplaintCategoryDto): Promise<ComplaintCategory> {
    const category = this.categories.create({
      societyId: dto.societyId ?? null,
      name: dto.name,
      defaultSlaHours: dto.defaultSlaHours,
      defaultAssigneeRole: dto.defaultAssigneeRole ?? null,
    });
    return this.categories.save(category);
  }

  /**
   * No list endpoint existed before this session — only POST (admin-only).
   * The raise-complaint form needs a real picklist. `society_id IS NULL`
   * rows are global defaults (per the entity's own doc comment), visible
   * alongside this society's own categories to every caller regardless of
   * role — this is a read-only reference list, not tenant-sensitive data.
   */
  async listCategories(scope: TenantScope): Promise<ComplaintCategoryResponseDto[]> {
    if (!scope.societyId) {
      throw new ForbiddenException('A society-scoped caller is required to list complaint categories');
    }

    const rows = await this.categories
      .createQueryBuilder('category')
      .where('category.society_id = :societyId OR category.society_id IS NULL', { societyId: scope.societyId })
      .orderBy('category.name', 'ASC')
      .getMany();

    return rows.map((c) => ({ id: c.id, name: c.name, defaultSlaHours: c.defaultSlaHours }));
  }

  private async loadFlatOrThrow(flatId: string): Promise<Flat> {
    const flat = await this.flats.findOne({ where: { id: flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    return flat;
  }

  private async loadComplaintOrThrow(complaintId: string): Promise<Complaint> {
    const complaint = await this.complaints.findOne({ where: { id: complaintId } });
    if (!complaint) throw new NotFoundException('Complaint not found');
    return complaint;
  }

  async create(dto: CreateComplaintDto, scope: TenantScope, actorId: string): Promise<ComplaintResponseDto> {
    const flat = await this.loadFlatOrThrow(dto.flatId);
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    const category = await this.categories.findOne({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Complaint category not found');

    const slaHours = PRIORITY_SLA_HOURS[dto.priority] ?? PRIORITY_SLA_HOURS['low']!;
    const slaDueAt = new Date(this.clock.now().getTime() + slaHours * 60 * 60 * 1000);

    const complaint = this.complaints.create({
      societyId: flat.societyId,
      flatId: flat.id,
      raisedBy: actorId,
      categoryId: dto.categoryId,
      priority: dto.priority,
      description: dto.description,
      status: 'open',
      slaDueAt,
    });
    const saved = await this.complaints.save(complaint);

    for (const attachment of dto.attachments ?? []) {
      await this.attachments.save(
        this.attachments.create({
          societyId: flat.societyId,
          complaintId: saved.id,
          fileUrl: attachment.fileUrl,
          type: attachment.type,
        }),
      );
    }

    return this.toResponseDto(saved);
  }

  /**
   * Read-triggered sweep for immediacy when someone happens to be looking
   * (same "concrete trigger" precedent as billing's late-fee sweep) — the
   * real, time-guaranteed trigger is ComplaintEscalationScheduler's @Cron,
   * not this. Both share the same idempotent escalateOverdueComplaints.
   */
  async list(
    query: {
      status?: ComplaintStatus | undefined;
      priority?: ComplaintPriority | undefined;
      categoryId?: string | undefined;
      flatId?: string | undefined;
    },
    scope: TenantScope,
  ): Promise<ComplaintResponseDto[]> {
    if (scope.societyId) {
      await this.escalateOverdueComplaints(scope.societyId, this.clock.now());
    }

    let qb = this.complaints.createQueryBuilder('complaint');
    qb = applyResidentScope(qb, 'complaint', scope);
    if (query.status) qb = qb.andWhere('complaint.status = :status', { status: query.status });
    if (query.priority) qb = qb.andWhere('complaint.priority = :priority', { priority: query.priority });
    if (query.categoryId) qb = qb.andWhere('complaint.category_id = :categoryId', { categoryId: query.categoryId });
    if (query.flatId) qb = qb.andWhere('complaint.flat_id = :flatId', { flatId: query.flatId });

    const rows = await qb.orderBy('complaint.created_at', 'DESC').getMany();
    return this.toResponseDtoBatch(rows);
  }

  async findById(complaintId: string, scope: TenantScope): Promise<ComplaintResponseDto> {
    const complaint = await this.loadComplaintOrThrow(complaintId);
    assertSocietyMatch(complaint.societyId, scope);
    assertFlatMatch(complaint.flatId, scope);
    return this.toResponseDto(complaint);
  }

  async assign(complaintId: string, dto: AssignComplaintDto, scope: TenantScope): Promise<ComplaintResponseDto> {
    const complaint = await this.loadComplaintOrThrow(complaintId);
    assertSocietyMatch(complaint.societyId, scope);

    complaint.assignedTo = dto.assignedTo;
    complaint.status = 'assigned';
    const saved = await this.complaints.save(complaint);
    return this.toResponseDto(saved);
  }

  async updateStatus(complaintId: string, dto: UpdateComplaintStatusDto, scope: TenantScope): Promise<ComplaintResponseDto> {
    const complaint = await this.loadComplaintOrThrow(complaintId);
    assertSocietyMatch(complaint.societyId, scope);

    complaint.status = dto.status;
    if (dto.status === 'resolved') {
      complaint.resolvedAt = this.clock.now();
    }
    const saved = await this.complaints.save(complaint);

    // §8's "status-change push/SMS to resident" — a notification failure
    // never blocks the status update itself, which has already committed.
    try {
      await this.notifications.send({
        recipientUserId: saved.raisedBy,
        channel: 'push',
        event: 'complaint.status_changed',
        title: 'Complaint update',
        body: `Your complaint status changed to "${saved.status}".`,
        data: { complaintId: saved.id, status: saved.status },
      });
    } catch (err) {
      this.logger.error(`Failed to send status-change notification for complaint ${saved.id}: ${(err as Error).message}`);
    }

    return this.toResponseDto(saved);
  }

  async addComment(
    complaintId: string,
    dto: CreateCommentDto,
    scope: TenantScope,
    actorId: string,
  ): Promise<ComplaintCommentResponseDto> {
    const complaint = await this.loadComplaintOrThrow(complaintId);
    assertSocietyMatch(complaint.societyId, scope);
    assertFlatMatch(complaint.flatId, scope);

    // A flat-pinned caller can never create an internal note, regardless of
    // what the request body says (deliverable #5 + §8's "staff-only notes").
    const isInternal = scope.flatId !== null ? false : (dto.isInternal ?? false);

    const comment = this.comments.create({
      societyId: complaint.societyId,
      complaintId,
      authorId: actorId,
      body: dto.body,
      isInternal,
    });
    const saved = await this.comments.save(comment);
    const author = await this.users.findOne({ where: { id: actorId } });
    return {
      id: saved.id,
      author: toUserDto(author),
      body: saved.body,
      isInternal: saved.isInternal,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  /**
   * Field/query-level filtering, not row-level: the complaint itself stays
   * visible to a resident-scoped caller, only `is_internal` comment rows
   * within it are excluded from the response (deliverable #5's explicit
   * instruction). Author embedding happens after the filter, batched over
   * whatever survives it.
   */
  async listComments(complaintId: string, scope: TenantScope): Promise<ComplaintCommentResponseDto[]> {
    const complaint = await this.loadComplaintOrThrow(complaintId);
    assertSocietyMatch(complaint.societyId, scope);
    assertFlatMatch(complaint.flatId, scope);

    const allComments = await this.comments.find({ where: { complaintId }, order: { createdAt: 'ASC' } });
    const visible =
      scope.isPlatformScope || scope.flatId === null ? allComments : allComments.filter((c) => !c.isInternal);

    const authorIds = [...new Set(visible.map((c) => c.authorId))];
    const authorRows = authorIds.length ? await this.users.find({ where: { id: In(authorIds) } }) : [];
    const authorsById = new Map(authorRows.map((u) => [u.id, u]));

    return visible.map((comment) => ({
      id: comment.id,
      author: toUserDto(authorsById.get(comment.authorId)),
      body: comment.body,
      isInternal: comment.isInternal,
      createdAt: comment.createdAt.toISOString(),
    }));
  }

  async submitFeedback(complaintId: string, dto: SubmitFeedbackDto, scope: TenantScope): Promise<ComplaintResponseDto> {
    const complaint = await this.loadComplaintOrThrow(complaintId);
    assertSocietyMatch(complaint.societyId, scope);
    assertFlatMatch(complaint.flatId, scope);

    if (complaint.status !== 'resolved') {
      throw new BadRequestException('Feedback can only be submitted for a resolved complaint');
    }
    complaint.satisfactionRating = dto.rating;
    const saved = await this.complaints.save(complaint);

    if (dto.comments) {
      await this.comments.save(
        this.comments.create({
          societyId: complaint.societyId,
          complaintId,
          authorId: complaint.raisedBy,
          body: dto.comments,
          isInternal: false,
        }),
      );
    }

    return this.toResponseDto(saved);
  }

  private async findManagerForSociety(societyId: string): Promise<string | null> {
    const managerRole = await this.userRoles
      .createQueryBuilder('ur')
      .innerJoin('roles', 'r', 'r.id = ur.role_id')
      .where('ur.society_id = :societyId', { societyId })
      .andWhere('ur.flat_id IS NULL')
      .andWhere('ur.deleted_at IS NULL')
      .andWhere('r.code IN (:...codes)', { codes: MANAGER_ROLE_CODES })
      .getOne();
    return managerRole?.userId ?? null;
  }

  /** Deliverable #4's "assign to staff" dropdown — society_admin/society_manager users for this society, same pool as findManagerForSociety but the full list, not just one. */
  async listAssignableStaff(societyId: string, scope: TenantScope): Promise<AssignableStaffDto[]> {
    assertSocietyMatch(societyId, scope);
    const rows = await this.userRoles
      .createQueryBuilder('ur')
      .innerJoin('roles', 'r', 'r.id = ur.role_id')
      .innerJoin('users', 'u', 'u.id = ur.user_id')
      .select(['u.id AS "userId"', 'u.phone AS "phone"', 'r.code AS "roleCode"'])
      .where('ur.society_id = :societyId', { societyId })
      .andWhere('ur.flat_id IS NULL')
      .andWhere('ur.deleted_at IS NULL')
      .andWhere('r.code IN (:...codes)', { codes: MANAGER_ROLE_CODES })
      .getRawMany<{ userId: string; phone: string | null; roleCode: string }>();

    return rows.map((row) => ({ id: row.userId, phone: row.phone, roleCode: row.roleCode }));
  }

  /**
   * Idempotent via `complaint_escalations` — `NOT EXISTS` gates re-sweeping
   * the same complaint twice. `societyId: null` sweeps every society (the
   * cron's use case); a specific society narrows it (the read-triggered
   * sweep's use case).
   */
  async escalateOverdueComplaints(societyId: string | null, asOf: Date): Promise<number> {
    let qb = this.complaints
      .createQueryBuilder('complaint')
      .where('complaint.status IN (:...statuses)', { statuses: ['open', 'assigned', 'in_progress'] })
      .andWhere('complaint.sla_due_at < :asOf', { asOf })
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM complaint_escalations ce WHERE ce.complaint_id = complaint.id)',
      );
    if (societyId) {
      qb = qb.andWhere('complaint.society_id = :societyId', { societyId });
    }
    const overdue = await qb.getMany();

    let escalatedCount = 0;
    for (const complaint of overdue) {
      const managerId = await this.findManagerForSociety(complaint.societyId);
      try {
        await this.escalations.save(
          this.escalations.create({
            societyId: complaint.societyId,
            complaintId: complaint.id,
            escalatedAt: asOf,
            escalatedTo: managerId,
            reason: `SLA breached: due ${complaint.slaDueAt.toISOString()}, still "${complaint.status}" as of ${asOf.toISOString()}`,
          }),
        );
        escalatedCount++;
      } catch {
        // UNIQUE(complaint_id) tripped by a concurrent sweep (cron + read-
        // triggered sweep racing) — already escalated, not a real failure.
      }
    }
    return escalatedCount;
  }
}
