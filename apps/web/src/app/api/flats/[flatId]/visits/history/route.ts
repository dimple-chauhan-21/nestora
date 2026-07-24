import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import type { components } from '@nestora/types';

type VisitStatus = components['schemas']['VisitResponseDto']['status'];

const VALID_STATUSES: VisitStatus[] = [
  'pending',
  'approved',
  'rejected',
  'checked_in',
  'checked_out',
  'expired',
];

export async function GET(req: Request, { params }: { params: Promise<{ flatId: string }> }) {
  const { flatId } = await params;
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor') ?? undefined;
  const limitParam = searchParams.get('limit');
  const statusParam = searchParams.get('status');
  const status = VALID_STATUSES.find((s) => s === statusParam);

  const result = await api.GET('/api/v1/flats/{id}/visits/history', {
    params: {
      path: { id: flatId },
      query: {
        ...(cursor ? { cursor } : {}),
        ...(limitParam ? { limit: Number(limitParam) } : {}),
        ...(status ? { status } : {}),
      },
    },
  });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to load visit history' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
