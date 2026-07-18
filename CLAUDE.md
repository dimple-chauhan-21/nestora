# CLAUDE.md — Society Management Platform

This file is the persistent context for Claude Code on this repo. Full detail lives in
`docs/Society_Management_SRS.md` — read a specific section from there when you need depth
(e.g. the exact DDL for a table, the full permission matrix). Don't re-read the whole SRS
per prompt; this file has what you need for day-to-day implementation decisions.

## What this is

A multi-tenant Society Management Platform (MyGate/ApnaComplex-class product). Backend-first,
API serves Web (Next.js), Desktop guard-kiosk (Electron), and a future mobile app.

## Stack (do not deviate without an explicit architecture-review conversation)

| Layer | Choice |
|---|---|
| Frontend | React + Next.js (TypeScript) |
| Desktop | Electron, reusing `packages/ui` |
| Backend | NestJS (Node/TypeScript) — modular monolith, one NestJS module per domain module below |
| DB | PostgreSQL (UUID PKs, RLS enabled, partitioned high-growth tables) |
| Cache | Redis |
| Queue | RabbitMQ (events: `visitor.arrived`, `bill.generated`, `complaint.sla_breached`, etc.) |
| Storage | S3-compatible, signed URLs, separate encrypted prefix for sensitive docs |
| Auth | Custom JWT (RS256 access + rotating refresh), OTP-first login |
| Repo | Turborepo/Nx monorepo — `apps/{web,desktop,api,notification-service}`, `packages/{ui,types,config,utils}` |

## Non-negotiables — apply to every table/endpoint unless a comment explains why not

- **Every table**: UUID PK, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete). No hard deletes except the explicit DPDP-erasure path.
- **Every tenant-scoped table** carries `society_id` and has a Postgres RLS policy — never rely on application-layer scoping alone.
- **Money**: `NUMERIC(12,2)` + `currency CHAR(3) DEFAULT 'INR'`. Never `FLOAT` for money.
- **Timestamps**: `TIMESTAMPTZ`, stored UTC, rendered IST in the UI.
- **Idempotency**: any endpoint a client might retry (payments, bookings, bill generation) takes an `Idempotency-Key` header or has a natural unique constraint (e.g. `UNIQUE(flat_id, billing_period)` on bills).
- **Audit**: sensitive actions (role change, financial adjustment, ledger reversal, access to `is_sensitive` documents) must write an `audit_logs` row. That table is insert-only — no `UPDATE`/`DELETE` grant for the app DB role.
- **Migrations only** — never hand-edit schema in any environment.
- **No raw SQL string concatenation** — parameterized queries / query builder only.

## Module → code mapping

Each module below = one NestJS module at `apps/api/src/modules/<name>/`. Build in this phase order (don't jump ahead — later modules assume earlier ones exist):

1. `auth` — OTP/JWT/RBAC/ABAC (blocks everything else)
2. `society`, `resident` — society/tower/flat hierarchy, owners/tenants/family
3. `visitor`, `security-guard`, `delivery` — gate operations, **guard app must work offline** (local SQLite queue + sync)
4. `billing` — bills/payments/ledger, payment gateway webhook (signature-verified, idempotent on `gateway_ref`); pull `audit` module forward to land alongside this, not later
5. `domestic-staff`, `complaint`, `notice-board`
6. `parking`, `amenity-booking` (note: booking overlap prevention uses a Postgres `EXCLUDE USING gist` constraint, not just app-level checks), `inventory`
7. `event`, `poll` (anonymous polls: never store `voter_id` on the vote row — see SRS §13 for the eligibility-table pattern), `lost-found`
8. `water-tanker`, `electricity`, `reports`
9. `document`, then extract `notification` into its own service (`apps/notification-service`)

## Reference docs in this repo

- `docs/Society_Management_SRS.md` — full SRS (roles/permissions, all 22 modules, DB DDL, API standards, security architecture, roadmap, risks)
- `docs/Society_Management_SRS.html` — same content, browsable

## When starting a new session on a module

Tell Claude Code which module/phase you're on; it should pull the relevant module section from the SRS itself (grep the module name) rather than you pasting it in.
