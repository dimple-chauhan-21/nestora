import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Alert, AlertTitle, AlertDescription, Spinner } from '@nestora/ui';
import type { components } from '@nestora/types';
import { formatIst } from '@nestora/utils';
import { authedFetch, ApiError } from './api-config';
import { guardDashboardKey } from './query-keys';

type EmergencyAlert = components['schemas']['EmergencyAlertResponseDto'];
type AlertType = EmergencyAlert['type'];

const ALERT_TYPES: { value: AlertType; label: string }[] = [
  { value: 'fire', label: 'Fire' },
  { value: 'medical', label: 'Medical' },
  { value: 'security', label: 'Security' },
  { value: 'other', label: 'Other' },
];

interface EmergencyAlertPanelProps {
  accessToken: string;
  activeAlerts: EmergencyAlert[];
}

/**
 * Safety-critical, per §5 — this is the one control on the whole kiosk that
 * must never fire from a stray tap. Raising is a two-step flow: pick a type
 * (reveals the confirm step), then press a second, distinctly red "Confirm"
 * button — a single click never raises an alert.
 *
 * Exactly one call-to-action is on screen at a time (type-select, or
 * confirm, or a bare pending indicator, or the failure banner) — never the
 * confirm card and the failure banner together. "Confirm — Raise Alert" and
 * the failure banner's "Retry now" both do the same thing (re-attempt
 * raising the already-chosen type), so showing both at once would just make
 * a guard guess which button to press mid-emergency. Once they've confirmed
 * once, a failed attempt doesn't re-prompt for confirmation — it goes
 * straight to "Retry now", since re-confirming an already-explicit choice
 * during an active emergency costs time for no safety benefit.
 */
export function EmergencyAlertPanel({ accessToken, activeAlerts }: EmergencyAlertPanelProps) {
  const queryClient = useQueryClient();
  const [pendingType, setPendingType] = useState<AlertType | null>(null);

  const raise = useMutation({
    mutationFn: (type: AlertType) =>
      authedFetch<EmergencyAlert>(accessToken, '/api/v1/emergency-alerts', {
        method: 'POST',
        body: { type },
      }),
    onSuccess: () => {
      setPendingType(null);
      void queryClient.invalidateQueries({ queryKey: guardDashboardKey });
    },
  });

  function cancel() {
    raise.reset();
    setPendingType(null);
  }

  const pendingLabel = ALERT_TYPES.find((t) => t.value === pendingType)?.label;

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Emergency Alert</CardTitle>
        <CardDescription>Fire, medical, or security emergency at the gate.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingType === null && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ALERT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setPendingType(t.value)}
                className="rounded-md border-2 border-destructive bg-destructive/10 px-4 py-6 text-base font-semibold text-destructive transition-colors hover:bg-destructive/20"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {pendingType !== null && raise.status === 'idle' && (
          <div className="space-y-3 rounded-md border-2 border-destructive bg-destructive/10 p-4">
            <p className="font-semibold text-destructive">Confirm {pendingLabel} emergency alert?</p>
            <p className="text-sm text-destructive/80">This immediately notifies residents and society staff.</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={cancel}>
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => raise.mutate(pendingType)}
              >
                Confirm — Raise Alert
              </Button>
            </div>
          </div>
        )}

        {pendingType !== null && raise.status === 'pending' && (
          <div className="flex items-center gap-2 rounded-md border-2 border-destructive bg-destructive/10 p-4 font-semibold text-destructive">
            <Spinner /> Raising {pendingLabel} alert…
          </div>
        )}

        {pendingType !== null && raise.status === 'error' && (
          <Alert variant="destructive">
            <AlertTitle>Alert not sent</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>
                {raise.error instanceof ApiError
                  ? raise.error.message
                  : 'The emergency alert could not be sent. Check the connection and try again immediately, or use another means to raise the alarm.'}
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={cancel}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => raise.mutate(pendingType)}
                >
                  Retry now
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {activeAlerts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Active alerts</h3>
            <ul className="space-y-2">
              {activeAlerts.map((alert) => (
                <ActiveAlertRow key={alert.id} alert={alert} accessToken={accessToken} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveAlertRow({ alert, accessToken }: { alert: EmergencyAlert; accessToken: string }) {
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');

  const resolve = useMutation({
    mutationFn: () =>
      authedFetch<EmergencyAlert>(accessToken, `/api/v1/emergency-alerts/${alert.id}/resolve`, {
        method: 'POST',
        body: { resolutionNote: note.trim() },
      }),
    onSuccess: () => {
      setResolving(false);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: guardDashboardKey });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (note.trim().length < 3) return;
    resolve.mutate();
  }

  return (
    <li className="rounded-lg border-2 border-destructive bg-destructive/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium capitalize text-destructive">{alert.type}</p>
          <p className="text-xs text-muted-foreground">
            Raised {formatIst(alert.createdAt)} {alert.raisedByMe ? '· by you' : ''}
          </p>
        </div>
        {!resolving && (
          <Button size="sm" variant="outline" onClick={() => setResolving(true)}>
            Resolve
          </Button>
        )}
      </div>

      {resolving && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Resolution note (required, min 3 characters)"
            disabled={resolve.isPending}
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => setResolving(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={resolve.isPending || note.trim().length < 3}>
              {resolve.isPending && <Spinner />}
              Confirm resolved
            </Button>
          </div>
          {resolve.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {resolve.error instanceof ApiError ? resolve.error.message : 'Could not resolve this alert. Try again.'}
              </AlertDescription>
            </Alert>
          )}
        </form>
      )}
    </li>
  );
}
