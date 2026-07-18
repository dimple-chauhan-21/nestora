import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Complaint, ComplaintStatus } from '../../database/entities/complaint.entity';
import { ComplaintCategory } from '../../database/entities/complaint-category.entity';
import { ComplaintAttachment } from '../../database/entities/complaint-attachment.entity';
import { ComplaintComment } from '../../database/entities/complaint-comment.entity';
import { ComplaintEscalation } from '../../database/entities/complaint-escalation.entity';
import { UserRole } from '../../database/entities/user-role.entity';
import { Flat } from '../../database/entities/flat.entity';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from '../notification/notification-provider.interface';
import { CLOCK, type Clock } from '../../common/clock';
import { applyResidentScope, assertFlatMatch, assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { CreateComplaintCategoryDto } from './dto/create-complaint-category.dto';
import { AssignComplaintDto } from './dto/assign-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';

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

const MANAGER_ROLE_CODES = ['society_admin', 'society_manager'];

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
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createCategory(dto: CreateComplaintCategoryDto): Promise<ComplaintCategory> {
    const category = this.categories.create({
      societyId: dto.societyId ?? null,
      name: dto.name,
      defaultSlaHours: dto.defaultSlaHours,
      defaultAssigneeRole: dto.defaultAssigneeRole ?? null,
    });
    return this.categories.save(category);
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

  async create(dto: CreateComplaintDto, scope: TenantScope, actorId: string): Promise<Complaint> {
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

    return saved;
  }

  /**
   * Read-triggered sweep for immediacy when someone happens to be looking
   * (same "concrete trigger" precedent as billing's late-fee sweep) — the
   * real, time-guaranteed trigger is ComplaintEscalationScheduler's @Cron,
   * not this. Both share the same idempotent escalateOverdueComplaints.
   */
  async list(
    query: { status?: ComplaintStatus | undefined; categoryId?: string | undefined; flatId?: string | undefined },
    scope: TenantScope,
  ): Promise<Complaint[]> {
    if (scope.societyId) {
      await this.escalateOverdueComplaints(scope.societyId, this.clock.now());
    }

    let qb = this.complaints.createQueryBuilder('complaint');
    qb = applyResidentScope(qb, 'complaint', scope);
    if (query.status) qb = qb.andWhere('complaint.status = :status', { status: query.status });
    if (query.categoryId) qb = qb.andWhere('complaint.category_id = :categoryId', { categoryId: query.categoryId });
    if (query.flatId) qb = qb.andWhere('complaint.flat_id = :flatId', { flatId: query.flatId });

    return qb.orderBy('complaint.created_at', 'DESC').getMany();
  }

  async assign(complaintId: string, dto: AssignComplaintDto, scope: TenantScope): Promise<Complaint> {
    const complaint = await this.loadComplaintOrThrow(complaintId);
    assertSocietyMatch(complaint.societyId, scope);

    complaint.assignedTo = dto.assignedTo;
    complaint.status = 'assigned';
    return this.complaints.save(complaint);
  }

  async updateStatus(complaintId: string, dto: UpdateComplaintStatusDto, scope: TenantScope): Promise<Complaint> {
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

    return saved;
  }

  async addComment(complaintId: string, dto: CreateCommentDto, scope: TenantScope, actorId: string): Promise<ComplaintComment> {
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
    return this.comments.save(comment);
  }

  /**
   * Field/query-level filtering, not row-level: the complaint itself stays
   * visible to a resident-scoped caller, only `is_internal` comment rows
   * within it are excluded from the response (deliverable #5's explicit
   * instruction).
   */
  async listComments(complaintId: string, scope: TenantScope): Promise<ComplaintComment[]> {
    const complaint = await this.loadComplaintOrThrow(complaintId);
    assertSocietyMatch(complaint.societyId, scope);
    assertFlatMatch(complaint.flatId, scope);

    const allComments = await this.comments.find({ where: { complaintId }, order: { createdAt: 'ASC' } });
    if (scope.isPlatformScope || scope.flatId === null) return allComments;
    return allComments.filter((c) => !c.isInternal);
  }

  async submitFeedback(complaintId: string, dto: SubmitFeedbackDto, scope: TenantScope): Promise<Complaint> {
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

    return saved;
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
