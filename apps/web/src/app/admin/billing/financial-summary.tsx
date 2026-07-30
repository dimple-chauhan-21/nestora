'use client';

import { useQuery } from '@tanstack/react-query';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Alert, AlertDescription } from '@nestora/ui';
import type { components } from '@nestora/types';
import { financialSummaryKey } from '../query-keys';

type FinancialSummaryResponseDto = components['schemas']['FinancialSummaryResponseDto'];

async function fetchFinancialSummary(societyId: string): Promise<FinancialSummaryResponseDto> {
  const res = await fetch(`/api/reports/financial-summary?societyId=${societyId}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load financial summary');
  }
  return body as FinancialSummaryResponseDto;
}

function formatCurrency(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : amount;
}

export function FinancialSummary({ societyId }: { societyId: string }) {
  const query = useQuery({ queryKey: financialSummaryKey(societyId), queryFn: () => fetchFinancialSummary(societyId) });

  if (query.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-muted" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{query.error instanceof Error ? query.error.message : 'Failed to load financial summary'}</span>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const s = query.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Billed</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(s.totalBilled)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collected</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(s.totalCollected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collection efficiency</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{Number(s.collectionEfficiencyPct).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatCurrency(
                String(
                  Number(s.outstandingAging.days0To30) +
                    Number(s.outstandingAging.days30To60) +
                    Number(s.outstandingAging.days60Plus),
                ),
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Outstanding aging</CardTitle>
          <CardDescription>How overdue the outstanding balance is.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 pt-0 text-sm">
          <div>
            <p className="text-muted-foreground">0–30 days</p>
            <p className="font-medium text-foreground">{formatCurrency(s.outstandingAging.days0To30)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">30–60 days</p>
            <p className="font-medium text-foreground">{formatCurrency(s.outstandingAging.days30To60)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">60+ days</p>
            <p className="font-medium text-foreground">{formatCurrency(s.outstandingAging.days60Plus)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
