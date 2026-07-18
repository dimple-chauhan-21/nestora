import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { NoticeBoardService } from './notice-board.service';
import { Notice } from '../../database/entities/notice.entity';
import { NoticeAttachment } from '../../database/entities/notice-attachment.entity';
import { NoticeRead } from '../../database/entities/notice-read.entity';
import { UserRole } from '../../database/entities/user-role.entity';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

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

/** Only handles the `type: 'all'` branch's query shape — the branch this test needs (no joins). */
class FakeUserRoleRepo extends FakeRepo<UserRole> {
  createQueryBuilder() {
    const rows = this.rows;
    let societyFilter: string | undefined;
    const qb = {
      select() {
        return qb;
      },
      where() {
        return qb;
      },
      andWhere(sql: string, params?: Record<string, unknown>) {
        if (sql.includes('society_id') && params?.societyId) societyFilter = params.societyId as string;
        return qb;
      },
      innerJoin() {
        return qb;
      },
      async getRawMany() {
        return rows
          .filter((r) => !r.deletedAt)
          .filter((r) => !societyFilter || r.societyId === societyFilter)
          .map((r) => ({ userId: r.userId }));
      },
    };
    return qb;
  }
}

const societyId = randomUUID();
const actorId = randomUUID();
const SOCIETY_ADMIN_SCOPE: TenantScope = { societyId, flatId: null, isPlatformScope: false };

function buildService() {
  const notices = new FakeRepo<Notice>();
  const attachments = new FakeRepo<NoticeAttachment>();
  const reads = new FakeRepo<NoticeRead>();
  const userRoles = new FakeUserRoleRepo();

  const service = new NoticeBoardService(
    notices as unknown as Repository<Notice>,
    attachments as unknown as Repository<NoticeAttachment>,
    reads as unknown as Repository<NoticeRead>,
    userRoles as unknown as Repository<UserRole>,
  );

  return { service, notices, userRoles };
}

describe('NoticeBoardService.create — audience resolved once, at publish time (snapshot, not live)', () => {
  it('stores the resolved recipient list, and a later change to the underlying audience source does not retroactively change it', async () => {
    const { service, notices, userRoles } = buildService();
    const userA = randomUUID();
    const userB = randomUUID();
    userRoles.rows.push({ id: randomUUID(), userId: userA, roleId: randomUUID(), societyId, flatId: null, deletedAt: null } as UserRole);
    userRoles.rows.push({ id: randomUUID(), userId: userB, roleId: randomUUID(), societyId, flatId: null, deletedAt: null } as UserRole);

    const notice = await service.create(
      { title: 'AGM this weekend', body: 'Details inside', targetAudience: { type: 'all' } },
      SOCIETY_ADMIN_SCOPE,
      actorId,
    );

    expect(notice.resolvedRecipientUserIds.sort()).toEqual([userA, userB].sort());

    // Simulate userB moving out / their user_roles row being deleted — a
    // live re-resolution would now exclude them.
    const userBRow = userRoles.rows.find((r) => r.userId === userB)!;
    userBRow.deletedAt = new Date();

    // The already-published notice's snapshot is untouched.
    const reloaded = await notices.findOne({ where: { id: notice.id } });
    expect(reloaded?.resolvedRecipientUserIds.sort()).toEqual([userA, userB].sort());
  });

  it('rejects a notice whose target_audience resolves to zero recipients', async () => {
    const { service } = buildService();
    // No user_roles rows seeded — 'all' resolves to an empty list.
    await expect(
      service.create({ title: 'Nobody will see this', body: 'x', targetAudience: { type: 'all' } }, SOCIETY_ADMIN_SCOPE, actorId),
    ).rejects.toThrow('target_audience must resolve to at least one recipient');
  });
});
