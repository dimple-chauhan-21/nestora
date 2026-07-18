# Security Review — 2026-07-19

A real self-review against Section 12 (Security Architecture) of
`docs/Society_Management_SRS.md`, checked against the actual codebase, not
against what the SRS says should exist. Every row below points at a file,
test, or command output — not a restatement of the spec. Full detail on
every fixed/deferred item lives in `KNOWN_GAPS.md`; this file is the
consolidated index.

## Summary table

| # | Control | Status | Evidence |
|---|---|---|---|
| 1 | RBAC/ABAC coverage (all modules incl. delivery) | **Fixed** | `amenity-booking.e2e-spec.ts` and `visitor-gate.e2e-spec.ts` had code-level `assertFlatMatch` enforcement with **zero test coverage** proving it worked — added ABAC boundary tests to both (new tests pass, confirming the enforcement is real, not just present). `delivery.e2e-spec.ts`'s existing ABAC test (added last session) confirmed still current. All other modules (society/resident, billing, complaint, domestic-staff) already had this coverage. |
| 2 | JWT/session security intact post `app_write_role` | **Pass** | RS256 signing unchanged (`token.service.ts`); refresh tokens SHA-256 hashed, rotated, reuse-detected (`token.service.spec.ts`, "detects reuse of an already-rotated token" test, passing). `refresh_tokens` has no `society_id`/RLS policy (global, user-keyed table) so Part 1's role change is structurally inert here — confirmed via migration grep. Full `auth.e2e-spec.ts` passes. |
| 3 | SQL injection | **Pass** | Every raw `.query()` call in `modules/`/`common/` (amenity-booking, webhook, tenant-connection) uses positional `$1/$2` parameters with a separate values array — grepped for template-literal interpolation inside `.query()`/`.where()`/`.andWhere()` calls, zero hits. The one place a variable is interpolated into SQL (`tenant-scope.util.ts`'s `alias` param) is restricted by convention to literal developer-supplied strings — verified at all 5 call sites. |
| 4 | Rate limiting on write endpoints | **Fixed** | Only OTP request/verify had rate limiting (`rate-limiter.service.ts`, Redis, 5/hour/phone) — every other write endpoint (complaints, visits, bookings, deliveries, etc.) had none. Added `WriteThrottlerGuard` (`common/guards/write-throttler.guard.ts`, `@nestjs/throttler`, 120 req/60s, tracked per authenticated user, writes only) registered globally in `app.module.ts`. Proven with a dedicated test (`write-rate-limit.e2e-spec.ts`): allows exactly the configured limit then 429s, never throttles GET. Full suite re-run clean (46→51 e2e tests, no false trips at the 120/60s production limit). |
| 5 | File upload validation | **Fixed + deferred** | Confirmed the one real multipart upload (`POST /societies/{id}/flats/bulk-import`, Multer) had **no MIME allow-list or size cap at all** — fixed via `common/upload/file-validation.util.ts` + `society.controller.ts`, proven by `society-bulk-import.e2e-spec.ts` (valid CSV accepted, wrong MIME → 415, oversized → rejected). Also tightened two DTOs that had regressed to bare `@IsString()` instead of `@IsUrl()` (`complaint`'s attachment `fileUrl`, `notice-board`'s `attachmentUrls`). **Deferred**: every other "document"/"photo" field (resident/society docs, police-verification, visitor/delivery photos, parking violations) is an unvalidated client-supplied URL string — there is no upload endpoint behind them at all, so real MIME/magic-byte validation is structurally impossible until a presigned-URL or proxied-upload architecture is built. Logged in `KNOWN_GAPS.md`. |
| 6 | CORS | **Documented** | Empirically verified (not just code inspection): a cross-origin preflight against the running app returns **no** `Access-Control-Allow-*` headers at all — `app.enableCors()` is never called anywhere. This is a default-deny posture, safe today, but **will break the Next.js web app** once it's built and calls the API cross-origin (different port in dev, different origin in prod). Documented in `KNOWN_GAPS.md`/README so it isn't rediscovered as a mystery 404/CORS error later — not fixed now since there's no real frontend origin to allow-list yet. |
| 7 | Secrets in git history | **Pass (moot)** | No `.git` directory exists anywhere in this project tree at any depth (confirmed via `find`) — this codebase has never been placed under version control, so there is no history for a secret to have leaked through. Verified the live filesystem independently regardless: `.env`/`apps/api/.env` are gitignored (`.gitignore` matches `.env` at any depth), `.env.example` contains only placeholder/dev-marked values (Firebase fields correctly left blank per its own comment), and `apps/api/keys/*.pem` is gitignored with the private key at `0600` permissions. |
| 8 | Dependency vulnerabilities | **Fixed + deferred** | `pnpm audit`: 54 findings (17 high) → **44 findings (12 high)** after fixes. Fixed via `pnpm-workspace.yaml` overrides (same-major-line, verified via full unit+e2e re-run): `multer` 2.0.2→2.2.0 (5 HIGH DoS — directly relevant, this is the package behind the upload endpoint touched in #5), `lodash`→^4.17.24 (1 HIGH + 2 MODERATE), `qs`→^6.15.2, `uuid`→^11.1.1. Deferred with explicit reasons (major-version migrations or devDependency-only/unbuilt-app risk): `@nestjs/core` (needs a full Nest v10→v11 migration), `file-type` (major bump, internal to `@nestjs/common`, low exploitability), the `@nestjs/cli` build-tooling chain (dev-only, never shipped), `electron`/`next` (both still Phase-0 scaffolds, not deployed). Added `.github/dependabot.yml` (npm + github-actions, weekly) so this becomes ongoing. |
| 9 | Password hashing / OTP lockout regression | **Pass** | `password.service.ts` still calls `argon2.hash(plain, { type: argon2.argon2id })` explicitly. OTP lockout (`otp.service.ts`): 3 attempts → 15-minute lockout, hashed storage (`sha256Hex`) — unchanged, and its 5 dedicated unit tests (`otp.service.spec.ts`) pass in the full 77-test suite. |
| 10 | `audit_logs` insert-only grant survived Part 1 | **Pass** | Verified empirically, not just via grants-table inspection: connected directly as `app_write_role` against both `society_dev` and `society_test` and issued `UPDATE`/`DELETE` against `audit_logs` — both rejected with `permission denied for table audit_logs` on every database. Confirms the insert-only grant from migration `1700000000019` survived Part 1's role migration and the delivery module's later `ALTER DEFAULT PRIVILEGES` inheritance intact. |
| 11 | Encryption at rest | **Documented (pre-production blocker)** | Neither half of SRS §12's Encryption row exists: (a) **file storage** — zero S3/MinIO client code anywhere in the API (`@aws-sdk/*` absent, no `S3Client`), consistent with #5's finding that no real upload path exists yet; MinIO as provisioned in `docker-compose.yml` has no SSE/KMS configured either. (b) **column-level encryption** — `pgcrypto` extension is enabled (`CREATE EXTENSION IF NOT EXISTS pgcrypto`) but never actually invoked anywhere; `visitors.id_proof_number` and `visitor_blacklist.id_proof_number` (the exact column SRS §12 names) are plain `varchar`, stored in plaintext. Both require real infrastructure/KMS work, not an app-code patch — logged in `KNOWN_GAPS.md` as a pre-production blocker, not silently dropped. |

## Full regression after all fixes

```
Unit tests:  13 suites, 77 passed, 77 total
E2E tests:   13 suites, 51 passed, 51 total   (was 11 suites / 44 tests before this session's new tests)
pnpm audit:  44 findings (9 low, 23 moderate, 12 high) — was 54 (9 low, 28 moderate, 17 high)
```

## What changed (files)

**New**: `common/guards/write-throttler.guard.ts`, `common/upload/file-validation.util.ts`,
`.github/dependabot.yml`, `test/write-rate-limit.e2e-spec.ts`,
`test/society-bulk-import.e2e-spec.ts`, plus new ABAC tests appended to
`test/amenity-booking.e2e-spec.ts` and `test/visitor-gate.e2e-spec.ts`.

**Changed**: `app.module.ts` (ThrottlerModule + guard registration),
`society.controller.ts` (upload validation wired in), `complaint`/`notice-board`
DTOs (URL validation tightened), `pnpm-workspace.yaml` + `apps/api/package.json`
(dependency overrides), `KNOWN_GAPS.md` (three new entries: file-upload
architecture, dependency triage, encryption-at-rest).

## Five gaps now tracked in KNOWN_GAPS.md (not silently dropped)

1. Document/photo fields across every module are unvalidated client-supplied URLs, not real uploads.
2. Dependency vulnerabilities deliberately not fixed this session (with reasons per package).
3. No encryption at rest — neither file storage nor sensitive PII columns.
4. CORS is currently fully disabled — will need explicit origin configuration once the web app exists.
5. (Pre-existing, reconfirmed intact) RLS's narrow platform-scope exceptions and AuditService's cross-society view — unchanged by this session.
