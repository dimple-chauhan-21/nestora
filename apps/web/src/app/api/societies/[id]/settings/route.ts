import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await api.GET('/api/v1/societies/{id}/settings', { params: { path: { id } } });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to load society settings' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const result = await api.PATCH('/api/v1/societies/{id}/settings', {
    params: { path: { id } },
    body,
  });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to save society settings' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
