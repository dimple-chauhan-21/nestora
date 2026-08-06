'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Select,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Alert,
  AlertDescription,
  Spinner,
} from '@nestora/ui';
import { formatIst, formatRoleName } from '@nestora/utils';
import type { components } from '@nestora/types';
import { assignableStaffKey, complaintCommentsKey } from '../../query-keys';
import { ComplaintCommentThread } from '@/components/complaint-comment-thread';

type ComplaintResponseDto = components['schemas']['ComplaintResponseDto'];
type AssignableStaffDto = components['schemas']['AssignableStaffDto'];

async function fetchComplaint(id: string): Promise<ComplaintResponseDto> {
  const res = await fetch(`/api/complaints/${id}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load complaint');
  }
  return body as ComplaintResponseDto;
}

async function fetchAssignableStaff(societyId: string): Promise<AssignableStaffDto[]> {
  const res = await fetch(`/api/societies/${societyId}/assignable-staff`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load assignable staff');
  }
  return body as AssignableStaffDto[];
}

async function assignComplaint(id: string, assignedTo: string): Promise<ComplaintResponseDto> {
  const res = await fetch(`/api/complaints/${id}/assign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignedTo }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to assign complaint');
  }
  return body as ComplaintResponseDto;
}

export function ComplaintDetailClient({ complaintId, societyId }: { complaintId: string; societyId: string | null }) {
  const queryClient = useQueryClient();
  const complaintQuery = useQuery({
    queryKey: ['admin', 'complaints', complaintId],
    queryFn: () => fetchComplaint(complaintId),
  });
  const staffQuery = useQuery({
    queryKey: societyId ? assignableStaffKey(societyId) : ['admin', 'assignable-staff', 'none'],
    queryFn: () => fetchAssignableStaff(societyId!),
    enabled: !!societyId,
  });

  const [selectedStaff, setSelectedStaff] = useState('');
  const assignMutation = useMutation({
    mutationFn: (assignedTo: string) => assignComplaint(complaintId, assignedTo),
    onSuccess: (dto) => {
      queryClient.setQueryData(['admin', 'complaints', complaintId], dto);
    },
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
            <CardTitle>Flat {complaint.flat.flatNumber}</CardTitle>
            <Badge>{complaint.status.replace('_', ' ')}</Badge>
          </div>
          <CardDescription>
            {complaint.category.name} · {complaint.priority} priority · SLA due {formatIst(complaint.slaDueAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-foreground">{complaint.description}</p>
          <p className="text-sm text-muted-foreground">
            Raised by {complaint.raisedBy?.phone ?? 'Unknown'}
            {complaint.assignedTo ? ` · Assigned to ${complaint.assignedTo.phone}` : ' · Unassigned'}
          </p>

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Assign to staff
              </label>
              <Select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
                <option value="">Select staff…</option>
                {(staffQuery.data ?? []).map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.phone ?? staff.id} — {formatRoleName(staff.roleCode)}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              disabled={!selectedStaff || assignMutation.isPending}
              onClick={() => assignMutation.mutate(selectedStaff)}
            >
              {assignMutation.isPending && <Spinner className="mr-1 h-3 w-3" />}
              Assign
            </Button>
          </div>
          {assignMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {assignMutation.error instanceof Error ? assignMutation.error.message : 'Failed to assign complaint'}
              </AlertDescription>
            </Alert>
          )}
          {staffQuery.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {staffQuery.error instanceof Error ? staffQuery.error.message : 'Failed to load assignable staff'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Comments</h2>
        <ComplaintCommentThread complaintId={complaintId} queryKey={complaintCommentsKey(complaintId)} />
      </section>
    </div>
  );
}
