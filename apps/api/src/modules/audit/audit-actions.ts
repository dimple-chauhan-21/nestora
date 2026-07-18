/**
 * The full, closed set of `audit_logs.action` values this codebase writes.
 * `AuditService.record()` requires a value from here (via the `AuditAction`
 * union), not a raw string — a typo'd or freeform action code is now a
 * compile error, not a runtime Postgres "value too long" error discovered
 * by a test (see the domestic-staff police-verification actions, which hit
 * exactly that before `audit_logs.action` was widened to VARCHAR(100)).
 *
 * Convention: `<entity>.<what happened>`, snake_case, kept well under the
 * 100-char column width — these are all comfortably short, and should stay
 * that way; there's no good reason for an action code to approach the
 * limit even with headroom available.
 */
export const AUDIT_ACTIONS = {
  BILL_GENERATED: 'bill.generated',
  BILL_LATE_FEE_APPLIED: 'bill.late_fee_applied',

  PAYMENT_SESSION_INITIATED: 'payment.session_initiated',
  PAYMENT_RECORDED_OFFLINE: 'payment.recorded_offline',
  PAYMENT_WEBHOOK_CONFIRMED: 'payment.webhook_confirmed',
  PAYMENT_WEBHOOK_REPLAYED: 'payment.webhook_replayed',
  PAYMENT_WEBHOOK_REJECTED: 'payment.webhook_rejected',
  PAYMENT_WEBHOOK_UNKNOWN_REF: 'payment.webhook_unknown_ref',

  DOMESTIC_STAFF_DOC_UPLOADED: 'domestic_staff.doc_uploaded',
  DOMESTIC_STAFF_DOC_STATUS_CHANGED: 'domestic_staff.doc_status_changed',
  DOMESTIC_STAFF_DOC_ACCESSED: 'domestic_staff.doc_accessed',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
