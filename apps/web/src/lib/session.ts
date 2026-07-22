import { cookies } from 'next/headers';
import type { TokenPair, TokenStore } from '@nestora/api-client';

/**
 * JWT storage: httpOnly cookies set by Next.js's own server, never
 * localStorage/sessionStorage and never a client-readable cookie.
 *
 * Why: the backend returns the token pair as a JSON response body, not a
 * Set-Cookie header — it has no opinion on how a given client stores it.
 * apps/web's browser code never calls the backend directly; every auth
 * call goes through a same-origin Next.js Route Handler (src/app/api/),
 * which receives the token pair from the backend and re-issues it to the
 * browser as an httpOnly cookie. The client-side bundle — and therefore
 * any XSS payload that ends up running in it — can never read this value
 * at all, not "reads it but shouldn't." That's the actual security
 * property localStorage cannot offer.
 *
 * apps/desktop needs a different mechanism (no browser, no cookie jar to
 * speak of in the same sense) — see its own session module.
 */
const ACCESS_COOKIE = 'nestora_access_token';
const REFRESH_COOKIE = 'nestora_refresh_token';
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // mirrors the backend's JWT_REFRESH_TTL_DAYS default — the server is still the real source of truth

const isProduction = process.env.NODE_ENV === 'production';

/** Route Handlers only — cookies() is read-only inside Server Components (no set() there). */
export async function setSession(tokens: TokenPair): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.expiresIn,
  });
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value ?? null;
}

/** For use inside Route Handlers, where cookies() is mutable. */
export const routeHandlerTokenStore: TokenStore = {
  getAccessToken,
  getRefreshToken,
  setTokens: setSession,
  clearTokens: clearSession,
};
