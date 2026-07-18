import { ForbiddenException } from '@nestjs/common';

/**
 * Same shape as tenant-scope.util.ts's assertSocietyMatch/assertFlatMatch —
 * explicit assertion at the service call site, not hidden middleware. Scoped
 * by gate_id instead of society_id/flat_id.
 *
 * Unlike society_id/flat_id (resolved once into the JWT at login, stable for
 * the session), a guard's active gate is resolved *fresh from the `guards`
 * table on every gate-scoped request* rather than embedded in the JWT — a
 * guard's gate assignment can change between requests (kiosk reassignment)
 * and a stale JWT claim would let a guard keep acting on a gate they were
 * moved off of until their token expires. See GuardService for where this
 * gets called after a fresh `guards` row lookup.
 */
export function assertGateMatch(pathGateId: string, guardGateId: string | null): void {
  if (!guardGateId) {
    throw new ForbiddenException('No gate assigned — log in at a gate kiosk first');
  }
  if (guardGateId !== pathGateId) {
    throw new ForbiddenException(
      "Not authorized for this gate's resources — an explicit gate-switch (re-login at that gate) is required",
    );
  }
}
