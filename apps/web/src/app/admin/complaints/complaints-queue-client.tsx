'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Select,
  Badge,
  Alert,
  AlertDescription,
  Card,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';
import { complaintsKey } from '../query-keys';

type ComplaintResponseDto = components['schemas']['ComplaintResponseDto'];
type Status = ComplaintResponseDto['status'];
type Priority = ComplaintResponseDto['priority'];

const STATUS_OPTIONS: Status[] = ['open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed'];
const PRIORITY_OPTIONS: Priority[] = ['low', 'medium', 'high', 'urgent'];

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

async function fetchComplaints(filters: {
  status?: string;
  priority?: string;
  categoryId?: string;
}): Promise<ComplaintResponseDto[]> {
  const url = new URL('/api/complaints', window.location.origin);
  if (filters.status) url.searchParams.set('status', filters.status);
  if (filters.priority) url.searchParams.set('priority', filters.priority);
  if (filters.categoryId) url.searchParams.set('categoryId', filters.categoryId);
  const res = await fetch(url.toString());
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load complaints');
  }
  return body as ComplaintResponseDto[];
}

export function ComplaintsQueueClient() {
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const filters = { status, priority, categoryId };
  const query = useQuery({
    queryKey: complaintsKey(filters),
    queryFn: () => fetchComplaints(filters),
  });

  // GET /complaints has no separate "list categories" endpoint — the
  // category filter's options are derived from an unfiltered baseline
  // fetch of this society's complaints, not a second backend endpoint.
  const baseline = useQuery({
    queryKey: complaintsKey({}),
    queryFn: () => fetchComplaints({}),
  });
  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of baseline.data ?? []) map.set(c.category.id, c.category.name);
    return [...map.entries()];
  }, [baseline.data]);

  const hasFilters = status || priority || categoryId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[160px]">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="max-w-[160px]">
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="max-w-[200px]">
          <option value="">All categories</option>
          {categoryOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setStatus('');
              setPriority('');
              setCategoryId('');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {query.isPending && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{query.error instanceof Error ? query.error.message : 'Failed to load complaints'}</span>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.isSuccess && query.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
            <p className="font-medium text-card-foreground">
              {hasFilters ? 'No complaints match these filters' : 'No complaints yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'Try clearing a filter.'
                : 'Nothing has been raised in this society yet — new complaints will show up here.'}
            </p>
          </CardContent>
        </Card>
      )}

      {query.isSuccess && query.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flat</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>SLA due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.map((complaint) => (
              <TableRow key={complaint.id}>
                <TableCell>
                  <Link href={`/admin/complaints/${complaint.id}`} className="font-medium text-primary hover:underline">
                    {complaint.flat.flatNumber}
                  </Link>
                </TableCell>
                <TableCell>{complaint.category.name}</TableCell>
                <TableCell>
                  <Badge variant={PRIORITY_VARIANT[complaint.priority]}>{complaint.priority}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[complaint.status]}>{complaint.status.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell>{complaint.assignedTo?.phone ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatIst(complaint.slaDueAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
