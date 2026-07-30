import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const societyId = searchParams.get('societyId');
  if (!societyId) {
    return NextResponse.json({ message: 'societyId is required' }, { status: 400 });
  }

  const result = await api.GET('/api/v1/reports/financial-summary', { params: { query: { societyId } } });

  if (!result.data) {
    return NextResponse.json(result.error ?? { message: 'Failed to load financial summary' }, {
      status: result.response.status,
    });
  }
  return NextResponse.json(result.data);
}
