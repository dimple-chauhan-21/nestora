import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function GET() {
  const result = await api.GET('/api/v1/complaint-categories');

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to load complaint categories' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
