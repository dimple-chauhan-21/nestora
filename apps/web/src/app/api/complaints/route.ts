import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import type { components } from '@nestora/types';

type ComplaintStatus = components['schemas']['ComplaintResponseDto']['status'];
type ComplaintPriority = components['schemas']['ComplaintResponseDto']['priority'];

const VALID_STATUSES: ComplaintStatus[] = ['open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed'];
const VALID_PRIORITIES: ComplaintPriority[] = ['low', 'medium', 'high', 'urgent'];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const priorityParam = searchParams.get('priority');
  const categoryId = searchParams.get('categoryId') ?? undefined;
  const flatId = searchParams.get('flatId') ?? undefined;
  const status = VALID_STATUSES.find((s) => s === statusParam);
  const priority = VALID_PRIORITIES.find((p) => p === priorityParam);

  const result = await api.GET('/api/v1/complaints', {
    params: {
      query: {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(flatId ? { flatId } : {}),
      },
    },
  });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to load complaints' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const result = await api.POST('/api/v1/complaints', { body });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to raise complaint' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
