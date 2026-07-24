/** All timestamps are stored UTC (TIMESTAMPTZ) — every UI rendering renders IST, per CLAUDE.md's non-negotiables. */
const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatIst(iso: string): string {
  return IST_FORMATTER.format(new Date(iso));
}
