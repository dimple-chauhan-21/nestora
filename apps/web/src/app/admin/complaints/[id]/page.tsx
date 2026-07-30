import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { getMe } from '@/lib/me';
import { ComplaintDetailClient } from './complaint-detail-client';

export default async function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) redirect('/login');
  const me = await getMe(accessToken);
  if (!me) redirect('/login');

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/complaints" className="text-sm font-medium text-primary hover:underline">
        ← Back to complaints
      </Link>
      <ComplaintDetailClient complaintId={id} societyId={me.societyId} />
    </div>
  );
}
