/**
 * The real trigger for the API's approval-timeout escalation sweep — every
 * poll hits GET /guard/dashboard, which sweeps overdue pending visits as a
 * side effect (see apps/api's GuardService.getDashboard). 15s default is
 * 20x shorter than the 300s default escalation window (session decision).
 */
export function startDashboardPolling(
  apiBaseUrl: string,
  accessToken: string,
  intervalSeconds: number,
): ReturnType<typeof setInterval> {
  const poll = async (): Promise<void> => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/guard/dashboard`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { pendingVisits?: unknown[]; escalatedJustNow?: number };
        console.log(
          `[guard-dashboard-poll] pending=${data.pendingVisits?.length ?? 0} escalatedJustNow=${data.escalatedJustNow ?? 0}`,
        );
      }
    } catch {
      // Offline — expected while disconnected, next tick retries.
    }
  };

  void poll();
  return setInterval(poll, intervalSeconds * 1000);
}
