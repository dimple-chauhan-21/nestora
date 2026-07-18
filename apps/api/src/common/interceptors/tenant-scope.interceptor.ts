import { CallHandler, ExecutionContext, Injectable, Scope } from '@nestjs/common';
import type { NestInterceptor } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { TenantConnectionService } from '../tenant-connection/tenant-connection.service';
import type { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';

export interface TenantScope {
  societyId: string | null;
  flatId: string | null;
  isPlatformScope: boolean;
}

/**
 * Derives the row-scoping context (society_id/flat_id) from the
 * authenticated user's JWT, attaches it to the request as
 * `request.tenantScope` (still read by controllers via
 * `@CurrentTenantScope()` for application-layer ABAC filtering), AND
 * explicitly pushes the matching `app.current_society_id`/
 * `app.is_platform_scope` RLS session variables onto this request's
 * TenantConnectionService — the real DB-level enforcement, SRS §10.5.
 *
 * That second part has to happen HERE, not lazily inside
 * TenantConnectionService itself: `@InjectRepository()`'s factory (see
 * TenantScopedTypeOrmModule) calls `TenantConnectionService.getQueryRunner()`
 * to construct the repository, and that construction happens as part of
 * building the request's whole scoped DI sub-tree — which Nest does BEFORE
 * running guards or interceptors (verified empirically: `request.user`
 * doesn't exist yet at that point). This interceptor runs AFTER guards, so
 * `request.user` is real by the time it does — it's the earliest point
 * that's actually true, hence the earliest safe point to set the GUCs.
 *
 * Request-scoped (not the historical singleton) specifically so it can
 * inject the SAME per-request TenantConnectionService instance that every
 * repository in this request shares, and explicitly commit or roll back its
 * transaction in the response pipeline — before the HTTP response is sent —
 * rather than relying on Nest's own (undocumented-timing) teardown of the
 * request-scoped DI sub-tree. See TenantConnectionService.commit()'s
 * comment for why that distinction matters.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantScopeInterceptor implements NestInterceptor {
  constructor(private readonly tenantConn: TenantConnectionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    const tenantScope: TenantScope = {
      societyId: user?.societyId ?? null,
      flatId: user?.flatId ?? null,
      isPlatformScope: user?.roles.includes('super_admin') ?? false,
    };
    request.tenantScope = tenantScope;

    return from(this.tenantConn.applyScope(tenantScope, user?.userId ?? null)).pipe(
      mergeMap(() => next.handle()),
      mergeMap((data) => from(this.tenantConn.commit().then(() => data))),
      catchError((err) => from(this.tenantConn.rollback().then(() => Promise.reject(err)))),
    );
  }
}
