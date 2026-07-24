import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { getMe } from '@/lib/me';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@nestora/ui';
import { formatRoleName } from '@nestora/utils';
import { PendingVisitsSection } from './pending-visits-section';

export default async function DashboardPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    redirect('/login');
  }

  const me = await getMe(accessToken);
  if (!me) {
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Logged in as {me.user.phone}</p>
            <p className="text-xs text-muted-foreground">
              {me.roles.length > 0 ? me.roles.map(formatRoleName).join(', ') : 'No roles assigned yet'}
            </p>
          </div>
          {me.flatId && (
            <Link href="/dashboard/visits" className="text-sm font-medium text-primary hover:underline">
              Visit history
            </Link>
          )}
        </header>

        {me.flatId ? (
          <PendingVisitsSection flatId={me.flatId} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No flat associated with your account</CardTitle>
              <CardDescription>
                Visitor approvals are shown per-flat — this account isn&apos;t linked to one yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Contact your society admin if this is unexpected.
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
