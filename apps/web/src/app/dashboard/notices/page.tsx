import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { getMe } from '@/lib/me';
import { Card, CardHeader, CardTitle, CardDescription } from '@nestora/ui';
import { NoticeListClient } from './notice-list-client';

export default async function NoticesPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    redirect('/login');
  }

  const me = await getMe(accessToken);
  if (!me) {
    redirect('/login');
  }

  if (!me.societyId) {
    return (
      <main className="min-h-screen bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>No society associated with your account</CardTitle>
              <CardDescription>Notices are shown per-society.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Notices</h1>
          <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
            Back to dashboard
          </Link>
        </div>
        <NoticeListClient societyId={me.societyId} />
      </div>
    </main>
  );
}
