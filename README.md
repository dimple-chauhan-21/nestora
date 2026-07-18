# Nestora — Society Management Platform

Multi-tenant Society Management Platform (MyGate/ApnaComplex-class). See
[`CLAUDE.md`](./CLAUDE.md) and [`docs/Society_Management_SRS.md`](./docs/Society_Management_SRS.md)
for the full spec, and [`KNOWN_GAPS.md`](./KNOWN_GAPS.md) for tracked gaps between
what's implemented and production posture.

## Quickstart (fresh clone → running dev environment)

```bash
pnpm install
cp .env.example .env && docker compose up -d
cd apps/api && pnpm run keys:generate && pnpm run migration:run && pnpm run seed
pnpm run dev
```

That's it — 4 commands. The API is now on `http://localhost:4000/api/v1`, with
Postgres/Redis/RabbitMQ/MinIO healthy in the background (`docker compose ps`
to check).

> Ports are remapped from Postgres/Redis/MinIO defaults (5433/6380/9002-9003)
> in case another project's stack is already using 5432/6379/9000-9001 on
> your machine — see `.env.example` for the full list and `docker-compose.yml`.

### Try the auth endpoints

```bash
curl -X POST http://localhost:4000/api/v1/auth/otp/request \
  -H 'Content-Type: application/json' -d '{"phone":"+919876543210"}'
# {"status":"sent"} — the OTP is logged to the API console (ConsoleSmsProvider stub)

curl -X POST http://localhost:4000/api/v1/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+919876543210","otp":"<from the console log>","deviceId":"my-device"}'
# {"accessToken":"...","refreshToken":"...","expiresIn":900}

curl http://localhost:4000/api/v1/auth/me -H 'Authorization: Bearer <accessToken>'
```

### Society & resident endpoints

All non-`auth` endpoints require a JWT and the relevant permission
(`society:manage`, `society:read`, `resident:manage`, `resident:read`, or
`resident:create` — see the seed table below). Every one of them is scoped by
the caller's `society_id`/`flat_id` (from their JWT, not from the URL) —
see `apps/api/src/common/tenant-scope/tenant-scope.util.ts`.

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/societies` | Super Admin/Company Admin only |
| GET | `/societies/{id}` | |
| PATCH | `/societies/{id}/settings` | billing cycle, late fee %, fiscal year start, feature flags |
| GET | `/societies/{id}/flats` | |
| POST | `/societies/{id}/flats/bulk-import` | multipart CSV upload (`file` field); row-level errors, doesn't fail the whole batch |
| POST | `/societies/{id}/amenities` | |
| POST | `/societies/{id}/documents` | accepts a `fileUrl` (assumes upload to S3/MinIO happened separately — Module 21 will add the broker) |
| POST | `/flats/{id}/residents` | also the access-delegation entry point — `relationType: "tenant"` + `leaseStart`/`leaseEnd` invites a tenant |
| POST | `/residents/{id}/vehicles` | |
| POST | `/residents/{id}/pets` | |
| POST | `/residents/{id}/documents` | |
| POST | `/flats/{id}/move-out` | blocked if `duesCleared: false` unless `override: true` + `overrideReason` |
| GET | `/societies/{id}/residents?filter=senior_citizen` | |

### Visitor & security-guard endpoints

QR passes are HMAC-signed (`@nestjs/jwt`, HS256, `QR_TOKEN_SECRET`) — same
signing library as auth's RS256 tokens, different algorithm/secret since
guards only need to verify, not issue. A visit's pending-approval sweep
(auto-escalation to a second contact after `VISIT_ESCALATION_WINDOW_SECONDS`,
default 300s) runs as a side effect of `GET /guard/dashboard` — the guard
kiosk must poll that endpoint (default every `GUARD_DASHBOARD_POLL_INTERVAL_SECONDS`,
15s) for escalation to actually fire in near-real-time; nothing else triggers it.

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/visits/walk-in` | blacklist checked synchronously before the pending row is even created |
| POST | `/visits/{id}/approve` | blacklist re-checked here too (could've been added after walk-in); issues the QR pass |
| POST | `/visits/{id}/reject` | |
| POST | `/guest-invites` | resident-initiated; `recurrenceRule` present = multi-use, absent = single-use |
| GET | `/guest-invites/{token}` | Public — validates without consuming (consumption happens at gate check-in) |
| GET | `/flats/{id}/visits/history` | |
| POST | `/guard/login` | Public — reuses the OTP flow, not a second PIN scheme; `gateId` is the explicit gate-switch |
| GET | `/guard/dashboard` | pending visits, active alerts, today's counts — **and** the escalation-sweep trigger |
| GET | `/guard/shift-report` | computed on read (upserts `shift_reports`), no cron dependency |
| POST | `/gate/scan` | QR check-in/out; gate-scoped (a guard can only scan at their logged-in gate) |
| POST | `/gate/manual-entry` | fallback, requires `overrideReason`; accepts `idempotencyKey`/`occurredAtClientReported` for offline-sync replay |
| POST | `/gate/call-resident` | logs a call-initiated event via the NotificationProvider stub — no real VoIP |
| POST | `/emergency-alerts` | |
| POST | `/emergency-alerts/{id}/resolve` | `resolutionNote` required — enforced by the DTO **and** a DB CHECK constraint |

### Guard desktop offline sync

`apps/desktop/src/main/offline-queue.ts` + `sync.ts`: gate check-ins/manual
entries queue locally (SQLite) when the API is unreachable, each stamped with
an `idempotencyKey` (generated at enqueue time, not sync time) and the
kiosk's own `occurredAtClientReported`. On reconnect, `syncQueue()` replays
the queue strictly in local order via real `fetch()` calls to
`/gate/manual-entry`, stopping at the first failure so nothing is ever
applied out of order; a retried sync reuses the same idempotency key, so a
partial-sync-then-resume never double-logs a `gate_logs` row (enforced by a
unique index on `gate_logs(idempotency_key, occurred_at)`).

### Delivery management endpoints

Module 6 (§6). `delivery_agents` is a lightweight, phone-keyed, high-churn
directory — same shape and no-RLS posture as `visitors` (agents aren't
tenant data; the same courier shows up across many societies). `deliveries`
is fully RLS-protected, using the same `NULLIF(...)::UUID`-safe policy
pattern the RLS-enforcement session fixed everywhere else.

Handover uses its own purpose-scoped OTP — hashed (`sha256`), 10-minute
expiry, 3-attempt lockout — stored on the `deliveries` row itself, not the
login `otp_requests` table (a delivery handover code and an auth code are
different concerns with different lifetimes and callers). The guard-facing
API only ever returns `{ verified: boolean }`: never the code, and never
*why* a verification failed (expired, wrong, and locked-out all look
identical to the guard, matching §6's "guard sees a boolean, not the code"
requirement literally, including for the failure path). `handed_over`
requires either a verified OTP or an explicit `overrideReason` (elderly /
no-smartphone residents) — never silently accepted with neither.

Arrival logging reuses `GateService.writeGateLog()` (now `public`,
previously module-private) rather than a second gate-activity write path,
so `gate_logs` reporting never has to know deliveries exist as a separate
concern from visitor check-ins. `GuardDashboard`'s response gained a
`pendingDeliveries` array alongside pending visitor approvals, resolved via
a direct `Delivery` repository injection in `GuardService` (not a
`DeliveryModule` import — `SecurityGuardModule` doesn't depend on
`DeliveryModule` in either direction, avoiding a circular module edge).

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/deliveries` | `delivery:manage`; guard logs an agent arrival; idempotent on `idempotencyKey` |
| POST | `/deliveries/{id}/otp/verify` | `delivery:manage`; returns `{verified: boolean}` only, idempotent once verified |
| PATCH | `/deliveries/{id}/status` | `delivery:manage`; `status`/`heldAtDesk`/`overrideReason` independently settable |
| GET | `/flats/{id}/deliveries` | `delivery:read`; `?status=pending` filter; flat-scoped ABAC, same as every other module |

### Billing & audit endpoints

Bill generation is Admin/Manager/Accountant-only (`billing:manage`); Owners/
Tenants get `billing:read` + `billing:pay`, ABAC-narrowed to their own flat
the same way as resident/visitor. `POST /bills/generate` is idempotent —
`UNIQUE(flat_id, billing_period)` means running it twice for the same period
returns the existing bills, never duplicates. Late fees are computed
server-side only, from `billing_plans.late_fee_pct` — no endpoint accepts a
client-supplied late fee amount. The payment gateway is a stub
(`StubPaymentGatewayProvider`, same interface-stub pattern as
`SmsProvider`/`NotificationProvider` — no real Razorpay account/credentials
exist) that simulates Razorpay's real webhook scheme: HMAC-SHA256 over the
raw request body, hex-encoded (`PAYMENT_GATEWAY_WEBHOOK_SECRET`). The webhook
handler is atomic and idempotent under genuine concurrency, not just
sequential replay — the pending→success transition is a single
`UPDATE ... WHERE gateway_ref = $1 AND status = 'pending' RETURNING *`, and
the status flip + ledger post + receipt creation + audit log all commit in
one transaction (see `webhook.service.ts`). `ledger_entries` is append-only
in practice — corrections are new reversing rows (`reversesEntryId` set),
never `UPDATE`s to a posted entry — and `audit_logs` is append-only at the DB
grant level (`UPDATE`/`DELETE` revoked from the app write role in the
migration itself, not just convention).

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/billing-plans` | `billing:manage` |
| POST | `/bills/generate` | `billing:manage`; idempotent on `(flat_id, billing_period)` |
| GET | `/flats/{id}/bills` | `billing:read`; triggers the overdue-sweep late-fee pass as a side effect |
| POST | `/bills/{id}/pay` | `billing:pay`; returns a gateway session (`gatewayRef`, `checkoutUrl`) |
| POST | `/bills/{id}/record-offline-payment` | `billing:manage`; cash/cheque/bank-transfer, `reconciled: false` by default |
| POST | `/webhooks/payment-gateway` | Public, HMAC-verified (`X-Gateway-Signature`); idempotent on `gateway_ref` under both sequential replay and genuine concurrency |
| GET | `/reports/financial-summary` | `billing:read`; collection efficiency + outstanding aging, tenant-scoped like every other report |
| GET | `/audit-logs` | `audit:read` — Admin/Committee only |
| GET | `/audit-logs/export` | `audit:read` |

### Domestic staff, complaint, and notice-board endpoints

`domestic_staff` is a global directory keyed by phone, same pattern as
`visitors` — one maid can work across multiple societies on this platform;
per-society/per-flat assignment lives entirely in `staff_flat_mapping`.
Owner/Tenant hold `domestic-staff:manage` ABAC-narrowed to their own flat
(onboard staff, manage the mapping, upload a police-verification doc), but
police-verification **read** access — and the ability to set verification
status — is additionally gated by an explicit society-wide-scope check
inside `DomesticStaffService`, not just the permission: an Owner holding
`:manage` still can't reach it, "not even the flat the staff serves." Every
access to the document (read, write, or status change) writes an
`audit_logs` row, the same `is_sensitive`-document posture §21 describes.
`staff_attendance` is partitioned by month (`PARTITION BY RANGE (date)`) per
the SRS's own partitioning list; check-in is idempotent on
`(staff_id, flat_id, date)`.

Complaints: priority (not category) drives the SLA — `sla_due_at` is
computed server-side from a fixed priority→hours map (`urgent`=4h,
`high`=24h, `medium`=72h, `low`=168h); no endpoint accepts a client-supplied
due date. `is_internal` comments are filtered at the field level, not the
row level — the complaint stays visible to a resident-scoped caller, only
`is_internal` comment rows are excluded from their response, and a
flat-pinned caller's `isInternal: true` in the request body is always
overridden to `false` server-side. SLA-breach escalation has two triggers:
a real `@nestjs/schedule` `@Cron` job (`complaint-sla-escalation-sweep`,
every 5 minutes, independent of any HTTP request — this codebase's first
genuine background cron) plus a read-triggered sweep on `GET /complaints`
for immediacy when someone's already looking, both sharing the same
idempotent `escalateOverdueComplaints` (gated by a `complaint_escalations`
row existing per complaint, `UNIQUE(complaint_id)` at the DB level).

Notices: `target_audience` (`all`/`tower_ids`/`role`) is resolved to a
concrete recipient list **once**, at creation, and stored in
`resolved_recipient_user_ids` — a later tower deletion or role reassignment
never changes what an already-published notice's read-report says. Read
receipts are idempotent on `(notice_id, user_id)`.

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/staff` | `domestic-staff:manage`; find-or-create by phone (global directory) |
| POST | `/staff/{id}/flat-mapping` | `domestic-staff:manage` |
| PATCH | `/staff/flat-mapping/{mappingId}/deactivate` | `domestic-staff:manage` |
| GET | `/flats/{id}/staff` | `domestic-staff:read`; police-verification fields never appear here |
| POST | `/staff/attendance/check-in` | `domestic-staff:manage`; idempotent per `(staff_id, flat_id, date)` |
| POST | `/staff/attendance/check-out` | `domestic-staff:manage` |
| GET | `/flats/{id}/staff/attendance-summary` | `domestic-staff:read`; `?month=YYYY-MM-01` |
| POST | `/staff/leave-requests` | `domestic-staff:manage` |
| PATCH | `/staff/leave-requests/{id}/approve` | `domestic-staff:manage` |
| PATCH | `/staff/{id}/police-verification-document` | `domestic-staff:manage` **+** society-wide scope only; audited |
| PATCH | `/staff/{id}/police-verification-status` | `domestic-staff:manage` **+** society-wide scope only; audited |
| GET | `/staff/{id}/police-verification-document` | `domestic-staff:manage` **+** society-wide scope only; audited on every read |
| POST | `/complaint-categories` | `complaint:manage` |
| POST | `/complaints` | `complaint:create`; `sla_due_at` computed server-side from priority |
| GET | `/complaints` | `complaint:read`; `?status=&categoryId=&flatId=`; triggers the read-side escalation sweep |
| PATCH | `/complaints/{id}/assign` | `complaint:manage` |
| PATCH | `/complaints/{id}/status` | `complaint:manage` |
| POST | `/complaints/{id}/comments` | `complaint:comment`; `isInternal` forced `false` for flat-pinned callers |
| GET | `/complaints/{id}/comments` | `complaint:read`; `is_internal` rows filtered for flat-pinned callers |
| POST | `/complaints/{id}/feedback` | `complaint:comment`; only valid once `status = resolved` |
| POST | `/notices` | `notice-board:manage`; resolves + snapshots the recipient list |
| GET | `/societies/{id}/notices` | `notice-board:read`; flat-pinned callers see only notices targeting them |
| POST | `/notices/{id}/read` | `notice-board:read`; idempotent per `(notice_id, user_id)` |
| GET | `/notices/{id}/read-report` | `notice-board:manage` |

### Parking, amenity booking, and inventory endpoints

Amenity booking's double-booking prevention is a **DB-level guarantee**, not
an application check: `amenity_bookings.slot` is a `TSTZRANGE`, and
`EXCLUDE USING gist (amenity_id WITH =, slot WITH &&) WHERE (status =
'confirmed')` (§10.3's exact pattern, `btree_gist` enabled in the migration)
makes two overlapping confirmed bookings for the same amenity physically
impossible to both commit, no matter how many requests race for the same
slot concurrently. The service still runs an application-layer pre-check
(rule validation, a friendly error for the common non-racing case), but the
constraint is what's actually enforced under real concurrency — proven by
firing 10 genuinely concurrent (`Promise.all`) booking requests for the same
overlapping window: exactly one gets `201`, the other nine get `409`, every
time. `POST /amenities/{id}/bookings` requires an `Idempotency-Key` header
(§11.1) stored directly as `amenity_bookings.idempotency_key` (`UNIQUE`) —
the same natural-constraint idempotency pattern as everywhere else in this
codebase, not a generic response cache.

The insert's error handling distinguishes two named constraints by Postgres
SQLSTATE code, not just "any DB error means conflict": `23505`
(`unique_violation`) on `uq_amenity_bookings_idempotency_key` means a
client retried the exact same request — replay the original booking, not
an error. `23P01` (`exclusion_violation`, a genuinely different SQLSTATE)
means this request lost the double-booking race — a real `409`. Anything
else (wrong constraint, FK violation, connection error) is rethrown
unchanged and surfaces as a real `500`, never silently folded into either
case. Cancellation (`DELETE /amenity-bookings/{id}`) is a status change to
`cancelled`, not a row delete — the row falls out of the exclusion
constraint's `WHERE status = 'confirmed'` clause, freeing the slot for a
new booking without ever losing the booking history.

Visitor-parking allocation rides on the *existing* gate check-in/check-out
flow (`GateService.scan()`) rather than a separate endpoint — a guard's
`gate:scan` permission is what authorizes it, not a new parking permission.
`parking_slots.is_visitor_pool` marks which slots the pool draws from, so a
resident's own allocated slot can never accidentally get handed to a
visitor. Inventory has no resident-facing surface at all — Owner/Tenant
hold neither `inventory:manage` nor `inventory:read`, so purchase-cost
visibility (§15: "Accountant/Committee/Admin... not general residents") is
enforced by the permission grant itself, the same grant-shaped pattern as
billing, not a field-filtering mechanism.

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/parking/slots` | `parking:manage` |
| POST | `/parking/allocations` | `parking:manage`; one active allocation per slot (partial unique index) |
| PATCH | `/parking/allocations/{id}/end` | `parking:manage` |
| GET | `/societies/{id}/parking/availability` | `parking:read` |
| POST | `/parking/violations` | `parking:read`; photo required |
| PATCH | `/parking/violations/{id}/resolve` | `parking:manage` — Admin/Committee only, per §10's Security note |
| POST | `/amenity-booking-rules` | `amenity-booking:manage` |
| GET | `/amenities/{id}/availability` | `amenity-booking:read`; `?date=YYYY-MM-DD` |
| POST | `/amenities/{id}/bookings` | `amenity-booking:book`; `Idempotency-Key` header required; DB exclusion constraint is the real guarantee |
| DELETE | `/amenity-bookings/{id}` | `amenity-booking:book`; status change to `cancelled`, not a row delete |
| POST | `/assets` | `inventory:manage` |
| POST | `/assets/{id}/maintenance-log` | `inventory:manage` |
| GET | `/societies/{id}/assets` | `inventory:read`; `?category=` — Owner/Tenant hold neither permission, no resident-facing path exists |
| GET | `/assets/{id}/warranty-alerts` | `inventory:read` |

### Notification providers (push & SMS)

`NotificationProvider` (push/in-app) and `SmsProvider` (OTP + visitor-approval
fallback) are both interface-stub pattern — see billing's `PaymentGatewayProvider`
above for the precedent. Push is real: `NotificationModule` binds
`NOTIFICATION_PROVIDER` to `FcmNotificationProvider` (Firebase Cloud Messaging,
via the `firebase-admin` SDK's modular API) whenever `FIREBASE_PROJECT_ID` /
`FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` are all set in env; with any of
them empty (the default), it falls back to `ConsoleNotificationProvider`
(logs only) — a pure config change, no code change, switches a deployment
between the two. `SmsProvider` stays on `ConsoleSmsProvider` indefinitely: no
free-tier SMS/OTP gateway exists that doesn't require a billing relationship,
so OTP delivery is console-logged in every environment this repo currently
targets.

Push delivery resolves the recipient's `device_tokens` and sends to each
registered device individually (not a batched multicast call), so one dead
token's failure can't obscure delivery to a user's other devices. Per-token
FCM failures are classified by error code: `messaging/registration-token-not-registered`,
`messaging/invalid-registration-token`, and `messaging/invalid-argument` mean
the token is dead — it's pruned (`deleted_at` set, never hard-deleted, same
convention as `refresh_tokens.revoked_at`). Anything else (rate limit, quota,
network) is transient — logged as an error, not thrown into the caller and
not pruned, since the token might still be good on retry. Either way, a push
failure never fails the request that triggered it (a visitor approval, a
bill-overdue sweep, a complaint status change).

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/users/me/device-tokens` | Any authenticated user; idempotent on `(user_id, token)`; no permission check — matches `/auth/me`'s posture of managing your own record |

Getting FCM push live locally requires a free Firebase project and a
service-account key (Firebase Console → Project Settings → Service Accounts →
Generate new private key), with the three fields from the downloaded JSON
(`project_id`, `client_email`, `private_key`) set as `FIREBASE_PROJECT_ID` /
`FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` in `.env` — no paid tier is
involved. Leave them unset to stay on console-logging.

### Other apps

```bash
pnpm --filter @nestora/web dev       # Next.js, http://localhost:3000
pnpm --filter @nestora/desktop dev   # Electron guard-kiosk shell
```

## Monorepo layout

```
apps/
  web/          Next.js 14 (App Router, TS, Tailwind) — resident/admin portal
  desktop/      Electron + React — guard-kiosk, offline SQLite queue
  api/          NestJS — modular monolith, one module per SRS §6 domain module
packages/
  ui/           Shared React component library (empty scaffold)
  types/        Shared DTO/TypeScript types (empty scaffold)
  config/       Shared eslint/tsconfig/prettier config (populated)
  utils/        Shared pure-function utilities (empty scaffold)
infra/
  terraform/    VPC/RDS/S3/Secrets Manager baseline (structure only, not applied)
```

## Backend: migrations, seeding, tests

All commands below run from `apps/api/`.

| Command | What it does |
|---|---|
| `pnpm run migration:run` | Applies pending TypeORM migrations |
| `pnpm run migration:revert` | Rolls back the last migration |
| `pnpm run seed` | Idempotent — seeds the SRS §5.2 roles catalog (14 roles) + permissions (`auth:manage`, `society:manage`, `society:read`, `resident:manage`, `resident:read`, `resident:create`, `visitor:manage`, `visitor:read`, `visitor:approve`, `security-guard:manage`, `gate:scan`, `gate:checkin`, `emergency:raise`, `delivery:manage`, `delivery:read`, `billing:manage`, `billing:read`, `billing:pay`, `audit:read`, `domestic-staff:manage`, `domestic-staff:read`, `complaint:manage`, `complaint:read`, `complaint:create`, `complaint:comment`, `notice-board:manage`, `notice-board:read`, `parking:manage`, `parking:read`, `amenity-booking:manage`, `amenity-booking:read`, `amenity-booking:book`, `inventory:manage`, `inventory:read`) + role_permissions per §5.3. Safe to re-run; additive only (doesn't prune stale grants — see `apps/api/src/database/seeds/roles.seed-data.ts` for the current role→permission table). |
| `pnpm run test` | Unit tests (Jest, mocked repositories — no DB needed) |
| `pnpm run test:e2e` | Integration tests against a real Postgres — see below |
| `pnpm run keys:generate` | Generates a local dev RS256 JWT keypair into `apps/api/keys/` (gitignored) |

### Running integration tests

`test:e2e` needs its own database so it never touches dev data:

```bash
docker exec nestora-postgres-1 psql -U nestora -d society_dev -c "CREATE DATABASE society_test;"
MIGRATION_DATABASE_URL=postgres://nestora:nestora@localhost:5433/society_test pnpm run migration:run
pnpm run test:e2e
```

`apps/api/test/env.setup.ts` points the test run at `society_test` (same
Postgres instance as dev, different database — no new port needed) and Redis
DB index 1, so rate-limiter keys don't collide with manual testing. In CI,
`DATABASE_URL`/`REDIS_URL` are supplied by the GitHub Actions service
containers instead (see `.github/workflows/ci.yml`) and take precedence.

Tests never grab repositories off the running app for fixture setup or
verification (`test/admin-datasource.ts` instead — see below) — the app's
own repositories are request-scoped and RLS-restricted now, same as
production; there's no HTTP request for `beforeAll()` to piggyback on.

## Tenant isolation (RLS)

Two Postgres roles, two purposes, deliberately never conflated:

| Role | Env var | Used by | RLS applies? |
|---|---|---|---|
| `nestora` (owner) | `MIGRATION_DATABASE_URL` | `pnpm run migration:run`/`seed`, and `test/admin-datasource.ts`'s fixture setup/verification | No — table owner, RLS never applies regardless of policy |
| `app_write_role` (non-owner) | `DATABASE_URL` | The running API, in every environment, and every e2e test's actual HTTP requests | **Yes** |

`app_write_role` is created once, automatically, by
`infra/postgres-init/01-app-write-role.sql` on a fresh `docker compose up`
(an already-initialized volume needs it run manually — see that file's own
comment for the one-liner). Table-level `GRANT`s (full CRUD, except
`audit_logs` which is `SELECT, INSERT` only — §10.3's insert-only
requirement) live in migration `1700000000019-AppWriteRoleGrants.ts`, via
`ALTER DEFAULT PRIVILEGES` so any table a *future* migration creates is
covered automatically, no follow-up grants migration needed per module.

Every `tenant_isolation` RLS policy checks three Postgres session variables
the app sets per request — `app.current_society_id`, `app.is_platform_scope`,
`app.current_user_id` — via `TenantConnectionService`
(`apps/api/src/common/tenant-connection/`), which every `@InjectRepository()`
in the app is transparently routed through
(`TenantScopedTypeOrmModule.forFeature()`, a drop-in replacement for
`TypeOrmModule.forFeature()` used in every module — no service-level code
changes needed for this to apply). One real Postgres connection/transaction
is held for the lifetime of each request specifically so a `SET LOCAL`-style
session variable set at the start is still visible to every query later in
that same request, despite connection pooling.

This has two real, worth-knowing consequences:
- **Throughput**: nearly every controller/service in the app becomes
  request-scoped (Nest propagates scope transitively through anything that
  depends on a request-scoped provider), meaning a fresh DI sub-tree + a real
  DB transaction per request, even for a single-row read — a deliberate
  tradeoff for RLS actually being enforced rather than structurally
  bypassed. Nest's "durable providers" feature exists specifically to reduce
  this cost; adopting it is future work.
- **A singleton (e.g. a `@Cron` job) can't inject a request-scoped service
  directly** — see `ComplaintEscalationScheduler` for the pattern
  (`ModuleRef.resolve()` against a manually created, synthetic request
  context) any future background job needs.

`test/rls-enforcement.e2e-spec.ts` is the actual proof: connects directly as
`app_write_role`, bypassing the app/controllers/services entirely, and shows
Postgres itself refuses a cross-society read (even a raw point lookup by
known primary key) and a cross-society write (`INSERT ... violates row-level
security policy`) — not just that the application code happens to filter
correctly. See [`KNOWN_GAPS.md`](./KNOWN_GAPS.md) for the narrow, deliberate
exceptions (a user's own `user_roles`/`guards` row; three specific
system-level cross-society flows) and what's explicitly still open (a
platform-tier "see every society at once" view, not yet reproduced under
RLS).

## JWT keys

Access tokens are RS256. Locally, `pnpm run keys:generate` writes a throwaway
keypair to `apps/api/keys/` (gitignored, dev only). In staging/production the
private key is never generated by or committed to this repo — it's sourced at
container boot from AWS Secrets Manager (`nestora/{env}/jwt-signing-key`,
provisioned in `infra/terraform/secrets.tf` as a placeholder secret whose
value is set out of band).

## CI

`.github/workflows/ci.yml` runs on every PR: install → lint → typecheck →
unit tests → integration tests (Postgres/Redis as GitHub Actions service
containers, not local docker-compose) → build all three apps.
