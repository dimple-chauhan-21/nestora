'use client';

import { useQuery } from '@tanstack/react-query';
import { Button, Alert, AlertDescription, Spinner, Card, CardContent } from '@nestora/ui';
import type { components } from '@nestora/types';
import { PendingVisitCard } from './pending-visit-card';
import { pendingVisitsKey } from './query-keys';

type PaginatedVisitResponseDto = components['schemas']['PaginatedVisitResponseDto'];

/**
 * No push notification UI/mobile app yet (§4's "push to resident on arrival"
 * is real on the backend but has no delivery channel this session) — polling
 * is the stand-in. 15s matches the same tradeoff the guard-kiosk dashboard
 * poller already made (visitor.constants.ts's GUARD_DASHBOARD_POLL_INTERVAL_SECONDS):
 * frequent enough that "someone's waiting at the gate" doesn't feel stale,
 * infrequent enough not to hammer the API from every resident's open tab.
 */
const PENDING_VISITS_POLL_INTERVAL_MS = 15_000;

async function fetchPending(flatId: string): Promise<PaginatedVisitResponseDto> {
  const res = await fetch(`/api/flats/${flatId}/visits/history?status=pending&limit=20`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load pending visitors');
  }
  return res.json();
}

export function PendingVisitsSection({ flatId }: { flatId: string }) {
  const query = useQuery({
    queryKey: pendingVisitsKey(flatId),
    queryFn: () => fetchPending(flatId),
    refetchInterval: PENDING_VISITS_POLL_INTERVAL_MS,
  });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Pending Approvals</h2>
        {query.isSuccess && query.data.data.length > 0 && (
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
            {query.data.data.length}
          </span>
        )}
      </div>

      {query.isPending && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{query.error instanceof Error ? query.error.message : 'Failed to load pending visitors'}</span>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.isSuccess && query.data.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-8 text-center">
            <p className="font-medium text-card-foreground">No visitors waiting</p>
            <p className="text-sm text-muted-foreground">You&apos;ll see approval requests here the moment a visitor arrives.</p>
          </CardContent>
        </Card>
      )}

      {query.isSuccess && query.data.data.length > 0 && (
        <ul className="space-y-3">
          {query.data.data.map((visit) => (
            <PendingVisitCard key={visit.id} visit={visit} flatId={flatId} />
          ))}
        </ul>
      )}

      {query.isFetching && !query.isPending && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="h-3 w-3" />
          Checking for new visitors…
        </div>
      )}
    </section>
  );
}
