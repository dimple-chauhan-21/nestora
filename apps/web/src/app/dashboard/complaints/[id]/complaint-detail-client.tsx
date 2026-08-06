'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge, Card, CardHeader, CardTitle, CardDescription, CardContent, Alert, AlertDescription, Button } from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';
import { complaintCommentsKey } from '../../query-keys';
import { ComplaintCommentThread } from '@/components/complaint-comment-thread';

type ComplaintResponseDto = components['schemas']['ComplaintResponseDto'];
type Status = ComplaintResponseDto['status'];

const STATUS_VARIANT: Record<Status, 'success' | 'warning' | 'destructive' | 'default'> = {
  open: 'destructive',
  assigned: 'warning',
  in_progress: 'warning',
  resolved: 'success',
  reopened: 'destructive',
  closed: 'default',
};

async function fetchComplaint(id: string): Promise<ComplaintResponseDto> {
  const res = await fetch(`/api/complaints/${id}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load complaint');
  }
  return body as ComplaintResponseDto;
}

export function ComplaintDetailClient({ complaintId }: { complaintId: string }) {
  const complaintQuery = useQuery({
    queryKey: ['complaints', complaintId],
    queryFn: () => fetchComplaint(complaintId),
  });

  if (complaintQuery.isPending) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted" />
        ))}
      </div>
    );
  }

  if (complaintQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{complaintQuery.error instanceof Error ? complaintQuery.error.message : 'Failed to load complaint'}</span>
          <Button size="sm" variant="outline" onClick={() => complaintQuery.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const complaint = complaintQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{complaint.category.name}</CardTitle>
            <Badge variant={STATUS_VARIANT[complaint.status]}>{complaint.status.replace('_', ' ')}</Badge>
          </div>
          <CardDescription>
            {complaint.priority} priority · SLA due {formatIst(complaint.slaDueAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-foreground">{complaint.description}</p>
          <p className="text-sm text-muted-foreground">
            {complaint.assignedTo ? `Assigned to ${complaint.assignedTo.phone}` : 'Not yet assigned'}
            {complaint.resolvedAt ? ` · Resolved ${formatIst(complaint.resolvedAt)}` : ''}
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Comments</h2>
        <ComplaintCommentThread
          complaintId={complaintId}
          queryKey={complaintCommentsKey(complaintId)}
          canPostInternal={false}
        />
      </section>
    </div>
  );
}
