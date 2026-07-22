import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import type { components } from '@nestora/types';

type OtpRequestBody = components['schemas']['OtpRequestDto'];

/** Proxies to the real backend server-side — the browser never talks to it directly. */
export async function POST(req: Request) {
  const body = (await req.json()) as OtpRequestBody;
  const result = await api.POST('/api/v1/auth/otp/request', { body });
  return NextResponse.json(result.data ?? result.error, { status: result.response.status });
}
