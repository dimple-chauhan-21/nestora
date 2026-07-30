'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Button,
  Input,
  Badge,
  Alert,
  AlertDescription,
  Spinner,
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
import { residentsKey } from '../query-keys';

type PaginatedResidentResponseDto = components['schemas']['PaginatedResidentResponseDto'];
type ResidentResponseDto = components['schemas']['ResidentResponseDto'];

const PAGE_SIZE = 20;

async function fetchResidentsPage(
  societyId: string,
  flatNumber: string,
  cursor: string | undefined,
): Promise<PaginatedResidentResponseDto> {
  const url = new URL(`/api/societies/${societyId}/residents`, window.location.origin);
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (cursor) url.searchParams.set('cursor', cursor);
  if (flatNumber) url.searchParams.set('flatNumber', flatNumber);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load residents');
  }
  return res.json();
}

const STATUS_VARIANT: Record<ResidentResponseDto['status'], 'success' | 'warning' | 'default'> = {
  active: 'success',
  suspended: 'warning',
  moved_out: 'default',
};

const RELATION_LABEL: Record<ResidentResponseDto['relationType'], string> = {
  owner: 'Owner',
  tenant: 'Tenant',
  family: 'Family',
};

export function ResidentsTable({ societyId }: { societyId: string }) {
  const [flatNumberInput, setFlatNumberInput] = useState('');
  const [flatNumber, setFlatNumber] = useState('');

  const query = useInfiniteQuery({
    queryKey: residentsKey(societyId, { flatNumber }),
    queryFn: ({ pageParam }) => fetchResidentsPage(societyId, flatNumber, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? (lastPage.pagination.nextCursor ?? undefined) : undefined,
  });

  const residents = query.data?.pages.flatMap((page) => page.data) ?? [];
  const isSearching = flatNumber.length > 0;

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setFlatNumber(flatNumberInput.trim());
        }}
      >
        <Input
          placeholder="Search by flat number…"
          value={flatNumberInput}
          onChange={(e) => setFlatNumberInput(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {isSearching && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFlatNumberInput('');
              setFlatNumber('');
            }}
          >
            Clear
          </Button>
        )}
      </form>

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
            <span>{query.error instanceof Error ? query.error.message : 'Failed to load residents'}</span>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.isSuccess && residents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
            {isSearching ? (
              <>
                <p className="font-medium text-card-foreground">No residents match &quot;{flatNumber}&quot;</p>
                <p className="text-sm text-muted-foreground">Try a different flat number, or clear the search.</p>
              </>
            ) : (
              <>
                <p className="font-medium text-card-foreground">No residents yet</p>
                <p className="text-sm text-muted-foreground">
                  This society doesn&apos;t have any residents on record yet — they&apos;ll show up here once flats
                  are occupied and owners/tenants are added.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {query.isSuccess && residents.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flat</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Relation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Since</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {residents.map((resident) => (
              <TableRow key={resident.id}>
                <TableCell>
                  <Link href={`/admin/residents/${resident.flat.id}`} className="font-medium text-primary hover:underline">
                    {resident.flat.flatNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  {resident.user?.phone ?? <span className="text-muted-foreground">No linked account</span>}
                  {(resident.isSeniorCitizen || resident.isChild) && (
                    <div className="mt-1 flex gap-1">
                      {resident.isSeniorCitizen && <Badge variant="outline">Senior citizen</Badge>}
                      {resident.isChild && <Badge variant="outline">Child</Badge>}
                    </div>
                  )}
                </TableCell>
                <TableCell>{RELATION_LABEL[resident.relationType]}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[resident.status]}>{resident.status.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatIst(resident.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            {query.isFetchingNextPage && <Spinner className="mr-1 h-3 w-3" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
