import type { UseQueryResult } from '@tanstack/react-query';
import { Card, CardContent } from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';

type GuardDashboard = components['schemas']['GuardDashboardResponseDto'];
type Visit = GuardDashboard['pendingVisits'][number];
type Delivery = GuardDashboard['pendingDeliveries'][number];

function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

function Avatar({ name, photoUrl }: { name: string | null; photoUrl?: string | null }) {
  if (photoUrl) {
    return <img src={photoUrl} alt={name ?? 'Visitor'} className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {initials(name)}
    </div>
  );
}

function VisitCard({ visit }: { visit: Visit }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <Avatar name={visit.visitor.name} photoUrl={visit.visitor.photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-card-foreground">{visit.visitor.name ?? 'Unknown visitor'}</p>
        <p className="text-xs text-muted-foreground">Flat {visit.flat.flatNumber}</p>
        {visit.purpose && <p className="text-sm text-muted-foreground">{visit.purpose}</p>}
        <p className="mt-1 text-xs text-muted-foreground">Arrived {formatIst(visit.createdAt)}</p>
      </div>
      {/* Read-only: a guard has visitor:manage (can register walk-ins) but not
          visitor:approve — approval is the resident's call, per §4's real
          division of responsibility, not the guard's. */}
      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
        Awaiting resident
      </span>
    </li>
  );
}

function DeliveryCard({ delivery }: { delivery: Delivery }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <Avatar name={delivery.agent.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-card-foreground">{delivery.agent.name ?? 'Unknown agent'}</p>
        <p className="text-xs text-muted-foreground">
          Flat {delivery.flat.flatNumber}
          {delivery.agent.platform ? ` · ${delivery.agent.platform}` : ''}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Arrived {formatIst(delivery.createdAt)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={
            delivery.otpVerified
              ? 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
              : 'rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
          }
        >
          {delivery.otpVerified ? 'OTP verified' : 'OTP pending'}
        </span>
        {delivery.heldAtDesk && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Held at desk
          </span>
        )}
      </div>
    </li>
  );
}

export function DashboardSection({ dashboard }: { dashboard: UseQueryResult<GuardDashboard> }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Pending Visitor Approvals</h2>
          {dashboard.isSuccess && dashboard.data.pendingVisits.length > 0 && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
              {dashboard.data.pendingVisits.length}
            </span>
          )}
        </div>

        {dashboard.isPending && (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-muted" />
            ))}
          </div>
        )}

        {dashboard.isSuccess && dashboard.data.pendingVisits.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No visitors waiting on a resident right now.
            </CardContent>
          </Card>
        )}

        {dashboard.isSuccess && dashboard.data.pendingVisits.length > 0 && (
          <ul className="space-y-2">
            {dashboard.data.pendingVisits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Pending Deliveries</h2>
          {dashboard.isSuccess && dashboard.data.pendingDeliveries.length > 0 && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
              {dashboard.data.pendingDeliveries.length}
            </span>
          )}
        </div>

        {dashboard.isPending && (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-muted" />
            ))}
          </div>
        )}

        {dashboard.isSuccess && dashboard.data.pendingDeliveries.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No deliveries waiting for handover.
            </CardContent>
          </Card>
        )}

        {dashboard.isSuccess && dashboard.data.pendingDeliveries.length > 0 && (
          <ul className="space-y-2">
            {dashboard.data.pendingDeliveries.map((delivery) => (
              <DeliveryCard key={delivery.id} delivery={delivery} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
