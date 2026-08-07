'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Badge, Alert, AlertDescription, Card, CardContent } from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';
import { societyNoticesKey } from '../query-keys';

type NoticeResponseDto = components['schemas']['NoticeResponseDto'];

async function fetchNotices(societyId: string): Promise<NoticeResponseDto[]> {
  const res = await fetch(`/api/societies/${societyId}/notices`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load notices');
  }
  return body as NoticeResponseDto[];
}

async function markRead(noticeId: string): Promise<void> {
  const res = await fetch(`/api/notices/${noticeId}/read`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to mark notice as read');
  }
}

function NoticeCard({ notice, societyId }: { notice: NoticeResponseDto; societyId: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const mutation = useMutation({
    mutationFn: () => markRead(notice.id),
    onMutate: async () => {
      const key = societyNoticesKey(societyId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NoticeResponseDto[]>(key);
      queryClient.setQueryData<NoticeResponseDto[]>(key, (old) =>
        old?.map((n) => (n.id === notice.id ? { ...n, isRead: true } : n)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(societyNoticesKey(societyId), context.previous);
    },
  });

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && !notice.isRead && !mutation.isPending) {
      mutation.mutate();
    }
  }

  return (
    <Card>
      <button type="button" onClick={toggleExpanded} className="w-full text-left">
        <CardContent className="space-y-2 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {notice.isPinned && <Badge variant="warning">Pinned</Badge>}
              {!notice.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              <h3 className="font-medium text-card-foreground">{notice.title}</h3>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{formatIst(notice.createdAt)}</span>
          </div>
          {notice.category && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{notice.category}</p>
          )}
          {expanded && <p className="whitespace-pre-wrap text-sm text-foreground">{notice.body}</p>}
          {!expanded && <p className="truncate text-sm text-muted-foreground">{notice.body}</p>}
        </CardContent>
      </button>
    </Card>
  );
}

export function NoticeListClient({ societyId }: { societyId: string }) {
  const query = useQuery({ queryKey: societyNoticesKey(societyId), queryFn: () => fetchNotices(societyId) });

  if (query.isPending) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-muted" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{query.error instanceof Error ? query.error.message : 'Failed to load notices'}</span>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (query.data.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
          <p className="font-medium text-card-foreground">No notices yet</p>
          <p className="text-sm text-muted-foreground">
            Your society admin or committee hasn&apos;t posted anything yet — notices will show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {query.data.map((notice) => (
        <li key={notice.id}>
          <NoticeCard notice={notice} societyId={societyId} />
        </li>
      ))}
    </ul>
  );
}
