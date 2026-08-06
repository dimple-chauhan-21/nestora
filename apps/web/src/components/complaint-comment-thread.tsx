'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Button, Textarea, Badge, Alert, AlertDescription, Spinner, Card, CardContent } from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';

type ComplaintCommentResponseDto = components['schemas']['ComplaintCommentResponseDto'];

async function fetchComments(complaintId: string): Promise<ComplaintCommentResponseDto[]> {
  const res = await fetch(`/api/complaints/${complaintId}/comments`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load comments');
  }
  return body as ComplaintCommentResponseDto[];
}

async function postComment(
  complaintId: string,
  values: { body: string; isInternal: boolean },
): Promise<ComplaintCommentResponseDto> {
  const res = await fetch(`/api/complaints/${complaintId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to post comment');
  }
  return body as ComplaintCommentResponseDto;
}

/**
 * is_internal-aware comment thread — shared between the admin console and
 * the resident dashboard (originally admin-only; extended here rather than
 * duplicated). Staff-only ("internal note") comments get a visibly distinct
 * treatment (amber background + badge) so nobody mistakes one for something
 * the resident who raised the complaint can see.
 *
 * `canPostInternal` hides the "Internal note" checkbox entirely for a
 * resident caller — not just because the API already refuses to honor
 * isInternal:true from a flat-scoped caller (it does, see
 * ComplaintService.addComment), but because *offering* a control that's
 * silently ignored would be misleading UI. The `comment.isInternal` render
 * branch below is left in either way as defense-in-depth: the API also
 * never returns is_internal comments to a resident-scoped GET in the first
 * place (server-side filtering, not client-side), so for a resident caller
 * this branch is simply unreachable in practice, not relied upon to hide
 * anything.
 */
export function ComplaintCommentThread({
  complaintId,
  queryKey,
  canPostInternal = true,
}: {
  complaintId: string;
  queryKey: QueryKey;
  canPostInternal?: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: () => fetchComments(complaintId) });

  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const mutation = useMutation({
    mutationFn: () => postComment(complaintId, { body, isInternal: canPostInternal && isInternal }),
    onSuccess: () => {
      setBody('');
      setIsInternal(false);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <div className="space-y-4">
      {query.isPending && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{query.error instanceof Error ? query.error.message : 'Failed to load comments'}</span>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.isSuccess && query.data.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">No comments yet.</CardContent>
        </Card>
      )}

      {query.isSuccess && query.data.length > 0 && (
        <ul className="space-y-2">
          {query.data.map((comment) => (
            <li
              key={comment.id}
              className={
                comment.isInternal
                  ? 'rounded-lg border border-warning/40 bg-warning/10 p-3'
                  : 'rounded-lg border border-border bg-card p-3'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-card-foreground">{comment.author?.phone ?? 'Unknown'}</p>
                <div className="flex items-center gap-2">
                  {comment.isInternal && <Badge variant="warning">Internal note</Badge>}
                  <p className="text-xs text-muted-foreground">{formatIst(comment.createdAt)}</p>
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) mutation.mutate();
        }}
      >
        <Textarea
          placeholder="Add a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[70px]"
        />
        <div className="flex items-center justify-between">
          {canPostInternal ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Internal note (staff only, not visible to the resident)
            </label>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={mutation.isPending || !body.trim()}>
            {mutation.isPending && <Spinner className="mr-1 h-3 w-3" />}
            Post
          </Button>
        </div>
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to post comment'}
            </AlertDescription>
          </Alert>
        )}
      </form>
    </div>
  );
}
