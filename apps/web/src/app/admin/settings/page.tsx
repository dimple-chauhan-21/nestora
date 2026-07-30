import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { getMe } from '@/lib/me';
import { Card, CardHeader, CardTitle, CardDescription } from '@nestora/ui';
import { SettingsForm } from './settings-form';

export default async function AdminSettingsPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect('/login');

  const me = await getMe(accessToken);
  if (!me) redirect('/login');

  if (!me.societyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No society associated with your account</CardTitle>
          <CardDescription>Society settings can&apos;t be shown without a society context.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Society Settings</h1>
        <p className="text-sm text-muted-foreground">Billing cycle, late fees, fiscal year, and feature flags.</p>
      </div>
      <SettingsForm societyId={me.societyId} />
    </div>
  );
}
