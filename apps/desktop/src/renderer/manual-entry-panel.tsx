import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  FormField,
  Input,
  Alert,
  AlertDescription,
  Spinner,
} from '@nestora/ui';
import type { components } from '@nestora/types';
import { authedFetch, ApiError } from './api-config';
import { guardDashboardKey } from './query-keys';

type FlatSummary = components['schemas']['FlatSummaryDto'];
type VisitResponse = components['schemas']['VisitResponseDto'];

interface ManualEntryPanelProps {
  accessToken: string;
  societyId: string | null;
}

/**
 * No-QR fallback per §5: a flat lookup plus visitor name/phone/purpose.
 * Hits the pre-existing POST /visits/walk-in (not /gate/manual-entry, which
 * serves staff/vehicle/override entries) — a walk-in visitor still needs a
 * resident's approval, so this creates a pending visit, same as a QR-invited
 * one, rather than gate-logging an immediate entry.
 */
export function ManualEntryPanel({ accessToken, societyId }: ManualEntryPanelProps) {
  const queryClient = useQueryClient();
  const [flatId, setFlatId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState('');
  const [lastCreated, setLastCreated] = useState<VisitResponse | null>(null);

  const flats = useQuery({
    queryKey: ['society', societyId, 'flats'],
    queryFn: () => authedFetch<FlatSummary[]>(accessToken, `/api/v1/societies/${societyId}/flats`),
    enabled: !!societyId,
  });

  const submit = useMutation({
    mutationFn: () =>
      authedFetch<VisitResponse>(accessToken, '/api/v1/visits/walk-in', {
        method: 'POST',
        body: {
          flatId,
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          purpose: purpose.trim() || undefined,
        },
      }),
    onSuccess: (visit) => {
      setLastCreated(visit);
      setName('');
      setPhone('');
      setPurpose('');
      void queryClient.invalidateQueries({ queryKey: guardDashboardKey });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!flatId) return;
    submit.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual Visitor Entry</CardTitle>
        <CardDescription>No QR? Register the visitor directly — still needs resident approval.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Flat" htmlFor="manual-flat">
            {flats.isPending && societyId && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Spinner className="h-3 w-3" /> Loading flats…
              </p>
            )}
            {flats.isError && <p className="text-sm text-destructive">Could not load flats. Retry below.</p>}
            {(flats.isSuccess || !societyId) && (
              <select
                id="manual-flat"
                value={flatId}
                onChange={(e) => setFlatId(e.target.value)}
                disabled={submit.isPending || !societyId}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select a flat…</option>
                {flats.data?.map((flat) => (
                  <option key={flat.id} value={flat.id}>
                    {flat.flatNumber}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Visitor name (optional)" htmlFor="manual-name">
            <Input id="manual-name" value={name} onChange={(e) => setName(e.target.value)} disabled={submit.isPending} />
          </FormField>

          <FormField label="Phone (optional)" htmlFor="manual-phone">
            <Input
              id="manual-phone"
              type="tel"
              placeholder="+919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={submit.isPending}
            />
          </FormField>

          <FormField label="Purpose (optional)" htmlFor="manual-purpose">
            <Input
              id="manual-purpose"
              placeholder="e.g. Guest, cab, courier"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              disabled={submit.isPending}
            />
          </FormField>

          <Button type="submit" className="w-full" disabled={submit.isPending || !flatId}>
            {submit.isPending && <Spinner />}
            Register visitor
          </Button>
        </form>

        {submit.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {submit.error instanceof ApiError ? submit.error.message : 'Could not register this visitor. Try again.'}
            </AlertDescription>
          </Alert>
        )}

        {lastCreated && !submit.isError && (
          <Alert>
            <AlertDescription>
              Registered {lastCreated.visitor.name ?? 'visitor'} for flat {lastCreated.flat.flatNumber} — pending
              resident approval.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
