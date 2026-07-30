import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function GET(_req: Request, { params }: { params: Promise<{ flatId: string }> }) {
  const { flatId } = await params;
  const result = await api.GET('/api/v1/flats/{id}', { params: { path: { id: flatId } } });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to load flat detail' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
