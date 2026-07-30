import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const result = await api.PATCH('/api/v1/complaints/{id}/assign', {
    params: { path: { id } },
    body,
  });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to assign complaint' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
