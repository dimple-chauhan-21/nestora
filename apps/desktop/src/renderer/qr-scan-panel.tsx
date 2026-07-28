import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, FormField, Input, Alert, AlertDescription, Spinner } from '@nestora/ui';
import type { components } from '@nestora/types';
import { authedFetch, ApiError } from './api-config';
import { guardDashboardKey } from './query-keys';

type GateLog = components['schemas']['GateLogResponseDto'];
type GuardDashboard = components['schemas']['GuardDashboardResponseDto'];
type Direction = 'in' | 'out';

interface QrScanPanelProps {
  accessToken: string;
  gateId: string | null;
}

/**
 * Dev-testable stand-in for real scanner hardware: there's no camera/scanner
 * to test against, so this is a plain text input the guard (or, in dev, us)
 * pastes a token into.
 *
 * How a real scanner wires in later — two real options, not a placeholder to
 * rewrite from scratch:
 *   1. USB/Bluetooth "keyboard wedge" barcode/QR scanners (the common,
 *      cheap gate-hardware choice) emulate a keyboard: they type the decoded
 *      token into whatever input is focused, then send Enter. Point one at
 *      this exact input, autofocus it, and submit-on-Enter — this field
 *      already IS the real integration point, not a stand-in to replace.
 *   2. A camera-based scanner (getUserMedia + a decoder like jsQR/zxing)
 *      would decode a frame client-side and call setToken(decoded) then
 *      submit programmatically — same downstream POST /gate/scan call,
 *      just a different token source.
 */
export function QrScanPanel({ accessToken, gateId }: QrScanPanelProps) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const [direction, setDirection] = useState<Direction>('in');
  const [lastResult, setLastResult] = useState<GateLog | null>(null);

  const scan = useMutation({
    mutationFn: () =>
      authedFetch<GateLog>(accessToken, '/api/v1/gate/scan', {
        method: 'POST',
        body: { token: token.trim(), direction, gateId },
      }),
    // Same optimistic-update-with-rollback shape as apps/web's pending-visit
    // approve/reject: bump the count the guard is watching immediately, undo
    // it if the server rejects the scan (e.g. an already-used or expired
    // token), then reconcile with a real refetch either way.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: guardDashboardKey });
      const previous = queryClient.getQueryData<GuardDashboard>(guardDashboardKey);
      queryClient.setQueryData<GuardDashboard>(guardDashboardKey, (old) =>
        old
          ? {
              ...old,
              todayEntries: direction === 'in' ? old.todayEntries + 1 : old.todayEntries,
              todayExits: direction === 'out' ? old.todayExits + 1 : old.todayExits,
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(guardDashboardKey, context.previous);
    },
    onSuccess: (result) => {
      setLastResult(result);
      setToken('');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: guardDashboardKey });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token.trim() || !gateId) return;
    scan.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>QR Scan</CardTitle>
        <CardDescription>Paste a visitor/delivery QR token (dev stand-in for scanner hardware).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!gateId && (
          <Alert>
            <AlertDescription>Waiting for gate assignment before scans can be recorded.</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="QR token" htmlFor="qr-token">
            <Input
              id="qr-token"
              type="text"
              placeholder="Paste scanned token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={scan.isPending || !gateId}
              autoFocus
            />
          </FormField>

          <div className="flex gap-2">
            {(['in', 'out'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                disabled={scan.isPending}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  direction === d
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background text-foreground hover:bg-muted'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <Button type="submit" className="w-full" disabled={scan.isPending || !token.trim() || !gateId}>
            {scan.isPending && <Spinner />}
            Record scan
          </Button>
        </form>

        {scan.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {scan.error instanceof ApiError ? scan.error.message : 'Could not record this scan. Try again.'}
            </AlertDescription>
          </Alert>
        )}

        {lastResult && !scan.isError && (
          <Alert>
            <AlertDescription>
              Recorded: {lastResult.entityType} {lastResult.direction} via {lastResult.method}.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
