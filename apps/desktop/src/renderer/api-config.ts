export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000';

/** One kiosk, one stable device id — no per-browser-install concept on a fixed kiosk. */
export const DEVICE_ID = 'guard-kiosk';

export class ApiError extends Error {}

/** Authenticated JSON fetch — every guard-console call site (dashboard poll, QR scan, manual entry, emergency alert) goes through this so the 401/error shape is handled once, not per-call-site. */
export async function authedFetch<T>(
  accessToken: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(typeof body?.message === 'string' ? body.message : `Request failed (${res.status})`);
  }
  return body as T;
}
