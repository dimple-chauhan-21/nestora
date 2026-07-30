import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { getMe } from '@/lib/me';
import { Card, CardHeader, CardTitle, CardDescription } from '@nestora/ui';
import { ResidentsTable } from './residents-table';

export default async function AdminResidentsPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect('/login');

  const me = await getMe(accessToken);
  if (!me) redirect('/login');

  if (!me.societyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No society associated with your account</CardTitle>
          <CardDescription>Residents are shown per-society.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Residents</h1>
        <p className="text-sm text-muted-foreground">Search by flat number, view vehicles and pets for a flat.</p>
      </div>
      <ResidentsTable societyId={me.societyId} />
    </div>
  );
}
