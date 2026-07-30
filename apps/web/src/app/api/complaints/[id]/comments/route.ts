import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await api.GET('/api/v1/complaints/{id}/comments', { params: { path: { id } } });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to load comments' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const result = await api.POST('/api/v1/complaints/{id}/comments', {
    params: { path: { id } },
    body,
  });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to post comment' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
