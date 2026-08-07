import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await api.POST('/api/v1/notices/{id}/read', { params: { path: { id } } });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to mark notice as read' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
