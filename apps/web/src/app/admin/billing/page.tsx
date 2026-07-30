import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { getMe } from '@/lib/me';
import { Card, CardHeader, CardTitle, CardDescription } from '@nestora/ui';
import { FinancialSummary } from './financial-summary';
import { FlatSearchForm } from './flat-search-form';

export default async function AdminBillingPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect('/login');

  const me = await getMe(accessToken);
  if (!me) redirect('/login');

  if (!me.societyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No society associated with your account</CardTitle>
          <CardDescription>Billing is shown per-society.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">Collection summary, per-flat bill history, offline payments.</p>
      </div>
      <FinancialSummary societyId={me.societyId} />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Look up a flat</h2>
        <FlatSearchForm societyId={me.societyId} />
      </section>
    </div>
  );
}
