/**
 * Shape embedded in the RS256 access token payload and attached to
 * `request.user` by JwtStrategy. Roles/permissions are resolved once at
 * login/refresh time (not re-queried per request) — acceptable staleness
 * window is bounded by the 15-minute access-token lifetime.
 */
export interface AuthenticatedUser {
  userId: string;
  phone: string | null;
  email: string | null;
  roles: string[];
  permissions: string[];
  societyId: string | null;
  flatId: string | null;
  deviceId: string;
}

export interface AccessTokenPayload {
  sub: string;
  phone: string | null;
  email: string | null;
  roles: string[];
  permissions: string[];
  societyId: string | null;
  flatId: string | null;
  deviceId: string;
}
