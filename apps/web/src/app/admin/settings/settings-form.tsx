'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  Input,
  Label,
  Textarea,
  FormField,
  Alert,
  AlertDescription,
  Spinner,
} from '@nestora/ui';
import type { components } from '@nestora/types';
import { societySettingsKey } from '../query-keys';

type SocietySettingsResponseDto = components['schemas']['SocietySettingsResponseDto'];

async function fetchSettings(societyId: string): Promise<SocietySettingsResponseDto> {
  const res = await fetch(`/api/societies/${societyId}/settings`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load society settings');
  }
  return body as SocietySettingsResponseDto;
}

interface FormValues {
  billingCycleDay: string;
  lateFeePct: string;
  fiscalYearStartMonth: string;
  featureFlagsJson: string;
}

function toFormValues(dto: SocietySettingsResponseDto): FormValues {
  return {
    billingCycleDay: String(dto.billingCycleDay),
    lateFeePct: String(dto.lateFeePct),
    fiscalYearStartMonth: String(dto.fiscalYearStartMonth),
    featureFlagsJson: JSON.stringify(dto.featureFlags ?? {}, null, 2),
  };
}

async function saveSettings(societyId: string, values: FormValues): Promise<SocietySettingsResponseDto> {
  let featureFlags: Record<string, unknown>;
  try {
    featureFlags = JSON.parse(values.featureFlagsJson || '{}');
  } catch {
    throw new Error('Feature flags must be valid JSON');
  }

  const res = await fetch(`/api/societies/${societyId}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      billingCycleDay: Number(values.billingCycleDay),
      lateFeePct: Number(values.lateFeePct),
      fiscalYearStartMonth: Number(values.fiscalYearStartMonth),
      featureFlags,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to save society settings');
  }
  return body as SocietySettingsResponseDto;
}

export function SettingsForm({ societyId }: { societyId: string }) {
  const queryClient = useQueryClient();
  const queryKey = societySettingsKey(societyId);

  const query = useQuery({ queryKey, queryFn: () => fetchSettings(societyId) });
  const [values, setValues] = useState<FormValues | null>(null);

  // Only ever seeds local state from the server once (on first successful
  // load) — a later refetch (e.g. after invalidateQueries on save) must
  // never clobber in-progress edits or a failed save's still-unsaved values.
  useEffect(() => {
    if (query.data && values === null) {
      setValues(toFormValues(query.data));
    }
  }, [query.data, values]);

  const mutation = useMutation({
    mutationFn: (v: FormValues) => saveSettings(societyId, v),
    onSuccess: (dto) => {
      queryClient.setQueryData(queryKey, dto);
      setValues(toFormValues(dto));
    },
    // Deliberately no onError handling that touches `values` — if the save
    // fails (e.g. the API goes down mid-request), the fields the admin just
    // edited stay exactly as typed so nothing is lost; only the error
    // banner below reflects the failure.
  });

  if (query.isPending) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg border border-border bg-muted" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{query.error instanceof Error ? query.error.message : 'Failed to load society settings'}</span>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!values) return null;

  function updateField(patch: Partial<FormValues>) {
    mutation.reset();
    setValues((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(values);
      }}
    >
      <Card>
        <CardContent className="space-y-4 pt-6">
          <FormField label="Billing cycle day" htmlFor="billingCycleDay" required>
            <Input
              type="number"
              min={1}
              max={28}
              value={values.billingCycleDay}
              onChange={(e) => updateField({ billingCycleDay: e.target.value })}
            />
          </FormField>
          <FormField label="Late fee (%)" htmlFor="lateFeePct" required>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={values.lateFeePct}
              onChange={(e) => updateField({ lateFeePct: e.target.value })}
            />
          </FormField>
          <FormField label="Fiscal year start month" htmlFor="fiscalYearStartMonth" required>
            <Input
              type="number"
              min={1}
              max={12}
              value={values.fiscalYearStartMonth}
              onChange={(e) => updateField({ fiscalYearStartMonth: e.target.value })}
            />
          </FormField>
          <div className="space-y-2">
            <Label htmlFor="featureFlagsJson">Feature flags (JSON)</Label>
            <Textarea
              id="featureFlagsJson"
              className="min-h-[120px] font-mono text-xs"
              value={values.featureFlagsJson}
              onChange={(e) => updateField({ featureFlagsJson: e.target.value })}
            />
          </div>

          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {mutation.error instanceof Error ? mutation.error.message : 'Failed to save society settings'} — your
                edits above are unchanged, nothing was lost. Try saving again.
              </AlertDescription>
            </Alert>
          )}
          {mutation.isSuccess && !mutation.isPending && (
            <Alert variant="success">
              <AlertDescription>Saved.</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="mr-1 h-3 w-3" />}
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
