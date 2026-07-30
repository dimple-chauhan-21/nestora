'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Alert, AlertDescription, Spinner } from '@nestora/ui';
import type { components } from '@nestora/types';

type PaginatedResidentResponseDto = components['schemas']['PaginatedResidentResponseDto'];

export function FlatSearchForm({ societyId }: { societyId: string }) {
  const router = useRouter();
  const [flatNumber, setFlatNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = flatNumber.trim();
    if (!trimmed) return;
    setError(null);
    setIsSearching(true);
    try {
      const url = new URL(`/api/societies/${societyId}/residents`, window.location.origin);
      url.searchParams.set('flatNumber', trimmed);
      url.searchParams.set('limit', '1');
      const res = await fetch(url.toString());
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof body?.message === 'string' ? body.message : 'Search failed');
      }
      const data = (body as PaginatedResidentResponseDto).data;
      if (data.length === 0) {
        setError(`No flat found matching "${trimmed}"`);
        return;
      }
      router.push(`/admin/billing/${data[0]!.flat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <form className="flex gap-2" onSubmit={handleSubmit}>
      <Input
        placeholder="Flat number…"
        value={flatNumber}
        onChange={(e) => setFlatNumber(e.target.value)}
        className="max-w-xs"
      />
      <Button type="submit" disabled={isSearching}>
        {isSearching && <Spinner className="mr-1 h-3 w-3" />}
        View bills
      </Button>
      {error && (
        <Alert variant="destructive" className="flex-1">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
