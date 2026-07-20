# Known Gaps

Tracked deviations between what's implemented and what the SRS/production
posture ultimately requires. Each entry should stay here until closed — not
rediscovered at launch time.

## RLS policies exist but are not currently enforced (table-owner bypass)

**Status**: **RESOLVED** 2026-07-18 (RLS-enforcement session). Was open since
the `society`/`resident` module session (2026-07-15).

**What changed**: the API's runtime connection (`DATABASE_URL`) now uses
`app_write_role` — a non-owner, non-superuser Postgres role (created by
`infra/postgres-init/01-app-write-role.sql`, granted via migration
1700000000019) — instead of the migration-owning `nestora` role, which is
now reserved for `MIGRATION_DATABASE_URL` only (migrations, seeds). Every
`@InjectRepository()` in the app is transparently routed through a
request-scoped `TenantConnectionService` (`common/tenant-connection/`) that
holds one real connection/transaction per request and sets
`app.current_society_id`/`app.is_platform_scope`/`app.current_user_id` on it
— the session-variable mechanism SRS §10.5 always described, wired up for
real for the first time.

**The proof**: `test/rls-enforcement.e2e-spec.ts` — connects directly as
`app_write_role`, bypassing the app/controllers/services/ABAC-filter entirely,
and demonstrates Postgres itself refuses cross-society reads (even a raw
point lookup by known primary key) and cross-society writes (`INSERT`
rejected with `new row violates row-level security policy`), defaults to
zero-rows-visible when no scope is set, and correctly swaps visibility when
the same connection's scope changes mid-session. All 9 existing e2e suites
(now genuinely exercising `app_write_role` + RLS, not the owning role) and
all 65 unit tests pass unchanged — see `README.md`'s "Tenant isolation (RLS)"
section for the full mechanism writeup.

**Three narrow, deliberate exceptions, not full RLS bypasses** — each scoped
to one specific system-level (not tenant-user) flow, gated by an explicit
`app.is_platform_scope='true'` or `app.current_user_id = <self>` the app sets
only where it's actually justified:
- `user_roles` / `guards`: a user must always be able to discover their own
  row (login resolves scope from it — can't gate that lookup behind the
  scope it's about to produce).
- `payments` / `complaints` / `complaint_escalations`: three genuinely
  cross-society system flows (the payment webhook's gatewayRef lookup before
  it knows the society; the SLA-escalation cron sweep, which by design spans
  every society every 5 minutes) — see `webhook.service.ts` and
  `complaint-escalation.scheduler.ts`'s own comments.

**What's NOT covered by this fix** (tracked as its own gap below, not
silently missing): `AuditService.list()`'s "platform-tier caller sees every
society's logs in one query" behavior is not reproduced under RLS — see
"AuditService's cross-society platform view" below.

## Police-verification trust is implicitly shared across every society a domestic staff member works in

**Status**: open, flagged (not fixed) during the domestic-staff/complaint/
notice-board session (2026-07-16). Not blocking — the platform currently
has one pilot society, so this hasn't bitten anyone yet.

**What's true today**: `domestic_staff` is a global directory keyed by
phone — one maid/driver/cook can be mapped to flats across multiple,
otherwise-unrelated societies via separate `staff_flat_mapping` rows (§6
Module 7's own stated design, "prevents duplicate profiles when the same
maid works in a neighboring society"). But
`police_verification_doc_url`/`police_verification_status` live directly on
the *global* `domestic_staff` row, not on the per-society mapping.

**The gap**: if Society A's Admin uploads a police-verification document and
marks it `verified`, that status is immediately visible — via the same
`GET /staff/{id}/police-verification-document` read path — to Society B's
Admin the moment Society B maps the same staff member to one of their own
flats (this session's `DomesticStaffService.assertStaffMappedWithinScope`
check is keyed on "does *a* mapping exist in the caller's society," not "did
*this* society do the verifying"). In other words: one society's background
check is implicitly trusted by every other society that later employs the
same person through this platform, with no per-society re-verification
step, no record of *which* society uploaded/approved the document, and no
expiry tied to a specific employer relationship.

**Why this wasn't resolved this session**: §6 Module 7 doesn't say which
behavior is intended — the "global directory" edge case is framed purely as
a *profile-deduplication* convenience, and never addresses whether
verification status should travel with the profile or be re-established
per employer. Guessing an answer and building schema/workflow around it
(e.g. moving verification onto `staff_flat_mapping` instead, with a
per-mapping doc/status) is a real design decision with compliance
implications, not something to silently assume.

**To close this gap**: get an explicit product answer to "does a police
verification travel with the person, or does it belong to the society that
performed it?" If the latter (the safer default for a background-check
workflow), move `police_verification_doc_url`/`police_verification_status`
off `domestic_staff` and onto `staff_flat_mapping` (one verification per
employment relationship), and add a migration + backfill plan.

**Why this matters before scaling past a pilot**: police verification is
exactly the class of control §6 Module 7's own Security note calls out as
needing to be "restricted to Society Admin/Manager role only" — the intent
is clearly that each society controls its own trust decision about who
enters its gates. An implicit cross-society trust hand-off undermines that
control silently, and would be a hard, non-obvious thing to explain after
an incident ("Society B never verified this person — they inherited Society
A's approval without knowing it").

## SMS/OTP delivery is deferred — no real gateway wired up

**Status**: open, deliberately deferred during the notification-provider
session (2026-07-17).

**What's true today**: `SmsProvider` — used for OTP login/verification and
as the visitor-approval fallback channel — still resolves to
`ConsoleSmsProvider`, which logs the OTP/message to the API console instead
of sending it. This is unlike `NotificationProvider` (push), which this same
session swapped for a real `FcmNotificationProvider` (Firebase Cloud
Messaging) behind the identical interface-stub pattern.

**The gap**: OTP is this platform's primary login mechanism (§Auth,
`auth` module — OTP-first login). With `SmsProvider` console-only, nobody
without direct access to the API process's stdout can actually log in. That
means **real residents cannot be onboarded** — only whoever is running the
dev server locally can complete an OTP flow today.

**Why this wasn't fixed this session**: explicit project constraint — no
paid account or billing relationship on any platform, for any service, for
this task. Every legitimate SMS/OTP gateway (MSG91, Twilio, etc.) requires a
funded account before it will send a single message; there is no free tier
that sends real SMS with zero billing relationship. On top of that, Indian
SMS/OTP sending requires DLT (Distributed Ledger Technology) registration
with a telecom regulator before a gateway account can send to Indian
numbers at all — a multi-day approval process, separate from and in
addition to just creating a gateway account. Given the no-billing
constraint ruled out the account step entirely, the DLT step was never
reached. Push (FCM) was prioritized instead specifically because it has no
equivalent billing or regulatory gate.

**What's actually available right now**: `ConsoleSmsProvider` is fine for
solo dev/testing — anyone with terminal access to the running API can read
the OTP straight from the log line and complete login manually. It is not a
substitute for real delivery for anyone else.

**To close this gap**: once there's budget/appetite for a billing
relationship — (1) pick a gateway (MSG91 is the more India-focused, cheaper
option; Twilio is the more general-purpose one), (2) create and fund the
account, (3) start DLT registration in parallel immediately, since it's the
longer pole (days, not minutes) and doesn't depend on the account being
funded first, (4) once both are done, swap `SmsProvider`'s binding the same
way `NotificationProvider`'s was swapped — the interface was built for
exactly this, and `NotificationModule`'s config-gated factory pattern
(`hasFcmCredentials` → provider selection) is the template to copy for
`hasSmsCredentials`.

**Why this matters before scaling past a pilot**: this blocks real login for
literally everyone except whoever has direct access to the API server's
console — not a partial degradation, a full stop for onboarding actual
residents, owners, tenants, or guards.

## AuditService's cross-society platform view is no longer reproduced under RLS

**Status**: open, surfaced (not fixed) during the RLS-enforcement session
(2026-07-18) — a direct consequence of closing the table-owner-bypass gap
above, not a new independent bug.

**What's true today**: `AuditService.list()` — `GET /audit-logs` — has an
app-layer branch for `scope.isPlatformScope`: skip the `WHERE society_id =
...` filter entirely, returning every society's audit rows in one query. No
`?societyId=` query param exists to narrow it (unlike
`financial-report.service.ts`'s `requestedSocietyId` convention). No test
ever exercised this via a real HTTP request with a genuine `super_admin`
JWT — `isPlatformScope: true` only ever appears in unit tests with a
directly-constructed fake `TenantScope`, calling services that target one
explicit resource by ID, not this kind of "list across everything" case.

**The gap**: `audit_logs`' RLS policy (`society_id = current_setting(...)
OR (society_id IS NULL AND is_platform_scope = 'true')`) only ever
special-cases *NULL-society* rows (genuine platform-level events — company
creation, etc.) for a platform-tier caller — it does not let a platform-tier
caller see OTHER societies' *non-null-society* rows. Under real RLS
(`app_write_role`), a `super_admin` calling `GET /audit-logs` today gets
only NULL-society rows, silently narrower than the app-layer code still
tries to promise. This is a safe-direction failure (under-shows, doesn't
leak), and — because nothing tests or currently exercises a real
`super_admin` login — it's not a regression against anything that
previously worked in practice, but it is a real gap between what the code
says it does and what RLS now actually allows.

**Why this wasn't fixed this session**: SRS §10.5's own text frames
platform/company-tier cross-tenant access as needing "a bypass role" —
architecturally a *different*, dedicated mechanism from `app_write_role`
(which is deliberately NOT `BYPASSRLS`, so RLS stays real for it). Building
that — a genuine, safe, audited "see every society at once" capability — is
a bigger, separate piece of infra than this session's ask (`app_write_role`
only). Widening `audit_logs`' own policy further (e.g. `OR is_platform_scope
= 'true'` unconditionally, matching `payments`/`complaints`) was considered
and deliberately rejected: unlike those three tables (each with one
narrow, specific, already-audited system caller), `audit_logs` read access
is reachable directly from user-facing HTTP with no additional gate beyond
`audit:read` + `isPlatformScope` — widening it that way would make the
audit trail *itself* readable cross-society by anyone holding a
`super_admin`-tier JWT, which needs a real design decision (and probably
its own audit trail of who queried what), not a one-line policy copy.

**To close this gap**: implement SRS §10.5's "bypass role" properly —
likely a dedicated `app_platform_role`, used only by requests already
authenticated as `super_admin`/company-tier, with its own narrower RLS
posture (or `BYPASSRLS` if the surrounding access controls are judged
sufficient) — and add the missing `?societyId=` narrowing to
`AuditController` regardless, matching the `financial-report` convention,
so a platform caller can ALSO deliberately narrow to one society without
needing the bypass at all.

## Platform-tier HTTP requests targeting an explicit *other* society aren't RLS-scoped to it

**Status**: open, surfaced (not fixed) during the RLS-enforcement session
(2026-07-18). Currently inert — no real `super_admin` login flow is
exercised anywhere in this codebase yet (see the gap above), so nothing
today actually hits this path.

**What's true today**: `TenantConnectionService`/`TenantScopeInterceptor`
derive `app.current_society_id` purely from the CALLER's own JWT
(`request.user.societyId`). For an ordinary user this is exactly right —
their own society is the only one they should ever see. For a genuine
platform-tier caller who targets a *specific, different* society via a
route param or DTO field (e.g. an admin-triggered `POST /bills/generate`
for society X, tested today only via a unit test's directly-constructed
`PLATFORM_SCOPE` fake, never through a real HTTP request), the caller's OWN
`societyId` claim is null — so `app.current_society_id` gets set to NULL,
and RLS would block the very operation the platform caller explicitly
asked to run against society X.

**Why this wasn't fixed this session**: same reasoning as the gap above —
no real `super_admin` HTTP flow exists to be broken by this yet, and the
correct fix (letting SOME endpoints override the RLS scope to an
explicitly-named target society, only for callers whose role is actually
entitled to name one) is a real authorization design decision, not a
one-line change to `TenantConnectionService`.

**To close this gap**: once genuine platform-tier flows exist, extend
`TenantScope`/`TenantConnectionService.applyScope()` to accept an
explicit target-society override for the specific endpoints that need it
(the DTO/route-param society id), validated against the caller's actual
platform-tier entitlement — not a blanket "trust any request body's
societyId," which would reintroduce exactly the leakage RLS exists to
prevent.

## Document/photo fields across every module are unvalidated client-supplied URLs, not real uploads

**Status**: open, surfaced (partially mitigated, not closed) during the
security-review session (2026-07-19).

**What's true today**: every "document" or "photo" field in the API —
resident documents, society documents, complaint attachments, notice-board
attachments, visitor/delivery photos, parking-violation photos,
domestic-staff police-verification documents — is a plain `fileUrl`/
`photoUrl` string field on its DTO, validated at most with `@IsUrl()` (this
session tightened two DTOs — `complaint`'s attachment `fileUrl` and
`notice-board`'s `attachmentUrls` — that had regressed to bare `@IsString()`,
accepting literally any text). There is exactly ONE real multipart file
upload in the entire codebase: `POST /societies/{id}/flats/bulk-import`
(Multer, memory storage), which this session also fixed — it previously had
no MIME allow-list or size cap at all (see
`common/upload/file-validation.util.ts`, applied in
`society.controller.ts`, proven by `test/society-bulk-import.e2e-spec.ts`).

**The gap**: SRS §12's File Upload Validation row ("type allow-list...
server-side re-validation of magic bytes... antivirus scan hook") describes
validating file *content*. For every field above except the one CSV import,
the API never receives file bytes at all — there's no presigned-URL-issuance
endpoint, no proxied-upload endpoint, nothing. The client is trusted to have
uploaded the file *somewhere* (S3, presumably, per CLAUDE.md's stack table)
and simply hands the API a URL string. That means real MIME/size/magic-byte
validation is structurally impossible today for police-verification docs,
resident/society documents, complaint/notice attachments, and visitor/
delivery photos — not because it was skipped, but because the upload path
those fields assume doesn't exist yet.

**Why this wasn't fixed this session**: building it is a real feature
(either a presigned-URL-issuance endpoint with a required confirm-step that
HEAD-checks content-type/size before the URL is accepted into any DTO, or a
proxied-through-API upload like `bulk-import`'s), not a validation tweak —
and it's a genuine architecture decision (direct-to-S3 presigned vs.
proxied) the SRS doesn't pick for me. Applying `@IsUrl()` further (e.g.
restricting to expected extensions in the path) was considered and rejected
as security theater: a URL's extension has no relationship to what's
actually served at that address.

**To close this gap**: pick the upload architecture (presigned-URL vs.
proxied), build the one real upload endpoint it implies, and have every
`fileUrl`/`photoUrl` DTO field accept only URLs issued by that flow (not any
externally-supplied URL) — at which point real MIME/size validation
(`buildUploadOptions` in `common/upload/file-validation.util.ts` is already
reusable for this) and, per SRS §12, an antivirus scan hook (ClamAV) become
possible. Until then, treat every stored `fileUrl` as an untrusted external
link when it's ever served back to another user — never render it inline
without the browser's own sandboxing, and never let server-side code fetch
it (SSRF risk if that's ever added).

## Dependency vulnerabilities not fixed this session (deferred, with reason)

**Status**: open, triaged during the security-review session (2026-07-19),
re-audited during the dependency-follow-up session (2026-07-20) after the
Node/pnpm version-control fixes. `pnpm audit` history: 54 findings (17 high)
→ 44 (12 high) after the security-review session → **39 (9 high, 0
critical)** after this session. See below for what was fixed vs.
deliberately left open, and `.github/dependabot.yml` + the repo's
"Dependabot security updates"/vulnerability-alerts settings (both
confirmed actually enabled this session, not just the yaml file existing).

**Fixed the security-review session** (pnpm-workspace.yaml `overrides`,
same-major-line patch/minor bumps, verified via full unit+e2e re-run):
`multer` 2.0.2→2.2.0 (5 HIGH DoS advisories — directly relevant, this is
the package behind the one real upload endpoint that session touched),
`lodash` →^4.17.24 (1 HIGH code-injection + 2 MODERATE
prototype-pollution, via `@nestjs/config`), `qs` →^6.15.2 (1 MODERATE DoS,
via `body-parser`/`express`), `uuid` →^11.1.1 (1 MODERATE buffer-bounds
issue, via `@nestjs/typeorm`/`@nestjs/schedule`/`firebase-admin`'s
dependency chain).

**Fixed this session** (same `overrides` pattern, all three transitive via
`@nestjs/cli`, a devDependency never bundled into the running API — patch
bumps within the same major line, verified via full unit+e2e re-run):
`glob` →^10.5.0 (1 HIGH — command injection via `-c`/`--cmd` executing
matches with `shell:true`, in the CLI's own glob tool, not reachable from
any HTTP request), `picomatch` →^4.0.4 (1 HIGH ReDoS via extglob
quantifiers + 1 MODERATE POSIX-class method injection, transitive via
`@angular-devkit`), `tmp` →^0.2.6 (1 HIGH path traversal via unsanitized
prefix/postfix enabling directory escape + 1 LOW symlink-based arbitrary
write, transitive via `@nestjs/cli`'s interactive-prompt dependency
`external-editor`). Total: 44→39 findings, HIGH 12→9.

**Remaining 9 HIGH, all in already-identified Phase-0-scaffold direct
dependencies, deliberately NOT bumped — both require a major version and
could break real functionality**:
- **`next` (5 HIGH: DoS via Server Components ×3, SSRF via WebSocket
  upgrades, Middleware/Proxy i18n bypass — plus 7 MODERATE, 2 LOW)**:
  14.2.35 → needs ≥15.5.16, a 14→15 major bump (App Router/config-format
  changes are common breakage points). `apps/web` is still Phase-0
  scaffold (CLAUDE.md's module order — not yet reached), so nothing is
  deployed for these to affect yet, but bump before any real frontend work
  starts on it, not silently as a side-effect of an unrelated session.
- **`electron` (4 HIGH: use-after-free in offscreen paint callback,
  fullscreen/pointer-lock/keyboard-lock permission callbacks, and
  PowerMonitor; plus a command-line-switch injection — plus 10 MODERATE, 4
  LOW)**: 33.4.11 → needs ≥38.8.6/39.8.1 depending on the specific CVE, a
  33→39 major bump spanning 6 major versions. `apps/desktop` is still
  Phase-0 scaffold, no shipped kiosk build exists yet — same reasoning,
  bump before packaging it for real use, not as a drive-by here.

**Also still deliberately open** (both MODERATE, both require a NestJS
v10→v11 major migration or an unrelated-major bump — same reasoning as
before, unchanged this session):
- **`@nestjs/core`** (GHSA-36xv-jgw5-4q75, patched only in `>=11.1.18` —
  this repo runs the entire `@nestjs/*` v10.x line).
- **`file-type`** (transitive via `@nestjs/common`, patched version is a
  major bump 20.x→21.x, for a package this codebase never calls directly).
- **`ajv`/`webpack`** (MODERATE/LOW, transitive via `@nestjs/cli`'s Angular
  DevKit chain — devDependency-only, same posture as the three fixed this
  session, but their available fixes require a major bump of
  `@angular-devkit`/`@nestjs/schematics` rather than a same-line patch, so
  left open rather than risking the CLI's build tooling).
- **`postcss`** (MODERATE, transitive via `next`>`postcss` — same-family
  fix would follow whenever `next` itself is bumped, not separately).

**Remaining total after this session's fixes**: 39 findings — 0 critical,
9 high (all `next`/`electron`, both already-tracked Phase-0-scaffold
majors above), 22 moderate, 8 low. Zero of the remaining findings are in
a runtime dependency of `apps/api` that executes in a real request path —
`@nestjs/core`/`file-type` are the closest (both MODERATE, both genuinely
in the API's dependency tree), everything else is either devDependency
build tooling or an unshipped scaffold app.

**Dependabot, confirmed actually working end-to-end this session, not
just "the yaml exists"**: `.github/dependabot.yml`'s `directory: "/"`
entries have no explicit `target-branch`, so they default to the repo's
real default branch — confirmed via the GitHub API (`default_branch:
"main"`), which matches. The repo-level "Dependabot security updates" and
"Dependabot alerts" toggles were confirmed OFF (`security_and_analysis.
dependabot_security_updates.status: "disabled"`, `vulnerability-alerts`
endpoint 404) despite the yaml file existing — a real gap between "a
config file exists" and "GitHub will actually act on it" — both enabled
via the API this session (`PUT .../vulnerability-alerts`,
`PUT .../automated-security-fixes`, both `204`, re-verified `enabled`
afterward). Scheduled version-update PRs (from `dependabot.yml`) and
advisory-driven security PRs (from the now-enabled toggle) will both
target `main` going forward.

**To close the rest of this gap**: schedule the NestJS v10→v11 migration
as its own tracked piece of work (not a drive-by fix); bump `next` and
`electron` to their patched majors as their own tracked pieces of work
before either app leaves Phase-0 scaffold status, verifying each
separately rather than bundling both major bumps together. Re-run `pnpm
audit` at that point rather than trusting these exact numbers, since
Dependabot will have already moved some of them on its own by then.

## No encryption at rest anywhere — neither for file storage nor sensitive PII columns

**Status**: open, surfaced during the security-review session (2026-07-19).
Pre-production blocker per SRS §12's own Encryption row ("AES-256 at rest
for S3 buckets; envelope encryption (KMS-backed) for specific sensitive
columns"), neither half of which exists today.

**What's true today, verified directly**:
- **File storage**: `docker-compose.yml` provisions a local MinIO container
  (`S3_ENDPOINT`/`S3_BUCKET` are defined in `.env.example`) but grep across
  the entire API source turns up zero S3/MinIO client code (no
  `@aws-sdk/*` dependency, no `S3Client`, nothing) — confirms the finding
  from the "document/photo fields are unvalidated client-supplied URLs" gap
  above: the API never receives or stores file bytes for anything except
  the one CSV bulk-import, which is parsed in memory and discarded, never
  written to any storage at all. There is currently no file storage
  integration for encryption-at-rest to apply *to*. The MinIO container
  itself, as provisioned, has no SSE/KMS configured either (no
  `MINIO_KMS_*` env vars) — even if wired up today, local dev storage would
  be unencrypted.
- **Sensitive PII columns**: the `pgcrypto` Postgres extension is enabled
  (`CREATE EXTENSION IF NOT EXISTS pgcrypto;`, migration
  `1700000000001-BaselineTenancy.ts`) but never actually used anywhere — no
  `pgp_sym_encrypt`/`pgp_sym_decrypt` call exists in any migration or
  service. `visitors.id_proof_number` and `visitor_blacklist.id_proof_number`
  (exactly the column SRS §12 names as needing envelope encryption) are
  plain `varchar`, stored and returned in plaintext today.

**Why this wasn't fixed this session**: both halves are real infrastructure/
architecture work, not an app-code patch. Real file encryption-at-rest needs
an actual S3 (or MinIO-with-SSE) integration to exist first — which doesn't,
per the gap above — before encryption is even a meaningful next step.
Column-level envelope encryption (KMS-backed, per SRS §12) is a genuine
feature: it needs a KMS/Secrets-Manager integration for key material, a
decision on which columns qualify as "sensitive" beyond the one named
example, and a migration/backfill plan for existing plaintext rows —
implementing that hastily inside a security-review session risks getting
the actual cryptography wrong, which is worse than leaving it plaintext and
clearly flagged.

**To close this gap**: (1) build the real upload architecture from the gap
above first — S3 (prod) or MinIO-with-SSE (dev/self-hosted) — so file
bytes actually pass through the API and land somewhere with SSE-S3 or
SSE-KMS enabled on the bucket; (2) pick a KMS provider (AWS Secrets
Manager/KMS, per CLAUDE.md's stack table) and wire envelope encryption for
`id_proof_number` and any other column that ends up on the sensitive list,
using `pgcrypto` (already enabled) or application-layer encrypt-before-write
— either way, ADD it deliberately, don't rely on the extension merely being
present. Until both exist, treat this platform's current data-at-rest
posture as "whatever the underlying Postgres/disk provider's own default
is" (e.g. RDS's default encryption, if that's the eventual host) — not as
anything this application does for itself.

## No version control existed from Phase 0 through the security-review session

**Status**: **RESOLVED** 2026-07-19 (version-control session, immediately
following the security-review session). Severity: **critical**. Open,
undetected, since Phase 0 (2026-07-14) — 14+ build sessions and the entire
codebase existed only on one local machine's filesystem, with no `.git`
directory at any point, until this session.

**What was true until this session**: `git status` at the start of this
session returned `fatal: not a git repository (or any of the parent
directories): .git` — confirmed via `find` at multiple depths that no
`.git` directory existed anywhere in the project tree. Every prior session's
work (auth, society/resident, visitor/security-guard, billing/audit,
domestic-staff/complaint/notice-board, parking/amenity-booking/inventory,
notification, the RLS-enforcement fix, delivery, and the security review
itself) had been building on an entirely untracked working tree. This was
first surfaced as a side-observation during the security-review session's
git-history secrets scan (item 7: "no git repository exists anywhere in
this tree... nothing has ever been committed"), then escalated by the user
to this session's top priority, above all other pending work including the
dependency-severity follow-ups from that same review.

**Why this is critical, not just an inconvenience**: a single-machine,
untracked codebase has no recovery path from disk failure, accidental
deletion, or a bad `rm -rf`; no ability to bisect a regression to the
commit that introduced it; no code review surface; no CI trigger (the
`.github/workflows/ci.yml` written across multiple sessions had never once
actually run, since there was no remote to push to and trigger it); and no
audit trail of who changed what, when — directly undermining this
project's own stated engineering bar (CLAUDE.md, `SECURITY_REVIEW.md`)
while simultaneously being invisible to every test suite and code review
this project had run, since none of those check for the existence of
version control itself.

**What was done to close it**:
1. Hardened `.gitignore` before anything was staged: every `.env` variant
   except `.env.example`, `apps/api/keys/` (the RS256 dev keypair, not just
   its `*.pem` files), `node_modules/`, build output (`dist/`, `.next/`,
   `coverage/`), `*.tsbuildinfo`, and Terraform state — plus `.claude/`,
   added after the secret scan below found a real JWT and a real FCM device
   token logged inside `.claude/settings.local.json` (already excluded by
   this machine's *global* git config, but that's per-machine, not
   per-repo — the project's own `.gitignore` shouldn't depend on it).
2. Ran a secret-pattern scan (AWS/Google/Stripe/Slack/GitHub key patterns,
   PEM private-key blocks, Firebase service-account markers, JWT-shaped
   strings, generic high-entropy `password`/`secret`/`token` assignments)
   against the exact 404-file set `git status` would actually track — zero
   hits — shown to the user before any commit was made, per their explicit
   instruction.
3. `git init`, then 11 commits grouped by the module/session boundaries
   this project's own `CLAUDE.md` and session history document (Phase 0 →
   auth → society/resident → visitor/security-guard → billing/audit →
   domestic-staff/complaint/notice-board → parking/amenity-booking/
   inventory → notification → RLS-enforcement fix → delivery →
   security-review), rather than one undifferentiated commit.

**What this reconstruction is NOT, stated plainly**: it is not a replay of
the actual historical diffs — those never existed as separate states, only
as the final, current file contents. Every commit contains the CURRENT
version of each file, organized by which module/session most naturally
owns it; where a later session retroactively modified an earlier module's
files (most notably: the RLS-enforcement session touched nearly every
module's `*.module.ts` to swap `TypeOrmModule.forFeature()` for
`TenantScopedTypeOrmModule.forFeature()`), that modification is baked
invisibly into the earlier commit, not visible as its own diff in the RLS
commit. Practically: checking out an early commit in isolation is not
guaranteed to build or pass tests — only the final state (`HEAD`) is. Commit
timestamps are the real date these commits were made (today); no historical
dates were fabricated. This is disclosed here, in each commit's own
message, and to the user directly, rather than presented as more precise
than it is.

**History before this point could not be reconstructed** — there is no
source (no `.git` directory, no bundled backup, no editor local-history
plugin found) from which the actual incremental development history could
be recovered. What exists now is the best-available organization of the
final state, not a recovery of the original timeline.

**Follow-up, same session: pushed to a real GitHub remote and CI verified
for real** — `git init` alone doesn't prove anything runs; a remote push
that actually triggers `.github/workflows/ci.yml` on GitHub's own
infrastructure does. That remote (`github.com/dimple-chauhan-21/nestora`)
was created by the user and pushed to, and the first four CI runs against
it **failed for real, genuine reasons never visible on this single dev
machine** — each fixed in turn rather than worked around:
1. `actions/checkout@v4`/`setup-node@v4`/`pnpm/action-setup@v4` are
   EOL/deprecated on GitHub's runners → bumped to current majors.
2. `packageManager: pnpm@11.10.0` requires Node ≥22.13; CI was pinned to
   Node 20 (this dev machine runs Node 25, masking it entirely) → CI bumped
   to Node 22, `package.json`'s `engines.node` corrected from the
   too-loose `>=20` to the real `>=22.13`.
3. `pnpm-workspace.yaml`'s `allowBuilds` had `@firebase/util` and
   `protobufjs` (transitive `firebase-admin` deps) left as the literal
   placeholder string `"set this to true or false"` — silently tolerated
   against a warm local pnpm store, hard-rejected by a clean
   `--frozen-lockfile` CI install → both approved `true`.
4. Two genuine pre-existing bugs, invisible because lint had never once
   run in CI before this session: 6× `@typescript-eslint/no-non-null-
   asserted-optional-chain` in `delivery.service.spec.ts`, and one
   `no-unused-vars` in `domestic-staff.service.ts` where the shared ESLint
   config only ignored `^_`-prefixed function args, not `^_`-prefixed
   variables — plus a structurally missing "run the seed script" step in
   `ci.yml` itself, without which every e2e suite failed on
   `EntityNotFoundError` looking up seeded roles (this bug predates this
   session; CI had simply never run for real before to surface it).

**Real, verified-green result**: commit `6d1f2bf`, GitHub Actions run
[29723182193](https://github.com/dimple-chauhan-21/nestora/actions/runs/29723182193)
— `lint-and-typecheck`, `test` (77/77 unit + 51/51 e2e across 13 suites
each), and `build` all `conclusion: success`, confirmed via the GitHub
REST API against the real run, not a local replay of the same commands.

