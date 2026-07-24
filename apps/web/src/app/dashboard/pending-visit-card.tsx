'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Alert, AlertDescription, Spinner } from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';
import { VisitorAvatar } from './visitor-avatar';
import { pendingVisitsKey } from './query-keys';

type VisitResponseDto = components['schemas']['VisitResponseDto'];
type PaginatedVisitResponseDto = components['schemas']['PaginatedVisitResponseDto'];

async function postAction(visitId: string, action: 'approve' | 'reject'): Promise<VisitResponseDto> {
  const res = await fetch(`/api/visits/${visitId}/${action}`, { method: 'POST' });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : `Could not ${action} this visitor`);
  }
  return body as VisitResponseDto;
}

export function PendingVisitCard({ visit, flatId }: { visit: VisitResponseDto; flatId: string }) {
  const queryClient = useQueryClient();
  const queryKey = pendingVisitsKey(flatId);

  function useVisitAction(action: 'approve' | 'reject') {
    return useMutation({
      mutationFn: () => postAction(visit.id, action),
      onMutate: async () => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<PaginatedVisitResponseDto>(queryKey);
        queryClient.setQueryData<PaginatedVisitResponseDto>(queryKey, (old) =>
          old
            ? {
                ...old,
                data: old.data.map((v) =>
                  v.id === visit.id ? { ...v, status: action === 'approve' ? 'approved' : 'rejected' } : v,
                ),
              }
            : old,
        );
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey });
      },
    });
  }

  const approve = useVisitAction('approve');
  const reject = useVisitAction('reject');

  const busy = approve.isPending || reject.isPending;
  const error = approve.error ?? reject.error;
  const resolved = visit.status === 'approved' || visit.status === 'rejected';

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <VisitorAvatar name={visit.visitor.name} photoUrl={visit.visitor.photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-card-foreground">{visit.visitor.name ?? 'Unknown visitor'}</p>
          {visit.visitor.phone && <p className="text-sm text-muted-foreground">{visit.visitor.phone}</p>}
          {visit.purpose && <p className="mt-1 text-sm text-muted-foreground">{visit.purpose}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Arrived {formatIst(visit.createdAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {resolved ? (
            <span
              className={
                visit.status === 'approved'
                  ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                  : 'rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground'
              }
            >
              {visit.status === 'approved' ? 'Approved' : 'Rejected'}
            </span>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => reject.mutate()}>
                {reject.isPending && <Spinner className="mr-1 h-3 w-3" />}
                Reject
              </Button>
              <Button size="sm" disabled={busy} onClick={() => approve.mutate()}>
                {approve.isPending && <Spinner className="mr-1 h-3 w-3" />}
                Approve
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
    </li>
  );
}
