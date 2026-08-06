'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge, Alert, AlertDescription, Button, Card, CardContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';
import { myComplaintsKey } from '../query-keys';

type ComplaintResponseDto = components['schemas']['ComplaintResponseDto'];
type Status = ComplaintResponseDto['status'];
type Priority = ComplaintResponseDto['priority'];

const STATUS_VARIANT: Record<Status, 'success' | 'warning' | 'destructive' | 'default'> = {
  open: 'destructive',
  assigned: 'warning',
  in_progress: 'warning',
  resolved: 'success',
  reopened: 'destructive',
  closed: 'default',
};

const PRIORITY_VARIANT: Record<Priority, 'destructive' | 'warning' | 'default'> = {
  urgent: 'destructive',
  high: 'destructive',
  medium: 'warning',
  low: 'default',
};

async function fetchMyComplaints(flatId: string): Promise<ComplaintResponseDto[]> {
  const url = new URL('/api/complaints', window.location.origin);
  url.searchParams.set('flatId', flatId);
  const res = await fetch(url.toString());
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load complaints');
  }
  return body as ComplaintResponseDto[];
}

export function ComplaintListClient({ flatId }: { flatId: string }) {
  const query = useQuery({ queryKey: myComplaintsKey(flatId), queryFn: () => fetchMyComplaints(flatId) });

  if (query.isPending) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-muted" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{query.error instanceof Error ? query.error.message : 'Failed to load complaints'}</span>
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
          <p className="font-medium text-card-foreground">Nothing to report</p>
          <p className="text-sm text-muted-foreground">
            You haven&apos;t raised any complaints. Use the form above if something needs attention.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>SLA due</TableHead>
          <TableHead>Raised</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {query.data.map((complaint) => (
          <TableRow key={complaint.id}>
            <TableCell>
              <Link href={`/dashboard/complaints/${complaint.id}`} className="font-medium text-primary hover:underline">
                {complaint.category.name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={PRIORITY_VARIANT[complaint.priority]}>{complaint.priority}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[complaint.status]}>{complaint.status.replace('_', ' ')}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatIst(complaint.slaDueAt)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatIst(complaint.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
