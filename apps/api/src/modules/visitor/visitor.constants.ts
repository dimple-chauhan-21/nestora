/**
 * §4's own text is internally inconsistent: the User Flow narrative says
 * "60-second auto-escalate", but the Validations section says "expires
 * after configurable timeout (default 5 min)". Treating Validations as the
 * canonical spec statement (it's the section that actually says
 * "configurable" with a default) — 60s reads like an illustrative UX
 * example, not the intended default. Configurable via env either way.
 */
export const DEFAULT_ESCALATION_WINDOW_SECONDS = Number(
  process.env.VISIT_ESCALATION_WINDOW_SECONDS ?? 300,
);

/** How long an approved pass (QR) stays valid from the moment of approval, absent a more specific valid_to. */
export const DEFAULT_PASS_VALIDITY_HOURS = Number(process.env.VISIT_PASS_VALIDITY_HOURS ?? 2);

/**
 * The guard dashboard poll is what actually triggers checkAndEscalate in the
 * running app (GET /guard/dashboard sweeps on every call) — this constant is
 * the interval the desktop kiosk poller uses, and it must stay meaningfully
 * shorter than DEFAULT_ESCALATION_WINDOW_SECONDS for escalation to fire close
 * to on-time (15s against a 300s window = 20x headroom).
 */
export const GUARD_DASHBOARD_POLL_INTERVAL_SECONDS = Number(
  process.env.GUARD_DASHBOARD_POLL_INTERVAL_SECONDS ?? 15,
);
