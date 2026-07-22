import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@nestora/ui';
import type { components } from '@nestora/types';

type MeResponse = components['schemas']['MeResponseDto'];

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';

/**
 * Deliberately a direct fetch, not the retry-capable api-client: a Server
 * Component can't persist a refreshed cookie mid-render (cookies() is
 * read-only outside Route Handlers/Server Actions), so there's nothing
 * correct to do with a refreshed token here anyway — an expired access
 * token just means "go log in again," which is what this returns.
 */
async function getMe(accessToken: string): Promise<MeResponse | null> {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

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
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Logged in as {me.user.phone}</CardTitle>
          <CardDescription>
            {me.roles.length > 0 ? me.roles.join(', ') : 'No roles assigned yet'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This is a placeholder page proving the full chain works: browser → Next.js Route
          Handler → real API → Postgres, and back.
        </CardContent>
      </Card>
    </main>
  );
}
