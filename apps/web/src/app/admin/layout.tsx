import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { getMe } from '@/lib/me';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@nestora/ui';
import { formatRoleName } from '@nestora/utils';
import { isAdminConsoleRole } from './admin-roles';
import { AdminNav } from './admin-nav';

/**
 * Server Component guard, same pattern as `/dashboard` — but here a
 * logged-in caller with the wrong role gets a clear "not authorized" card,
 * not `redirect('/login')` (which would just bounce them into a login loop
 * since they're already authenticated) and not a silent redirect elsewhere.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    redirect('/login');
  }

  const me = await getMe(accessToken);
  if (!me) {
    redirect('/login');
  }

  if (!isAdminConsoleRole(me.roles)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>Not authorized</CardTitle>
              <CardDescription>
                The admin console is restricted to Society Admin, Society Manager, Committee Member, and Accountant
                accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Your account ({me.user.phone}) is signed in as{' '}
                {me.roles.length > 0 ? me.roles.map(formatRoleName).join(', ') : 'a role with no assignments yet'},
                which doesn&apos;t include admin console access.
              </p>
              <Link href="/dashboard" className="font-medium text-primary hover:underline">
                Go to your dashboard
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/admin" className="text-sm font-semibold text-foreground">
              Admin Console
            </Link>
            <AdminNav />
          </div>
          <div className="text-right">
            <p className="text-sm text-foreground">{me.user.phone}</p>
            <p className="text-xs text-muted-foreground">{me.roles.map(formatRoleName).join(', ')}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
