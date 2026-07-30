import Link from 'next/link';
import { FlatDetailClient } from './flat-detail-client';

export default async function FlatDetailPage({ params }: { params: Promise<{ flatId: string }> }) {
  const { flatId } = await params;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/residents" className="text-sm font-medium text-primary hover:underline">
        ← Back to residents
      </Link>
      <FlatDetailClient flatId={flatId} />
    </div>
  );
}
