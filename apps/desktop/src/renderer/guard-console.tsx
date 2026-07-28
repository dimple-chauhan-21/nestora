import { Button, Alert, AlertDescription, Spinner } from '@nestora/ui';
import { useGuardDashboard } from './use-guard-dashboard';
import { DashboardSection } from './dashboard-section';
import { QrScanPanel } from './qr-scan-panel';
import { ManualEntryPanel } from './manual-entry-panel';
import { EmergencyAlertPanel } from './emergency-alert-panel';

interface GuardConsoleProps {
  accessToken: string;
  phone: string;
  onLogout: () => void;
}

/**
 * Deliverable #1's "one view, not two tabs": pending visits/deliveries and
 * every guard action live on one scrollable screen, not behind navigation —
 * a guard under time pressure at the gate shouldn't have to go looking for
 * the emergency button or the pending queue.
 */
export function GuardConsole({ accessToken, phone, onLogout }: GuardConsoleProps) {
  const dashboard = useGuardDashboard(accessToken);

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-sm text-muted-foreground">Guard: {phone}</p>
            {/* Deliverable #5: which gate this session acts as, always visible — never just silently enforced server-side. */}
            {dashboard.isPending && (
              <p className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
                <Spinner className="h-4 w-4" /> Loading gate…
              </p>
            )}
            {dashboard.isSuccess && (
              <p className="text-lg font-semibold text-foreground">
                Gate: {dashboard.data.gateName ?? 'Unassigned'}
              </p>
            )}
            {dashboard.isError && <p className="text-lg font-semibold text-destructive">Gate: unknown</p>}
          </div>
          <Button variant="outline" size="sm" onClick={onLogout}>
            Log out
          </Button>
        </header>

        {dashboard.isError && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                {dashboard.error instanceof Error ? dashboard.error.message : 'Failed to load guard dashboard'} — your
                session may have expired.
              </span>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => dashboard.refetch()}>
                  Retry
                </Button>
                <Button size="sm" variant="outline" onClick={onLogout}>
                  Log out
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DashboardSection dashboard={dashboard} />

        <div className="grid gap-6 lg:grid-cols-2">
          <QrScanPanel accessToken={accessToken} gateId={dashboard.data?.gateId ?? null} />
          <ManualEntryPanel accessToken={accessToken} societyId={dashboard.data?.societyId ?? null} />
        </div>

        <EmergencyAlertPanel accessToken={accessToken} activeAlerts={dashboard.data?.activeAlerts ?? []} />
      </div>
    </main>
  );
}
