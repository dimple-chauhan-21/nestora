import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths } from '@nestora/types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Storage is deliberately pluggable, not hardcoded — apps/web (httpOnly
 * cookie via a Next.js route handler) and apps/desktop (its own local
 * store) each need a different real backing mechanism.
 */
export interface TokenStore {
  getAccessToken(): string | null | Promise<string | null>;
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(tokens: TokenPair): void | Promise<void>;
  clearTokens(): void | Promise<void>;
}

export interface CreateApiClientOptions {
  baseUrl: string;
  tokenStore: TokenStore;
}

// Endpoints that must never trigger a refresh-and-retry on their own 401 —
// otherwise a failed refresh could recurse into refreshing itself, and a
// wrong OTP/password legitimately returns 401 without a token ever existing.
const NO_REFRESH_RETRY_PATHS = ['/api/v1/auth/refresh', '/api/v1/auth/otp/verify', '/api/v1/auth/login'];

const RETRYABLE_METHODS = new Set(['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH', 'TRACE']);

/**
 * Wraps openapi-fetch's generated client with two behaviors it doesn't
 * provide out of the box: attaching the current access token to every
 * request, and retrying exactly once on a 401 after a token refresh.
 *
 * Implemented as a Proxy over the raw client rather than a per-method
 * middleware, deliberately: openapi-fetch's onResponse middleware can only
 * replace the Response by re-running fetch() on the already-sent Request,
 * whose body (for POST/PATCH) is a stream that's already been consumed by
 * that point — reconstructing it reliably across environments isn't safe.
 * Retrying at the GET/POST/etc. call level instead replays the original,
 * still-unconsumed `init` object, which openapi-fetch itself serializes
 * fresh each time.
 */
export function createApiClient({ baseUrl, tokenStore }: CreateApiClientOptions): Client<paths> {
  const raw = createClient<paths>({ baseUrl });

  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      const token = await tokenStore.getAccessToken();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },
  };
  raw.use(authMiddleware);

  let refreshPromise: Promise<boolean> | null = null;

  // Concurrent 401s across multiple in-flight requests share one refresh
  // call rather than each independently spending the refresh token.
  async function refreshOnce(): Promise<boolean> {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const refreshToken = await tokenStore.getRefreshToken();
        if (!refreshToken) return false;
        const { data, error } = await raw.POST('/api/v1/auth/refresh', {
          body: { refreshToken },
        });
        if (error || !data) {
          await tokenStore.clearTokens();
          return false;
        }
        await tokenStore.setTokens(data);
        return true;
      })();
    }
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  return new Proxy(raw, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || !RETRYABLE_METHODS.has(prop) || typeof value !== 'function') {
        return value;
      }

      const originalMethod = value as (url: string, init?: unknown) => Promise<{ response: Response }>;

      return async (url: string, init?: unknown) => {
        const result = await originalMethod.call(target, url, init);
        const alreadyTriedRefresh = NO_REFRESH_RETRY_PATHS.some((p) => url.startsWith(p));
        if (result.response.status !== 401 || alreadyTriedRefresh) {
          return result;
        }
        const refreshed = await refreshOnce();
        if (!refreshed) return result;
        return originalMethod.call(target, url, init);
      };
    },
  }) as Client<paths>;
}
