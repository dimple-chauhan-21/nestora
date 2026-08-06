import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { getMe } from '@/lib/me';
import { Card, CardHeader, CardTitle, CardDescription } from '@nestora/ui';
import { RaiseComplaintForm } from './raise-complaint-form';
import { ComplaintListClient } from './complaint-list-client';

export default async function ComplaintsPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    redirect('/login');
  }

  const me = await getMe(accessToken);
  if (!me) {
    redirect('/login');
  }

  if (!me.flatId) {
    return (
      <main className="min-h-screen bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>No flat associated with your account</CardTitle>
              <CardDescription>Complaints are tracked per-flat.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Complaints</h1>
          <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
            Back to dashboard
          </Link>
        </div>
        <RaiseComplaintForm flatId={me.flatId} />
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Your complaints</h2>
          <ComplaintListClient flatId={me.flatId} />
        </section>
      </div>
    </main>
  );
}
