import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import type { AuditAction } from './audit-actions';

export interface AuditLogInput {
  actorId: string | null;
  societyId: string | null;
  /** Must come from `AUDIT_ACTIONS` (see `audit-actions.ts`) — a freeform string is a compile error. */
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditLogQuery {
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

/**
 * Shared, cross-module infra — built now (billing session) rather than
 * deferred to Module 22's "natural" phase, specifically so every
 * financially-meaningful write this session has a real audit trail from day
 * one. Every module after this one imports AuditModule and injects this to
 * record sensitive actions (role changes, financial adjustments, ledger
 * reversals, is_sensitive document access, per SRS §12/§22).
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
  ) {}

  /** Accepts an optional transactional `manager` (e.g. the webhook handler's transaction) so the audit write commits atomically with the rest of that operation instead of on its own. */
  async record(input: AuditLogInput, manager?: EntityManager): Promise<void> {
    // Defense-in-depth alongside the AuditAction union (which already
    // blocks this at compile time for normal call sites) — a value forced
    // through with `as AuditAction`, or a future AUDIT_ACTIONS entry that's
    // simply too long, fails loudly here instead of as a raw Postgres
    // "value too long" error surfacing from wherever this got called.
    if (input.action.length > 100) {
      throw new Error(`AuditService.record: action "${input.action}" exceeds audit_logs.action's 100-char limit`);
    }

    const repo = manager ? manager.getRepository(AuditLog) : this.auditLogs;
    const row = repo.create({
      actorId: input.actorId,
      societyId: input.societyId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    await repo.save(row);
  }

  async list(query: AuditLogQuery, scope: TenantScope): Promise<AuditLog[]> {
    let qb = this.auditLogs.createQueryBuilder('log');

    if (!scope.isPlatformScope) {
      if (!scope.societyId) return [];
      qb = qb.where('log.society_id = :societyId', { societyId: scope.societyId });
    }

    if (query.entityType) qb = qb.andWhere('log.entity_type = :entityType', { entityType: query.entityType });
    if (query.entityId) qb = qb.andWhere('log.entity_id = :entityId', { entityId: query.entityId });
    if (query.from) qb = qb.andWhere('log.occurred_at >= :from', { from: query.from });
    if (query.to) qb = qb.andWhere('log.occurred_at <= :to', { to: query.to });

    return qb.orderBy('log.occurred_at', 'DESC').limit(500).getMany();
  }

  /** Same query, shaped for bulk export rather than paginated display — still capped, real export/streaming is a later concern. */
  async export(query: AuditLogQuery, scope: TenantScope): Promise<AuditLog[]> {
    return this.list(query, scope);
  }
}
