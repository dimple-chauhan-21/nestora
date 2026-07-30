import Link from 'next/link';
import { FlatBillsClient } from './flat-bills-client';

export default async function FlatBillsPage({ params }: { params: Promise<{ flatId: string }> }) {
  const { flatId } = await params;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/billing" className="text-sm font-medium text-primary hover:underline">
        ← Back to billing
      </Link>
      <FlatBillsClient flatId={flatId} />
    </div>
  );
}
