import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function POST(req: Request) {
  const body = await req.json();

  const result = await api.POST('/api/v1/notices', { body });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to post notice' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
