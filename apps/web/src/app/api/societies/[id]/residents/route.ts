import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor') ?? undefined;
  const limitParam = searchParams.get('limit');
  const flatNumber = searchParams.get('flatNumber') ?? undefined;
  const flatId = searchParams.get('flatId') ?? undefined;
  const filterParam = searchParams.get('filter');
  const filter = filterParam === 'senior_citizen' ? filterParam : undefined;

  const result = await api.GET('/api/v1/societies/{id}/residents', {
    params: {
      path: { id },
      query: {
        ...(cursor ? { cursor } : {}),
        ...(limitParam ? { limit: Number(limitParam) } : {}),
        ...(flatNumber ? { flatNumber } : {}),
        ...(flatId ? { flatId } : {}),
        ...(filter ? { filter } : {}),
      },
    },
  });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to load residents' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
