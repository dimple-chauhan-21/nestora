'use client';

import { useQuery } from '@tanstack/react-query';
import { Button, Badge, Card, CardHeader, CardTitle, CardDescription, CardContent, Alert, AlertDescription } from '@nestora/ui';
import type { components } from '@nestora/types';
import { flatDetailKey } from '../../query-keys';

type FlatDetailResponseDto = components['schemas']['FlatDetailResponseDto'];

async function fetchFlatDetail(flatId: string): Promise<FlatDetailResponseDto> {
  const res = await fetch(`/api/flats/${flatId}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load flat detail');
  }
  return body as FlatDetailResponseDto;
}

export function FlatDetailClient({ flatId }: { flatId: string }) {
  const query = useQuery({ queryKey: flatDetailKey(flatId), queryFn: () => fetchFlatDetail(flatId) });

  if (query.isPending) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{query.error instanceof Error ? query.error.message : 'Failed to load flat detail'}</span>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const flat = query.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Flat {flat.flatNumber}</h1>
        <p className="text-sm text-muted-foreground">
          {flat.floorNumber !== null ? `Floor ${flat.floorNumber} · ` : ''}
          {flat.status}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Residents</h2>
        {flat.residents.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No residents recorded for this flat yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {flat.residents.map((resident) => (
              <Card key={resident.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {resident.user?.phone ?? 'No linked account'}
                    </CardTitle>
                    <Badge variant={resident.status === 'active' ? 'success' : 'default'}>{resident.status}</Badge>
                  </div>
                  <CardDescription>
                    {resident.relationType.charAt(0).toUpperCase() + resident.relationType.slice(1)}
                    {resident.isSeniorCitizen ? ' · Senior citizen' : ''}
                    {resident.isChild ? ' · Child' : ''}
                  </CardDescription>
                </CardHeader>
                {resident.vehicles.length > 0 && (
                  <CardContent className="pt-0">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vehicles</p>
                    <div className="flex flex-wrap gap-2">
                      {resident.vehicles.map((vehicle) => (
                        <Badge key={vehicle.id} variant="outline">
                          {vehicle.registrationNumber} ({vehicle.type})
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Pets</h2>
        {flat.pets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pets recorded for this flat.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {flat.pets.map((pet) => (
              <Badge key={pet.id} variant="outline">
                {pet.name} ({pet.species})
              </Badge>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
