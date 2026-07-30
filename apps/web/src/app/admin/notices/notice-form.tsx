'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Input,
  Select,
  Textarea,
  FormField,
  Label,
  Card,
  CardContent,
  CardFooter,
  Alert,
  AlertDescription,
  Spinner,
} from '@nestora/ui';
import type { components } from '@nestora/types';

type NoticeResponseDto = components['schemas']['NoticeResponseDto'];
type CreateNoticeDto = components['schemas']['CreateNoticeDto'];

// A curated subset of the role catalog relevant to notice targeting — the
// backend accepts any role code for type "role", but most of the catalog
// (super_admin, vendor, visitor_guest, …) is never a meaningful notice
// audience, so the picker doesn't offer them.
const ROLE_OPTIONS = [
  { code: 'flat_owner', label: 'Owners' },
  { code: 'tenant', label: 'Tenants' },
  { code: 'family_member', label: 'Family members' },
  { code: 'security_guard', label: 'Security guards' },
  { code: 'domestic_staff', label: 'Domestic staff' },
];

async function postNotice(dto: CreateNoticeDto): Promise<NoticeResponseDto> {
  const res = await fetch('/api/notices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to post notice');
  }
  return body as NoticeResponseDto;
}

export function NoticeForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [audienceType, setAudienceType] = useState<'all' | 'role'>('all');
  const [role, setRole] = useState(ROLE_OPTIONS[0]!.code);
  const [isPinned, setIsPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  const mutation = useMutation({
    mutationFn: (dto: CreateNoticeDto) => postNotice(dto),
    onSuccess: () => {
      setTitle('');
      setBody('');
      setCategory('');
      setIsPinned(false);
      setExpiresAt('');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      title,
      body,
      ...(category ? { category } : {}),
      targetAudience: audienceType === 'all' ? { type: 'all' } : { type: 'role', role },
      isPinned,
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <FormField label="Title" htmlFor="title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
          </FormField>
          <FormField label="Body" htmlFor="body" required>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[120px]" />
          </FormField>
          <FormField label="Category" htmlFor="category">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. maintenance, event" />
          </FormField>

          <div className="space-y-2">
            <Label htmlFor="audienceType">Target audience</Label>
            <Select
              id="audienceType"
              value={audienceType}
              onChange={(e) => setAudienceType(e.target.value as 'all' | 'role')}
            >
              <option value="all">Everyone in the society</option>
              <option value="role">A specific role</option>
            </Select>
          </div>
          {audienceType === 'role' && (
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <FormField label="Expires at (optional)" htmlFor="expiresAt">
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </FormField>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Pin to top of notice board
          </label>

          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {mutation.error instanceof Error ? mutation.error.message : 'Failed to post notice'}
              </AlertDescription>
            </Alert>
          )}
          {mutation.isSuccess && (
            <Alert variant="success">
              <AlertDescription>
                Posted — reached {mutation.data.recipientCount} recipient{mutation.data.recipientCount === 1 ? '' : 's'}.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={mutation.isPending || !title || !body}>
            {mutation.isPending && <Spinner className="mr-1 h-3 w-3" />}
            Post notice
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
