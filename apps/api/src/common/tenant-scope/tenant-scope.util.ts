import { ForbiddenException } from '@nestjs/common';
import type { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import type { TenantScope } from '../interceptors/tenant-scope.interceptor';

/**
 * Application-layer ABAC enforcement — the mechanism chosen for this session
 * (see conversation/plan): explicit, visible filters added at each service's
 * query-builder call site, not a repository wrapper or query middleware.
 * RLS policies exist on every table these guard as a second layer, but are
 * currently inert against the app's own (table-owning) DB role — see
 * KNOWN_GAPS.md. This helper is the one enforcing the boundary today.
 *
 * `alias` must always be a literal string supplied by the calling service
 * (e.g. 'resident'), never user input — it's interpolated directly into SQL.
 */

/**
 * Scopes a query to the caller's society — used for society-wide resources
 * (amenities, documents, rules, emergency contacts, settings) where
 * flat-level narrowing doesn't apply.
 */
export function applySocietyScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  scope: TenantScope,
): SelectQueryBuilder<T> {
  if (scope.isPlatformScope) return qb;
  if (!scope.societyId) return qb.andWhere('1 = 0');
  return qb.andWhere(`${alias}.society_id = :scopeSocietyId`, {
    scopeSocietyId: scope.societyId,
  });
}

/**
 * Scopes a query for resident-module resources. The same `resident:manage`/
 * `resident:read` permission means different row-scope depending on the
 * caller's role: a Society Admin/Manager's `user_roles` assignment carries no
 * flat_id (society-wide), while an Owner/Tenant's assignment is pinned to
 * their flat_id (self-unit only, per SRS §5.3's "Self-unit" cells). That
 * distinction is already resolved into the JWT's tenantScope by
 * PermissionsService — if `scope.flatId` is set, narrow to that flat; if not,
 * fall back to the society-wide scope.
 */
export function applyResidentScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  scope: TenantScope,
): SelectQueryBuilder<T> {
  if (scope.isPlatformScope) return qb;
  if (scope.flatId) {
    return qb.andWhere(`${alias}.flat_id = :scopeFlatId`, { scopeFlatId: scope.flatId });
  }
  if (scope.societyId) {
    return qb.andWhere(`${alias}.society_id = :scopeSocietyId`, {
      scopeSocietyId: scope.societyId,
    });
  }
  return qb.andWhere('1 = 0');
}

/**
 * For endpoints where the resource's society is named in the URL path
 * (`/societies/{id}/...`): reject up front if the path doesn't match the
 * caller's own society, rather than silently substituting the caller's
 * society or relying solely on the query-level filter to save them.
 */
export function assertSocietyMatch(pathSocietyId: string, scope: TenantScope): void {
  if (scope.isPlatformScope) return;
  if (scope.societyId !== pathSocietyId) {
    throw new ForbiddenException("Not authorized for this society's resources");
  }
}

/**
 * For endpoints named by flat (`/flats/{id}/...`): a society-wide role
 * (flatId null on their scope) may act on any flat within their own society
 * — that's checked separately by the caller via the flat's society_id. A
 * flat-pinned role (Owner/Tenant) may only act on their own flat.
 */
export function assertFlatMatch(pathFlatId: string, scope: TenantScope): void {
  if (scope.isPlatformScope) return;
  if (scope.flatId && scope.flatId !== pathFlatId) {
    throw new ForbiddenException("Not authorized for this flat's resources");
  }
}
