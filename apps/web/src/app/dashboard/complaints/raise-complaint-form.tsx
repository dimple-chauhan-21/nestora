'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Select, Textarea, Alert, AlertDescription, Spinner, Card, CardHeader, CardTitle, CardContent } from '@nestora/ui';
import type { components } from '@nestora/types';
import { complaintCategoriesKey, myComplaintsKey } from '../query-keys';

type ComplaintCategoryResponseDto = components['schemas']['ComplaintCategoryResponseDto'];
type ComplaintResponseDto = components['schemas']['ComplaintResponseDto'];
type Priority = ComplaintResponseDto['priority'];

const PRIORITY_OPTIONS: Priority[] = ['low', 'medium', 'high', 'urgent'];

async function fetchCategories(): Promise<ComplaintCategoryResponseDto[]> {
  const res = await fetch('/api/complaint-categories');
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load complaint categories');
  }
  return body as ComplaintCategoryResponseDto[];
}

async function raiseComplaint(values: {
  flatId: string;
  categoryId: string;
  priority: Priority;
  description: string;
}): Promise<ComplaintResponseDto> {
  const res = await fetch('/api/complaints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to raise complaint');
  }
  return body as ComplaintResponseDto;
}

export function RaiseComplaintForm({ flatId }: { flatId: string }) {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: complaintCategoriesKey(), queryFn: fetchCategories });

  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: () => raiseComplaint({ flatId, categoryId, priority, description }),
    onSuccess: () => {
      setCategoryId('');
      setPriority('medium');
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: myComplaintsKey(flatId) });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raise a complaint</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (categoryId && description.trim()) mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</label>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={categoriesQuery.isPending}>
                <option value="">Select category…</option>
                {(categoriesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Priority</label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</label>
            <Textarea
              placeholder="Describe the issue…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[90px]"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Photo/video attachments aren&apos;t supported yet — there&apos;s no upload endpoint for complaints in this
            build, so a resident can only submit a text description for now.
          </p>

          {categoriesQuery.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {categoriesQuery.error instanceof Error ? categoriesQuery.error.message : 'Failed to load categories'}
              </AlertDescription>
            </Alert>
          )}

          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {mutation.error instanceof Error ? mutation.error.message : 'Failed to raise complaint'}
              </AlertDescription>
            </Alert>
          )}

          {mutation.isSuccess && (
            <Alert>
              <AlertDescription>Complaint raised. You can track its status in the list below.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={mutation.isPending || !categoryId || !description.trim()}>
            {mutation.isPending && <Spinner className="mr-1 h-3 w-3" />}
            Submit complaint
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
