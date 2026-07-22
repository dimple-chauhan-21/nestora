import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { setSession } from '@/lib/session';
import type { components } from '@nestora/types';

type OtpVerifyBody = components['schemas']['OtpVerifyDto'];

/**
 * On success, the token pair is consumed here and never forwarded to the
 * browser at all — it goes straight into an httpOnly cookie. The client
 * only ever learns "ok: true".
 */
export async function POST(req: Request) {
  const body = (await req.json()) as OtpVerifyBody;
  const result = await api.POST('/api/v1/auth/otp/verify', { body });

  // Checking !result.data alone (not `result.error || !result.data`) is
  // deliberate — data/error are mutually exclusive in openapi-fetch's
  // response shape, and the `||` form trips a real TS narrowing limitation
  // against its generic response type, collapsing `result` to `never` in
  // the branch below.
  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Verification failed' }, { status: result.response.status });
  }

  await setSession(result.data);
  return NextResponse.json({ ok: true });
}
