import { useQuery } from '@tanstack/react-query';
import type { components } from '@nestora/types';
import { authedFetch } from './api-config';
import { guardDashboardKey } from './query-keys';

type GuardDashboard = components['schemas']['GuardDashboardResponseDto'];

/**
 * Same poll-interval convention as apps/web's resident dashboard
 * (PENDING_VISITS_POLL_INTERVAL_MS) and the backend's own
 * GUARD_DASHBOARD_POLL_INTERVAL_SECONDS — 15s. Every hit of this endpoint
 * also sweeps the society's overdue pending-visit escalations server-side
 * (GuardService.getDashboard's own doc comment), so this poll is the real
 * escalation trigger too, not just a UI refresh.
 *
 * Shared by GuardConsole (header: gate name) and DashboardSection (pending
 * visits/deliveries/alerts) — both call this same hook, so React Query
 * dedupes them into one network request per interval, not two.
 */
export function useGuardDashboard(accessToken: string) {
  return useQuery({
    queryKey: guardDashboardKey,
    queryFn: () => authedFetch<GuardDashboard>(accessToken, '/api/v1/guard/dashboard'),
    refetchInterval: 15_000,
  });
}
