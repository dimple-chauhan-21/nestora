import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await api.GET('/api/v1/societies/{id}/notices', { params: { path: { id } } });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to load notices' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
