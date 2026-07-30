import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const result = await api.POST('/api/v1/bills/{id}/record-offline-payment', {
    params: { path: { id } },
    body,
  });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to record payment' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
