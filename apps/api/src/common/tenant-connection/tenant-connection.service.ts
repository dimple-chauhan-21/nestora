import { Inject, Injectable, OnModuleDestroy, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DataSource, EntityTarget, ObjectLiteral, QueryRunner, Repository } from 'typeorm';
import type { Request } from 'express';

/**
 * The running app connects as `app_write_role` (see .env's DATABASE_URL) —
 * not a table owner, so Postgres RLS actually applies to its queries. RLS
 * policies read three session-local GUCs (`app.current_society_id`,
 * `app.is_platform_scope`, `app.current_user_id`), which this service sets
 * for the request and which then stay in scope for every query that runs
 * on the SAME underlying connection for the rest of it.
 *
 * That "same underlying connection" part is the whole reason this exists as
 * a request-scoped provider rather than a plain injectable: connection
 * pooling means two separate `dataSource.query()` calls can land on two
 * different physical connections, so `SET LOCAL`/`set_config(..., true)`
 * set by the first would simply not be visible to the second. The fix is
 * the standard one for RLS + pooling — hold ONE QueryRunner (one real
 * connection, one transaction) for the lifetime of the request, and give
 * every repository/query in that request the SAME manager. See
 * TenantScopedTypeOrmModule for how `@InjectRepository()` across the app
 * gets wired to this transparently.
 *
 * Connecting and actually SETTING the session variables are two deliberately
 * separate steps (getQueryRunner() vs applyScope()) — not a simplification
 * that could be collapsed. `@InjectRepository()`'s factory calls
 * getQueryRunner() to construct itself, and that construction happens as
 * part of building the request's whole scoped DI sub-tree — which, verified
 * empirically (not assumed from the guards→interceptors→handler docs order),
 * Nest does BEFORE running guards or interceptors for that request. Reading
 * `request.user`/`request.tenantScope` at that point sees neither — they
 * don't exist yet. So getQueryRunner() only connects and opens a
 * transaction; applyScope() — called explicitly by TenantScopeInterceptor,
 * which DOES run after guards, once `request.user` is real — sets the GUCs
 * on that already-open transaction, before the controller method (and
 * hence any actual query) executes.
 *
 * Deliberately NOT used for e2e test fixture setup/verification — those
 * grab repositories directly (`app.get(getRepositoryToken(...))`) outside
 * any HTTP request context, which a request-scoped provider can't serve
 * (no request = no tenant scope to read). Test fixtures use a separate
 * owner-role DataSource instead (test/admin-datasource.ts), the same way
 * migrations and seeds do — fixture setup was never "the thing under test."
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantConnectionService implements OnModuleDestroy {
  private queryRunner: QueryRunner | null = null;
  private connectPromise: Promise<QueryRunner> | null = null;
  private finalized = false;

  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly dataSource: DataSource,
  ) {}

  private async connect(): Promise<QueryRunner> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    this.queryRunner = qr;
    return qr;
  }

  private getQueryRunner(): Promise<QueryRunner> {
    if (this.queryRunner) return Promise.resolve(this.queryRunner);
    if (!this.connectPromise) this.connectPromise = this.connect();
    return this.connectPromise;
  }

  async getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Promise<Repository<T>> {
    const qr = await this.getQueryRunner();
    return qr.manager.getRepository(entity);
  }

  /** Raw passthrough for the handful of services that build parameterized SQL directly (e.g. exclusion-constraint inserts) rather than going through a repository. */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
    const qr = await this.getQueryRunner();
    return qr.query(sql, params);
  }

  /**
   * Runs `fn` inside a SAVEPOINT, not the request's outer transaction
   * directly — needed for any query a caller expects might fail as a
   * *normal, handled* outcome (a UNIQUE/EXCLUDE constraint hit that gets
   * caught and turned into a friendly response, e.g. AmenityBookingService's
   * idempotency-replay and exclusion-conflict handling).
   *
   * Postgres aborts the ENTIRE transaction on any error, not just the
   * failing statement — every later query on that connection fails with
   * "current transaction is aborted" until a ROLLBACK, which never used to
   * matter here (the old code ran each query on its own implicit,
   * autocommitting connection from the pool) but does now that one
   * long-lived transaction spans the whole request. `queryRunner.
   * startTransaction()` called while already inside a transaction is
   * TypeORM's documented nested-transaction support — it issues a REAL
   * SAVEPOINT, and commit/rollback at that depth is RELEASE/ROLLBACK TO
   * SAVEPOINT, leaving the outer transaction (and every query after this
   * one in the same request) unaffected either way.
   */
  async withSavepoint<T>(fn: (qr: QueryRunner) => Promise<T>): Promise<T> {
    const qr = await this.getQueryRunner();
    await qr.startTransaction();
    try {
      const result = await fn(qr);
      await qr.commitTransaction();
      return result;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    }
  }

  /**
   * Called by TenantScopeInterceptor once per real HTTP request (after
   * guards have populated `request.user`), and directly by
   * ComplaintEscalationScheduler for its own synthetic, non-HTTP context.
   * `set_config(name, NULL, true)` sets the GUC to an EMPTY STRING, not to
   * "unset" — confirmed empirically, not assumed (see migration
   * 1700000000021's comment) — but that's fine here: the RLS policies
   * already handle an empty-string GUC via `NULLIF(x, '')` before casting.
   */
  async applyScope(scope: { societyId: string | null; isPlatformScope: boolean }, userId: string | null): Promise<void> {
    const qr = await this.getQueryRunner();
    await qr.query(
      `SELECT
         set_config('app.current_society_id', $1, true),
         set_config('app.is_platform_scope', $2, true),
         set_config('app.current_user_id', $3, true)`,
      [scope.societyId, scope.isPlatformScope ? 'true' : 'false', userId],
    );
  }

  /**
   * Explicit override for the narrow cases where a service needs a
   * DIFFERENT user id mid-request than what the caller's own JWT implies —
   * e.g. PermissionsService resolving a user's own role assignments during
   * login, before any JWT (hence no `request.user`) exists yet.
   */
  async setCurrentUserId(userId: string | null): Promise<void> {
    const qr = await this.getQueryRunner();
    await qr.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
  }

  /**
   * Explicit, awaited commit — called from TenantScopeInterceptor's
   * response pipeline (and, for the one non-HTTP caller, directly from
   * ComplaintEscalationScheduler) so the transaction is guaranteed
   * committed BEFORE the response is sent / the cron tick returns.
   *
   * This deliberately does NOT rely on onModuleDestroy for timing: Nest
   * tears down a request's scoped DI sub-tree (and calls onModuleDestroy on
   * everything in it) on its own schedule, which is not documented or
   * guaranteed to happen before the HTTP response is flushed to the client
   * — a subsequent request racing in before that teardown completes could
   * see an uncommitted transaction. onModuleDestroy stays below only as a
   * safety net for a path that skips this (an interceptor exception before
   * reaching its own cleanup, for instance), not as the primary mechanism.
   */
  async commit(): Promise<void> {
    if (this.finalized || !this.queryRunner) return;
    this.finalized = true;
    try {
      await this.queryRunner.commitTransaction();
    } finally {
      await this.queryRunner.release();
    }
  }

  async rollback(): Promise<void> {
    if (this.finalized || !this.queryRunner) return;
    this.finalized = true;
    try {
      await this.queryRunner.rollbackTransaction();
    } finally {
      await this.queryRunner.release();
    }
  }

  /** Safety net only — see commit()'s comment. */
  async onModuleDestroy(): Promise<void> {
    if (this.finalized || !this.queryRunner) return;
    await this.commit();
  }
}
