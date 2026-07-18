import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Notice, type NoticeTargetAudience } from '../../database/entities/notice.entity';
import { NoticeAttachment } from '../../database/entities/notice-attachment.entity';
import { NoticeRead } from '../../database/entities/notice-read.entity';
import { UserRole } from '../../database/entities/user-role.entity';
import { assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateNoticeDto } from './dto/create-notice.dto';

@Injectable()
export class NoticeBoardService {
  constructor(
    @InjectRepository(Notice) private readonly notices: Repository<Notice>,
    @InjectRepository(NoticeAttachment) private readonly attachments: Repository<NoticeAttachment>,
    @InjectRepository(NoticeRead) private readonly reads: Repository<NoticeRead>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
  ) {}

  /**
   * Resolves `target_audience` to a concrete recipient list *once*, at
   * creation/publish time — deliverable #7's snapshot requirement. A later
   * tower deletion (or role reassignment) never changes what a published
   * notice's read-report says, because this list is stored, not re-derived.
   */
  private async resolveRecipients(societyId: string, audience: CreateNoticeDto['targetAudience']): Promise<string[]> {
    let qb = this.userRoles
      .createQueryBuilder('ur')
      .select('DISTINCT ur.user_id', 'userId')
      .where('ur.deleted_at IS NULL');

    if (audience.type === 'all') {
      qb = qb.andWhere('ur.society_id = :societyId', { societyId });
    } else if (audience.type === 'tower_ids') {
      if (!audience.towerIds || audience.towerIds.length === 0) {
        throw new BadRequestException('target_audience.towerIds must be a non-empty array for type "tower_ids"');
      }
      qb = qb
        .innerJoin('flats', 'f', 'f.id = ur.flat_id')
        .andWhere('f.tower_id IN (:...towerIds)', { towerIds: audience.towerIds });
    } else if (audience.type === 'role') {
      if (!audience.role) {
        throw new BadRequestException('target_audience.role is required for type "role"');
      }
      qb = qb
        .innerJoin('roles', 'r', 'r.id = ur.role_id')
        .andWhere('ur.society_id = :societyId', { societyId })
        .andWhere('r.code = :role', { role: audience.role });
    }

    const rows = await qb.getRawMany<{ userId: string }>();
    return rows.map((r) => r.userId);
  }

  async create(dto: CreateNoticeDto, scope: TenantScope, actorId: string): Promise<Notice> {
    if (scope.isPlatformScope || !scope.societyId) {
      throw new ForbiddenException('A society-scoped caller is required to publish a notice');
    }
    const societyId = scope.societyId;

    const recipients = await this.resolveRecipients(societyId, dto.targetAudience);
    if (recipients.length === 0) {
      throw new BadRequestException('target_audience must resolve to at least one recipient');
    }

    const now = new Date();
    const notice: Notice = this.notices.create();
    notice.societyId = societyId;
    notice.title = dto.title;
    notice.body = dto.body;
    notice.category = dto.category ?? null;
    notice.targetAudience = dto.targetAudience as NoticeTargetAudience;
    notice.resolvedRecipientUserIds = recipients;
    notice.isPinned = dto.isPinned ?? false;
    notice.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    notice.publishedBy = actorId;
    notice.publishedAt = now;
    notice.createdBy = actorId;
    notice.updatedBy = actorId;
    const saved = await this.notices.save(notice);

    for (const fileUrl of dto.attachmentUrls ?? []) {
      await this.attachments.save(this.attachments.create({ societyId, noticeId: saved.id, fileUrl }));
    }

    return saved;
  }

  /**
   * Society-wide roles (Admin/Manager/Committee) see every notice in their
   * society; a flat-pinned caller (Owner/Tenant/family) sees only notices
   * whose resolved snapshot actually includes them — makes the audience
   * mechanism functionally meaningful, not just an administrative record.
   */
  async listForSociety(societyId: string, scope: TenantScope, callerUserId: string): Promise<Notice[]> {
    assertSocietyMatch(societyId, scope);

    const all = await this.notices.find({
      where: { societyId },
      order: { isPinned: 'DESC', createdAt: 'DESC' },
    });
    if (scope.isPlatformScope || scope.flatId === null) return all;
    return all.filter((n) => n.resolvedRecipientUserIds.includes(callerUserId));
  }

  private async loadNoticeOrThrow(noticeId: string): Promise<Notice> {
    const notice = await this.notices.findOne({ where: { id: noticeId } });
    if (!notice) throw new NotFoundException('Notice not found');
    return notice;
  }

  async markRead(noticeId: string, scope: TenantScope, userId: string): Promise<NoticeRead> {
    const notice = await this.loadNoticeOrThrow(noticeId);
    assertSocietyMatch(notice.societyId, scope);

    const existing = await this.reads.findOne({ where: { noticeId, userId } });
    if (existing) return existing;

    const record = this.reads.create({ societyId: notice.societyId, noticeId, userId, readAt: new Date() });
    try {
      return await this.reads.save(record);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const race = await this.reads.findOne({ where: { noticeId, userId } });
        if (race) return race;
      }
      throw err;
    }
  }

  async readReport(
    noticeId: string,
    scope: TenantScope,
  ): Promise<{ totalRecipients: number; readCount: number; readUserIds: string[] }> {
    const notice = await this.loadNoticeOrThrow(noticeId);
    assertSocietyMatch(notice.societyId, scope);

    const readRows = await this.reads.find({ where: { noticeId } });
    return {
      totalRecipients: notice.resolvedRecipientUserIds.length,
      readCount: readRows.length,
      readUserIds: readRows.map((r) => r.userId),
    };
  }
}
