import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantScope } from '../interceptors/tenant-scope.interceptor';

/**
 * Reads the ABAC tenant scope attached by TenantScopeInterceptor. Not wired to
 * any real resource yet (no other modules have queries to filter) — this is
 * the seam future modules (society, resident, ...) inject to scope their
 * repository queries by society_id/flat_id.
 */
export const CurrentTenantScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantScope => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantScope as TenantScope;
  },
);
