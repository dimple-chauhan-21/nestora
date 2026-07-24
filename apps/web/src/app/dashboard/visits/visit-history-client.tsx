'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, Alert, AlertDescription, Spinner, Card, CardContent } from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';
import { visitHistoryKey } from '../query-keys';

type PaginatedVisitResponseDto = components['schemas']['PaginatedVisitResponseDto'];
type VisitResponseDto = components['schemas']['VisitResponseDto'];

const PAGE_SIZE = 20;

async function fetchHistoryPage(flatId: string, cursor: string | undefined): Promise<PaginatedVisitResponseDto> {
  const url = new URL(`/api/flats/${flatId}/visits/history`, window.location.origin);
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load visit history');
  }
  return res.json();
}

const STATUS_LABEL: Record<VisitResponseDto['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  expired: 'Expired',
};

function StatusBadge({ status }: { status: VisitResponseDto['status'] }) {
  const tone =
    status === 'rejected' || status === 'expired'
      ? 'bg-muted text-muted-foreground'
      : status === 'pending'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABEL[status]}</span>;
}

export function VisitHistoryClient({ flatId }: { flatId: string }) {
  const query = useInfiniteQuery({
    queryKey: visitHistoryKey(flatId),
    queryFn: ({ pageParam }) => fetchHistoryPage(flatId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? (lastPage.pagination.nextCursor ?? undefined) : undefined,
  });

  const visits = query.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section>
      {query.isPending && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{query.error instanceof Error ? query.error.message : 'Failed to load visit history'}</span>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.isSuccess && visits.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No visits recorded for this flat yet.
          </CardContent>
        </Card>
      )}

      {query.isSuccess && visits.length > 0 && (
        <ul className="space-y-2">
          {visits.map((visit) => (
            <li
              key={visit.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-card-foreground">{visit.visitor.name ?? 'Unknown visitor'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatIst(visit.createdAt)}
                  {visit.purpose ? ` · ${visit.purpose}` : ''}
                </p>
              </div>
              <StatusBadge status={visit.status} />
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage && <Spinner className="mr-1 h-3 w-3" />}
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}
