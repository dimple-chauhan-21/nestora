import type { components } from '@nestora/types';

export type MeResponse = components['schemas']['MeResponseDto'];

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';

/**
 * Deliberately a direct fetch, not the retry-capable api-client: a Server
 * Component can't persist a refreshed cookie mid-render (cookies() is
 * read-only outside Route Handlers/Server Actions), so there's nothing
 * correct to do with a refreshed token here anyway — an expired access
 * token just means "go log in again," which is what this returns.
 */
export async function getMe(accessToken: string): Promise<MeResponse | null> {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}
