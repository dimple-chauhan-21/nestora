# Society Management Platform
## Software Requirements Specification & Technical Architecture Document
### Version 1.0 | Confidential — Internal Blueprint

---

## Table of Contents

1. Executive Summary
2. Product Vision & Strategic Goals
3. Scope Definition
4. Global Assumptions & Design Conventions
5. User Personas, Roles & Permission Matrix
6. Module-by-Module Functional Specification (22 modules)
7. Future-Ready Capability Hooks
8. Non-Functional Requirements
9. Technology Stack — Evaluation & Recommendation
10. Database Design (ERD Explanation + Core Schemas)
11. API Design Standards & Endpoint Catalog
12. Security Architecture
13. UI/UX & Design System Guidelines
14. Enterprise Folder Structures
15. Multi-Tenant SaaS Architecture
16. DevOps & Deployment Architecture
17. Development Phases & Roadmap
18. Testing Strategy
19. Documentation Deliverables
20. Risks & Mitigation
21. Final Development Checklist

---

## 1. Executive Summary

This document is the single source of truth for building a **production-grade, multi-tenant Society Management Platform** — a category-defining alternative to MyGate, NoBrokerHood, ApnaComplex, ADDA, and SocietyConnect. It is written for a development team to pick up and begin implementation without further clarification from the business.

The platform is not scoped as a Visitor Management System. It is scoped as a **full residential community operating system**: security & access control, financial operations (billing/ledger), facility management (amenities, parking, inventory), community engagement (notices, events, polls), staff workforce management, and a data/reporting layer — all sitting on an architecture that can scale from a single pilot society to **10,000+ societies and millions of residents** as a white-labeled SaaS product.

Key architectural commitments made in this document:
- **API-first**: a single backend serves Web, Desktop (guard house / admin kiosk), and future Mobile apps.
- **Multi-tenant from day one** at the data-model level (`tenant_id`/`society_id` scoping everywhere), even though Phase 1 ships single-society.
- **Event-driven** for cross-module workflows (visitor arrival → notification → gate log → analytics) via a message queue, not tightly-coupled synchronous calls.
- **Security-by-design**: RBAC + ABAC hybrid, encryption at rest/in transit, OWASP Top 10 mitigations baked into the API layer, not bolted on later.
- **Extensibility hooks** for AI (chatbot, complaint triage, facial recognition), IoT (smart locks, video door phones), and marketplace/local-vendor commerce are designed into the schema and service boundaries now, even though they are not built in Phase 1.

## 2. Product Vision & Strategic Goals

**Vision statement**: Become the operating system for residential communities — the single platform a resident, a security guard, a committee treasurer, and a facility manager all open every day.

**Strategic goals**:
1. Reduce manual gate/security overhead by digitizing visitor, delivery, and staff entry.
2. Give committees a transparent, auditable financial ledger (billing, dues, expenses) to reduce disputes.
3. Increase resident engagement (notices, events, polls, community chat) to reduce reliance on WhatsApp groups.
4. Provide society management companies (Company Admin tier) a way to operate many societies from one dashboard.
5. Build a data platform (reports, analytics) that becomes a moat — the longer a society uses the platform, the harder to leave.
6. Architect for SaaS resale: white-label, subscription billing, multi-tenant isolation, so the same codebase serves both a single self-managed society and a commercial multi-society SaaS business.

**Business model implication for architecture**: Because this may become a paid SaaS product, the design must support **subscription plans, usage metering, and tenant-level feature flags** from the data-model level — even though monetization is a later phase.

## 3. Scope Definition

### 3.1 In Scope (Phase 1–N, this document)
- Web application (resident portal, admin/committee console, super-admin console)
- Desktop application for the security guard house (offline-tolerant, kiosk-style)
- Backend REST/GraphQL-hybrid API layer
- PostgreSQL-based relational data platform
- Authentication & RBAC across all roles
- Notification system (push, SMS, email; WhatsApp-ready)
- All 22 functional modules listed in Section 6
- Reporting/analytics dashboard
- Multi-tenant SaaS-ready architecture (even if commercialization is a later business decision)

### 3.2 Explicitly Out of Scope for Phase 1 (but architected for)
- Native resident mobile apps (iOS/Android) — backend APIs are built mobile-ready; app itself is a later phase.
- Marketplace/local vendor commerce, community chat, SOS, digital intercom, video door calling, IoT/smart locks, facial recognition, AI chatbot/complaint triage — see Section 7 (Future-Ready Hooks).
- Full white-label theming engine (basic tenant branding — logo/colors — is in scope; a full theme marketplace is not).

### 3.3 Out of Scope Permanently (unless re-scoped)
- Payment gateway PCI-DSS custody (we integrate a certified processor — Razorpay/Stripe — rather than handling card data ourselves).
- Government ID verification / KYC beyond document upload + manual verification.

## 4. Global Assumptions & Design Conventions

Explicit assumptions, since the brief requires every assumption to be stated:

1. **Primary market is India** (evidenced by comparable products MyGate/ApnaComplex/NoBrokerHood/ADDA). Currency defaults to **INR (₹)**, timestamps default to **IST (UTC+5:30)** stored as UTC in the DB and rendered in IST, and phone/OTP flows assume Indian mobile numbers (+91) with extensibility for other country codes for future international expansion.
2. **Multi-tenancy unit = "Society"**, and a "Company Admin" (a facility management company) can operate many societies. A "Super Admin" operates the whole SaaS platform across all companies. This 3-tier hierarchy (Platform → Management Company → Society) is assumed because real players (ADDA, ApnaComplex) sell to both individual societies and facility management companies.
3. **Flat hierarchy**: Society → Tower/Block → Floor → Flat/Unit. Villa-style societies (no towers) are supported by making Tower optional (a Flat can attach directly to a Society).
4. **One flat can have multiple concurrent occupants** (owner not resident, tenant resident, family members) — the data model must not assume 1 flat = 1 user.
5. **Offline tolerance is required at the gate**: the Security Guard desktop/kiosk app must keep functioning (queue writes locally, sync later) during internet outages, since gate operations cannot halt.
6. **Payments are processed via a third-party gateway** (assume Razorpay as primary, since it dominates Indian society-management integrations); the platform stores transaction references and status, not raw card/bank data.
7. **Biometric/facial recognition hardware is not procured in Phase 1** — the Domestic Staff Attendance and Security modules are designed with a `verification_method` enum (`qr | manual | biometric | facial`) so hardware can be added later without schema changes.
8. **Notifications**: Push (FCM), SMS (any DLT-compliant Indian SMS gateway, e.g., MSG91/Twilio), Email (SES/SendGrid), and WhatsApp (WhatsApp Business API via a BSP like Gupshup) — WhatsApp is "ready" (interface built) but may not be contracted/live in Phase 1 due to per-message cost and approval lead time.
9. **Soft delete everywhere**: no domain table permanently deletes a row (except explicit GDPR/DPDP-style user-data erasure requests); all tables carry `deleted_at`.
10. **Audit columns are universal**: every table has `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` unless explicitly noted otherwise (pure lookup tables may omit `created_by`/`updated_by`).
11. **India's DPDP Act 2023** (data protection) is assumed as the compliance baseline instead of GDPR, given the target market — this affects consent capture on resident documents and a data-retention/erasure workflow.

### 4.1 Naming & ID Conventions
- Primary keys: `UUID` (v4) everywhere — not auto-increment integers — because multi-tenant data will eventually be merged/migrated/replicated across regions, and UUIDs avoid collision and avoid leaking row-count/business-volume information via sequential IDs.
- Foreign keys: `<entity>_id`, e.g. `flat_id`, `society_id`.
- Every tenant-scoped table carries `society_id` (and transitively `tenant_id` via society → company → tenant) to enable row-level multi-tenant isolation.
- Timestamps: stored as `TIMESTAMPTZ` in UTC.
- Money columns: `NUMERIC(12,2)`, currency code stored alongside (`currency CHAR(3) DEFAULT 'INR'`) for future multi-currency SaaS expansion.

---

## 5. User Personas, Roles & Permission Matrix

### 5.1 Role Hierarchy (Platform → Company → Society → Unit)

```
Super Admin (Platform)
 └─ Company Admin (Facility Mgmt Company, manages N societies)
     └─ Society Admin (owns one society's configuration)
         └─ Society Manager / Committee Member (day-to-day ops, elected/appointed)
             ├─ Accountant (financial module scope only)
             ├─ Security Guard (gate operations scope only)
             └─ Maintenance Staff (task-scope only)
     └─ Resident tier (per Flat/Unit)
         ├─ Flat Owner (primary account holder if self-occupied, or landlord if leased)
         ├─ Tenant (occupant, granted access by Owner, time-bound to lease)
         ├─ Family Member (linked to Owner or Tenant, sub-permissions)
         └─ Domestic Staff mapped to a flat (Maid/Driver/Cook/Cleaner) — mapped, not "users" with login by default, but QR/biometric identity records
 └─ Vendor (society-scoped external party: water tanker, local shop, contractor)
 └─ Delivery Agent (transient identity, visit-scoped, not a persistent account)
 └─ Visitor / Guest (transient identity, visit-scoped)
```

**Design rationale**: A 4-tier tenancy (Platform/Company/Society/Unit) is required even for a single-society Phase 1 deployment because retrofitting multi-tenancy after real customer data exists is materially more expensive than building it in from row one — every table is scoped by `society_id`, and `society` rows carry an optional `company_id` (nullable for an independently-managed society with no management company).

### 5.2 Roles Catalog

| Role | Tier | Typical User | Login Required |
|---|---|---|---|
| Super Admin | Platform | Anthropic-style internal ops team running the SaaS | Yes |
| Company Admin | Company | Facility management company staff | Yes |
| Society Admin | Society | Society president / appointed admin | Yes |
| Society Manager | Society | Paid facility manager | Yes |
| Committee Member | Society | Elected resident (treasurer, secretary, etc.) | Yes |
| Accountant | Society | Bookkeeper (in-house or outsourced) | Yes |
| Security Guard | Gate | Shift-based gate staff | Yes (PIN/biometric, lightweight) |
| Flat Owner | Unit | Owns the flat; may or may not reside | Yes |
| Tenant | Unit | Leases and resides in the flat | Yes |
| Family Member | Unit | Linked dependent/relative of Owner or Tenant | Yes (or view-only guest mode) |
| Maid / Driver / Cook / Cleaner / Caretaker | Unit-mapped | Domestic staff serving one or more flats | Optional (QR/biometric identity, login optional for staff self-service app) |
| Vendor | Society | Approved external supplier | Yes (limited portal) |
| Delivery Agent | Transient | Courier/food delivery person | No login — OTP/QR pass only |
| Visitor / Guest | Transient | One-off or recurring visitor | No login — pre-approval link or gate-issued pass |

### 5.3 Permission Matrix (representative — full matrix lives in the Admin Guide deliverable)

| Capability | Super Admin | Company Admin | Society Admin | Manager | Committee | Accountant | Guard | Owner | Tenant | Family |
|---|---|---|---|---|---|---|---|---|---|---|
| Manage platform tenants/billing plans | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Onboard/configure a society | ✅ | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage flats/residents/roles | ✅ | ✅ | ✅ | ✅ | View | ❌ | ❌ | Self-unit | Self-unit | ❌ |
| Approve visitors | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Check-in only | ✅ (own flat) | ✅ (own flat) | ✅ (own flat, if granted) |
| Gate check-in/out | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Raise/track complaints | ✅ | ✅ | ✅ | ✅ | ✅ | View | View | ✅ | ✅ | ✅ |
| Generate/view bills | ✅ | ✅ | ✅ | ✅ | View | ✅ | ❌ | View own | View own | ❌ |
| Approve expenses/ledger entries | ✅ | ✅ | ✅ | ✅ (limit) | ✅ (approval) | ✅ (entry) | ❌ | ❌ | ❌ | ❌ |
| Book amenities | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (if granted) |
| Post notices/events | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | ✅ (own companies) | ✅ (own society) | View | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Access control is implemented as **RBAC for coarse module access + ABAC (attribute-based) for row-level scoping** — e.g. an Owner's role grants "complaint:read", but the ABAC layer additionally restricts the query to `flat_id IN (owner's flats)`. This hybrid is necessary because pure RBAC cannot express "a Tenant can see their own flat's ledger but not the neighbor's."

### 5.4 Workflow: Access Delegation
Flat Owner is the root authority for a unit. Owner can:
1. Invite a Tenant (creates a time-bound `resident_unit_mapping` row with `role=tenant`, `lease_start`, `lease_end`).
2. Grant/revoke Family Member sub-accounts with a permission subset (e.g., a Family Member can approve visitors but not view the ledger).
3. On lease end (`lease_end` reached or manual move-out), Tenant's access is automatically suspended (not deleted — historical visitor/complaint records must remain queryable for audit) via a scheduled job.

---

## 6. Module-by-Module Functional Specification

**Conventions applied to every module below** (stated once to avoid repetition): every table listed carries the standard audit columns (`id UUID PK`, `society_id FK`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`) in addition to the columns called out explicitly. Every API is prefixed `/api/v1/` and requires a Bearer JWT unless marked **Public**. Full column-level DDL for the most structurally important tables is consolidated in Section 10; module sections below name tables and their distinguishing columns rather than repeating full DDL 22 times.

---

### Module 1 — Authentication & Authorization

**Purpose**: Single identity system serving every role across web, desktop, and future mobile clients, with society-aware, role-aware access tokens.

**Features**: Email/password login, mobile OTP login, signup with mobile/email verification, forgot-password flow, JWT access + refresh tokens, session/device management, RBAC + ABAC permission engine, social login-ready (Google) for residents.

**User Flow**:
1. User enters mobile number → OTP sent (SMS gateway) → OTP verified → if new number, minimal signup (name, flat lookup/invite code) → account created in `pending_verification` state until an Admin/Owner confirms the flat mapping.
2. Returning user: OTP or password login → server issues short-lived access JWT (15 min) + long-lived refresh token (30 days, rotated on use, stored hashed) → client stores refresh token in secure storage (httpOnly cookie for web, Keychain/Keystore for future mobile).
3. Password reset: email/SMS link with a signed, single-use, time-boxed token.

**Database Tables**:
| Table | Key columns |
|---|---|
| `users` | `phone (unique, +91 default)`, `email (unique, nullable)`, `password_hash`, `status (pending/active/suspended/deleted)`, `phone_verified_at`, `email_verified_at` |
| `roles` | `code`, `name`, `tier (platform/company/society/unit)` |
| `permissions` | `code`, `module`, `action` |
| `role_permissions` | `role_id`, `permission_id` |
| `user_roles` | `user_id`, `role_id`, `society_id (nullable for platform-tier roles)`, `flat_id (nullable)` |
| `refresh_tokens` | `user_id`, `token_hash`, `device_id`, `expires_at`, `revoked_at` |
| `otp_requests` | `phone`, `otp_hash`, `purpose (login/signup/reset)`, `attempts`, `expires_at` |
| `login_audit` | `user_id`, `ip`, `device`, `success`, `failure_reason` |

**Key APIs**:
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/auth/otp/request` | Public. Rate-limited 5/hour/phone |
| POST | `/auth/otp/verify` | Public. Returns JWT pair on success |
| POST | `/auth/login` | Public. Email/password |
| POST | `/auth/refresh` | Rotates refresh token |
| POST | `/auth/logout` | Revokes refresh token(s) |
| POST | `/auth/password/forgot` | Public |
| POST | `/auth/password/reset` | Public, token-bound |
| GET | `/auth/me` | Returns user + effective roles/permissions |

**Validations**: E.164 phone format; password policy (min 8 chars, 1 number, 1 symbol) — but OTP is the primary/encouraged path given Indian market norms; OTP max 3 attempts then 15-min lockout.

**Edge Cases**: Number recycling (old owner's number reassigned by telco to a new person — mitigated by phone-change reconfirmation flow before granting flat access); multiple flats for one owner (one `users` row, multiple `user_roles` rows); family member without a personal phone (guardian-managed sub-profile, no independent login).

**Security**: bcrypt/argon2 password hashing; refresh tokens stored as SHA-256 hash, never plaintext; JWT signed RS256 (asymmetric, so resource servers verify with public key only); device-bound refresh tokens revocable individually ("log out this device").

**Notifications**: OTP SMS, new-device-login email alert, password-changed confirmation.

**Reports**: Login audit log, failed-login/brute-force report, active sessions per user.

---

### Module 2 — Society Management (Configuration Core)

**Purpose**: Model the physical and administrative structure of a society, and its master configuration (amenities, rules, contacts).

**Features**: Society profile, Tower/Building/Wing hierarchy (optional level), Floor, Flat/Unit registry, Society Settings (timezone, currency, fiscal-year start, late-fee policy), Document repository, Amenities master, Rules/bylaws, Emergency contacts.

**User Flow**: Super Admin/Company Admin creates a Society → defines Towers (optional) → Floors → Flats (bulk CSV import supported) → Society Admin configures settings (billing cycle day, late fee %, amenity list) → uploads bylaws/documents → adds emergency contact numbers (local police, fire, hospital, society office).

**Database Tables**:
| Table | Key columns |
|---|---|
| `companies` | `name`, `plan_id`, `billing_status` |
| `societies` | `company_id (nullable)`, `name`, `address`, `city`, `state`, `pincode`, `geo_lat/lng`, `timezone`, `currency`, `registration_number` |
| `towers` | `society_id`, `name`, `total_floors` |
| `flats` | `society_id`, `tower_id (nullable)`, `floor_number`, `flat_number`, `type (1BHK/2BHK/villa/...)`, `area_sqft`, `status (occupied/vacant/under-construction)` |
| `society_settings` | `society_id`, `billing_cycle_day`, `late_fee_pct`, `fiscal_year_start_month`, `feature_flags (jsonb)` |
| `amenities_master` | `society_id`, `name`, `type`, `capacity`, `booking_required (bool)` |
| `society_documents` | `society_id`, `doc_type`, `file_url`, `version` |
| `emergency_contacts` | `society_id`, `name`, `category (police/fire/hospital/office)`, `phone` |
| `society_rules` | `society_id`, `title`, `body`, `effective_from` |

**Key APIs**: `POST /societies`, `GET /societies/{id}`, `PATCH /societies/{id}/settings`, `POST /societies/{id}/flats/bulk-import`, `GET /societies/{id}/flats`, `POST /societies/{id}/amenities`, `POST /societies/{id}/documents`.

**Validations**: Pincode format; flat_number unique within (society_id, tower_id, floor_number); bulk import de-duplication by flat_number.

**Edge Cases**: Society with no towers (villa layout) — `tower_id` nullable; society under phased construction (flats added incrementally, some `status=under-construction`); society renumbering flats (needs a `flat_number_history` audit rather than hard rename, to keep historical bills/visitor logs meaningful).

**Security**: Only Super Admin/Company Admin can create a society; Society Admin scoped strictly to `society_id` via ABAC on every downstream query.

**Notifications**: Configuration-change notification to all Committee Members (e.g., late-fee % changed).

**Reports**: Occupancy report (occupied vs vacant flats), society configuration audit trail.

---

### Module 3 — Resident Management

**Purpose**: Manage the human beings attached to a flat — owners, tenants, family, vehicles, pets, documents, and move-in/move-out lifecycle.

**Features**: Owner/Tenant/Family profiles, children & senior-citizen flags (for targeted communication/safety), vehicle registry, pet registry, resident documents (ID proof, lease agreement), emergency contacts per resident, move-in/move-out workflow, lease tracking.

**User Flow**: Owner completes profile → adds Family Members → (if leased) invites Tenant via invite code/link → Tenant accepts, lease dates captured → vehicles/pets added → on lease expiry or sale, Move-Out workflow triggered (checklist: dues cleared, keys/access cards returned, deposit reconciliation) → flat marked vacant or new mapping created.

**Database Tables**:
| Table | Key columns |
|---|---|
| `residents` | `user_id`, `flat_id`, `relation_type (owner/tenant/family)`, `is_senior_citizen`, `is_child`, `move_in_date`, `move_out_date` |
| `lease_details` | `resident_id`, `lease_start`, `lease_end`, `monthly_rent`, `deposit_amount`, `agreement_doc_id` |
| `vehicles` | `flat_id`, `owner_resident_id`, `type (car/bike)`, `registration_number`, `rc_doc_url` |
| `pets` | `flat_id`, `name`, `species`, `vaccination_doc_url` |
| `resident_documents` | `resident_id`, `doc_type (id_proof/agreement/photo)`, `file_url`, `verified_at`, `verified_by` |
| `resident_emergency_contacts` | `resident_id`, `name`, `relation`, `phone` |
| `move_events` | `flat_id`, `resident_id`, `event_type (move_in/move_out)`, `checklist_json`, `dues_cleared (bool)` |

**Key APIs**: `POST /flats/{id}/residents`, `POST /residents/{id}/vehicles`, `POST /residents/{id}/pets`, `POST /residents/{id}/documents`, `POST /flats/{id}/move-out`, `GET /societies/{id}/residents?filter=senior_citizen`.

**Validations**: Vehicle registration number format (Indian plate regex); lease_end > lease_start; move-out blocked (or flagged) if `dues_cleared=false` unless admin overrides with reason.

**Edge Cases**: Owner living abroad, NRI, flat fully tenant-occupied (Owner has read-only/notification role, Tenant has operational role); co-owners (multiple `residents` rows with `relation_type=owner` on the same flat); resident with disability needing accessibility flags for guard/notification handling.

**Security**: Resident documents (ID proof) stored in encrypted-at-rest object storage with signed, short-lived URLs — never public buckets.

**Notifications**: Lease-expiry reminder (30/15/7 days prior) to Owner and Tenant; move-in welcome message with society rules link.

**Reports**: Occupancy by relation type, senior-citizen/child registry (for emergency response), lease-expiry pipeline, vehicle registry export.

---

### Module 4 — Visitor Management

**Purpose**: Govern every non-resident entry — walk-ins, pre-approved guests, recurring visitors — with an auditable approval trail.

**Features**: Visitor registration (guard-entered or self pre-registered), QR-code pass generation, pre-approved/guest invites (resident-initiated), walk-in flow, approval workflow (resident approves/rejects via push notification), visitor pass (QR + photo), visitor history, blacklist, recurring visitor profiles (e.g., daily tutor), expected-visitor calendar.

**User Flow (Walk-in)**: Visitor arrives → Guard captures name/phone/photo/purpose at kiosk → system pushes approval request to resident's app (`APPROVE`/`REJECT`, default 5-minute auto-escalate to a second contact if no response — configurable per society, see Validations below) → on approval, QR/printed pass issued with time-bound validity → Guard logs check-in.
**User Flow (Pre-approved)**: Resident creates a Guest Invite (name, date range, optional recurring rule) → system generates a shareable QR/link → visitor shows QR at gate → Guard scans → auto-matched, no live approval needed → check-in logged.

**Database Tables**:
| Table | Key columns |
|---|---|
| `visitors` | `phone`, `name`, `photo_url`, `id_proof_type/number (optional)` — a light global directory to speed repeat entries |
| `visitor_visits` | `visitor_id`, `flat_id`, `visit_type (walk_in/pre_approved/recurring)`, `purpose`, `status (pending/approved/rejected/checked_in/checked_out/expired)`, `qr_code`, `valid_from`, `valid_to`, `approved_by`, `approved_at` |
| `guest_invites` | `flat_id`, `created_by_resident_id`, `guest_name`, `guest_phone`, `valid_from`, `valid_to`, `recurrence_rule (rrule format, nullable)`, `qr_token` |
| `visitor_blacklist` | `society_id`, `phone/name/id_proof`, `reason`, `added_by` |
| `gate_logs` (shared with Module 5) | `visitor_visit_id`, `direction (in/out)`, `guard_id`, `gate_id`, `timestamp`, `method (qr/manual/facial)` |

**Key APIs**: `POST /visits/walk-in`, `POST /visits/{id}/approve`, `POST /visits/{id}/reject`, `POST /guest-invites`, `GET /guest-invites/{token}` (Public, QR resolve), `POST /gate/check-in`, `POST /gate/check-out`, `GET /flats/{id}/visits/history`.

**Validations**: QR token single-use unless `recurrence_rule` present; approval request expires after configurable timeout (default 5 min) and escalates; blacklist check runs synchronously before pass issuance.

**Edge Cases**: Resident unreachable (no smartphone/DND) → escalation chain to Family Member → Security Guard's own judgment call logged with `override_reason`; visitor for a flat with disputed/unknown mapping (society office fallback approver); QR pass shared/screenshotted and reused (mitigate with single-use token + time-window + optional live-photo match at second use attempt).

**Security**: QR tokens are signed JWT-like tokens (HMAC), not sequential IDs, to prevent guessing; visitor photo captured at kiosk stored with retention policy (auto-purge after N days per DPDP guidance, configurable by Society Admin).

**Notifications**: Push to resident on visitor arrival; push to guard on approval/rejection; SMS to visitor with pass link (pre-approved flow).

**Reports**: Daily visitor count, purpose-wise breakdown, average approval time, blacklist hit report.

---

### Module 5 — Security Guard Module

**Purpose**: The operational console (desktop/tablet kiosk at the gate) guards use for all entry/exit control — visitors, deliveries, staff, vehicles.

**Features**: Unified check-in/out screen, QR scanner, manual entry fallback, one-tap resident calling (VoIP/click-to-call), gate log timeline, emergency/SOS alert trigger, shift-wise daily report, offline queue mode.

**User Flow**: Guard logs into kiosk (PIN or biometric, lightweight session) → dashboard shows expected visitors/deliveries for the shift → scans QR or manual-searches a flat → approval/verification per Module 4 rules → logs entry → on exit, scans pass again or manual checkout → shift-end triggers an auto-generated daily report to Society Manager.

**Database Tables**:
| Table | Key columns |
|---|---|
| `guards` | `user_id`, `society_id`, `shift_pattern`, `gate_id` |
| `gates` | `society_id`, `name`, `type (main/service/pedestrian)` |
| `gate_logs` | (shared, see Module 4) plus staff/vehicle check-in variants via `entity_type (visitor/delivery/staff/vehicle)` |
| `emergency_alerts` | `society_id`, `raised_by`, `type (fire/medical/security/other)`, `status`, `resolved_at` |
| `shift_reports` | `guard_id`, `gate_id`, `shift_date`, `entries_count`, `exits_count`, `alerts_count` |

**Key APIs**: `POST /guard/login`, `GET /guard/dashboard`, `POST /gate/scan`, `POST /gate/manual-entry`, `POST /gate/call-resident`, `POST /emergency-alerts`, `GET /guard/shift-report`.

**Validations**: Gate-scoped session (a guard assigned to Gate A cannot log entries against Gate B without an explicit gate-switch action, for accountability); emergency alert cannot be silently dismissed — requires a `resolution_note`.

**Edge Cases**: Kiosk loses internet mid-shift — writes queue locally (IndexedDB/SQLite on desktop) and syncs via background job with conflict resolution (server timestamp wins, local queue re-applied in order); guard shift handover mid-visitor-approval (state must be resumable by the next guard, not tied to a browser session).

**Security**: Kiosk devices are provisioned/allow-listed by device ID; guard accounts have no access to financial/resident-personal-document modules (RBAC denies by default, allow-list only gate-relevant permissions).

**Notifications**: Emergency alert broadcasts to all Committee Members + Society Admin instantly (push + SMS, bypassing normal notification throttling).

**Reports**: Shift-wise entry/exit counts, emergency alert log, gate-wise traffic heatmap.

---

### Module 6 — Delivery Management

**Purpose**: Track courier and food-delivery agents distinctly from general visitors, since volume is much higher and dwell time is much shorter.

**Features**: Delivery agent logging (courier company/food-platform-agnostic), parcel tracking status, resident notification on arrival, OTP-based handover confirmation, pending/completed/returned delivery views.

**User Flow**: Delivery agent arrives → Guard logs agent + platform (Amazon/Swiggy/Zomato/etc., free-text or picklist) + optional parcel photo → resident notified → resident shares OTP with agent (or agent enters flat number and system auto-generates an OTP shown to guard/resident) → agent hands to guard or is escorted → on handover confirmation, status moves to `completed`; if resident absent, marked `pending` with a security-desk holding location; if agent leaves without handover, marked `returned`.

**Database Tables**:
| Table | Key columns |
|---|---|
| `delivery_agents` | `phone`, `platform`, `name` — lightweight, high-churn directory |
| `deliveries` | `flat_id`, `agent_id`, `platform`, `parcel_photo_url`, `status (pending/handed_over/returned)`, `otp_code`, `otp_verified_at`, `held_at_desk (bool)` |

**Key APIs**: `POST /deliveries`, `POST /deliveries/{id}/otp/verify`, `PATCH /deliveries/{id}/status`, `GET /flats/{id}/deliveries?status=pending`.

**Validations**: OTP 4–6 digit, 10-minute expiry; a delivery cannot be marked `handed_over` without OTP match or an explicit guard override with reason (for elderly/no-smartphone residents).

**Edge Cases**: Resident not home and delivery is perishable (food) — guard-desk holding has a max-hold-time alert so food isn't left indefinitely; multiple simultaneous deliveries to the same flat (system must not conflate OTPs — one OTP per delivery record, not per flat).

**Security**: OTP delivered via push+SMS to resident only, never shown to the guard directly (guard sees "verified/not verified" boolean, not the code) to prevent guard-side fraud.

**Notifications**: Push "Your delivery has arrived" with agent photo; reminder if `pending` > 30 minutes.

**Reports**: Delivery volume by platform, average pending-to-collected time, returned-delivery rate.

---

### Module 7 — Domestic Staff Management

**Purpose**: Manage the workforce that serves residents directly (maids, drivers, cooks, cleaners, caretakers) — distinct from Module 5's gate guards and Module 15's society-employed maintenance staff.

**Features**: Staff registry mapped to one or more flats, QR-based attendance (biometric-ready design per Assumption 7), salary records, leave management, resident-staff mapping (many-to-many — one maid may serve 5 flats).

**User Flow**: Society Admin or Owner onboards staff (name, phone, photo, ID proof, police-verification doc upload) → staff assigned to flat(s) with a working-hours schedule → daily attendance via QR badge scan at a staff kiosk or the resident's flat-side scan (`verification_method` enum extensible to biometric/facial later) → attendance auto-computes monthly present/absent/leave → salary record generated per flat-staff mapping (since pay is typically per-flat, not from the society) → leave requests raised by staff or on their behalf, approved by the mapped resident.

**Database Tables**:
| Table | Key columns |
|---|---|
| `domestic_staff` | `name`, `phone`, `photo_url`, `staff_type (maid/driver/cook/cleaner/caretaker)`, `police_verification_doc_url`, `police_verification_status` |
| `staff_flat_mapping` | `staff_id`, `flat_id`, `monthly_salary`, `work_days (jsonb)`, `active (bool)` |
| `staff_attendance` | `staff_id`, `flat_id`, `date`, `check_in_time`, `check_out_time`, `verification_method (qr/manual/biometric/facial)` |
| `staff_leave_requests` | `staff_id`, `flat_id`, `date_from`, `date_to`, `reason`, `status` |
| `staff_salary_records` | `staff_flat_mapping_id`, `month`, `amount_due`, `amount_paid`, `paid_at` |

**Key APIs**: `POST /staff`, `POST /staff/{id}/flat-mapping`, `POST /staff/attendance/check-in`, `POST /staff/leave-requests`, `PATCH /staff/leave-requests/{id}/approve`, `GET /flats/{id}/staff/attendance-summary`.

**Validations**: Police-verification status gates whether staff can be onboarded society-wide (Society Admin policy toggle) vs. flat-only; attendance check-in/out pairs validated for chronological sanity.

**Edge Cases**: Staff working across multiple societies (global directory keyed by phone, per-society mapping separate — prevents duplicate profiles when the same maid works in a neighboring society using this platform); staff terminated mid-month (salary pro-ration); staff without a smartphone (guard-assisted or resident-assisted QR scan at flat door).

**Security**: Police-verification documents are sensitive PII — encrypted at rest, access restricted to Society Admin/Manager role only, not visible to other residents.

**Notifications**: Attendance-marked confirmation to the mapped resident; leave-request approval notification to staff.

**Reports**: Monthly attendance summary per staff, salary payout report, police-verification compliance report (society-wide).

---

### Module 8 — Complaint Management

**Purpose**: Structured, trackable grievance handling — replacing the informal WhatsApp-group complaint pattern with an auditable workflow.

**Features**: Categories (plumbing/electrical/security/housekeeping/other), priority levels, photo/video attachments, threaded comments, status tracking (open/assigned/in-progress/resolved/reopened/closed), assignment to staff/vendor, escalation rules (SLA breach auto-escalates), resolution notes, resident satisfaction feedback, analytics.

**User Flow**: Resident raises a complaint (category, description, photo) → auto-routed by category to the relevant Maintenance Staff/Vendor (configurable routing rules) or manually assigned by Manager → status updates with comment thread visible to the resident → SLA timer runs per priority (e.g., "Urgent" = 4-hour SLA); breach triggers escalation notification to Society Manager → on completion, marked Resolved → resident confirms or reopens within a grace window → resident rates satisfaction (1–5) → auto-closes after N days if no reopen.

**Database Tables**:
| Table | Key columns |
|---|---|
| `complaint_categories` | `society_id (nullable for global defaults)`, `name`, `default_sla_hours`, `default_assignee_role` |
| `complaints` | `flat_id`, `raised_by`, `category_id`, `priority (low/medium/high/urgent)`, `description`, `status`, `assigned_to`, `sla_due_at`, `resolved_at`, `satisfaction_rating` |
| `complaint_attachments` | `complaint_id`, `file_url`, `type (image/video)` |
| `complaint_comments` | `complaint_id`, `author_id`, `body`, `is_internal (bool — staff-only notes)` |
| `complaint_escalations` | `complaint_id`, `escalated_at`, `escalated_to`, `reason` |

**Key APIs**: `POST /complaints`, `GET /complaints?status=&category=&flat_id=`, `PATCH /complaints/{id}/assign`, `PATCH /complaints/{id}/status`, `POST /complaints/{id}/comments`, `POST /complaints/{id}/feedback`.

**Validations**: Priority-to-SLA mapping enforced server-side (not client-editable); attachment size/type limits; `is_internal` comments never returned to resident-scoped API responses.

**Edge Cases**: Complaint against a specific staff member (routes to Manager, not the accused staff, to avoid conflict of interest); duplicate complaints from multiple flats for the same root issue (Manager can "merge" complaints, keeping one as primary); complaint reopened after auto-close window (creates a linked new complaint referencing the original).

**Security**: Internal staff comments and vendor cost notes are RBAC-hidden from the resident view.

**Notifications**: Status-change push/SMS to resident; SLA-breach escalation to Manager/Committee; new-complaint alert to assigned staff.

**Reports**: Category-wise volume, average resolution time, SLA compliance %, staff/vendor performance ranking, satisfaction-score trend.

---

### Module 9 — Maintenance Billing

**Purpose**: The financial core — recurring maintenance bills, one-off invoices, receipts, online payment collection, and the society's ledger.

**Features**: Monthly bill generation (per-flat, rule-based: flat-area-based, flat-type-based, or flat-count-based formulas), invoices, late fees (per Society Settings policy), digital receipts, online payment integration, payment history, partial payments, discounts (e.g., senior-citizen or early-payment), penalties, financial reports, general ledger.

**User Flow**: On `billing_cycle_day` (Module 2 setting), a scheduled job generates `bills` for every active flat using the society's billing formula (flat rate, or ₹/sqft, or per-head) → resident notified → resident pays via integrated gateway (Razorpay) → webhook confirms payment → receipt auto-generated (PDF) → ledger entry posted → overdue bills (past due date) accrue late fee per policy and trigger reminder notifications → Accountant can record offline payments (cash/cheque) manually with a reconciliation flag → monthly financial reports (income/expense/balance) generated for Committee review.

**Database Tables**:
| Table | Key columns |
|---|---|
| `billing_plans` | `society_id`, `formula_type (flat_rate/per_sqft/per_head)`, `rate`, `late_fee_pct`, `grace_period_days` |
| `bills` | `flat_id`, `billing_period`, `amount_due`, `amount_paid`, `due_date`, `status (unpaid/partial/paid/overdue)`, `late_fee_applied` |
| `bill_line_items` | `bill_id`, `description`, `amount` (supports itemized: maintenance + parking + late fee as separate lines) |
| `payments` | `bill_id`, `amount`, `method (online/cash/cheque/bank_transfer)`, `gateway_ref`, `status`, `paid_at`, `recorded_by (nullable — null for self-service online)` |
| `receipts` | `payment_id`, `receipt_number`, `pdf_url` |
| `ledger_entries` | `society_id`, `entry_type (income/expense)`, `category`, `amount`, `reference_type/reference_id`, `entry_date` |
| `discounts` | `bill_id`, `type`, `amount`, `reason` |

**Key APIs**: `POST /billing-plans`, `POST /bills/generate` (system/cron-triggered, idempotent per period), `GET /flats/{id}/bills`, `POST /bills/{id}/pay` (initiates gateway session), `POST /webhooks/payment-gateway` (Public but signature-verified), `POST /bills/{id}/record-offline-payment`, `GET /societies/{id}/ledger`, `GET /societies/{id}/reports/financial-summary`.

**Validations**: Bill generation is idempotent (won't double-bill a flat for the same period even if the job retries); partial payments allowed but cannot exceed `amount_due`; late fee calculated server-side only, never client-supplied.

**Edge Cases**: Mid-cycle move-in/move-out (pro-rated billing); flat under dispute/legal hold (billing can be frozen with an admin flag, still visible but not overdue-escalated); payment gateway webhook arriving twice (idempotency key on `gateway_ref` prevents double-crediting); refunds (a `refunds` table linked to `payments`, out-of-band approval required).

**Security**: No card/bank data ever touches our servers — only gateway tokens/references (PCI-DSS scope stays with the processor); webhook signature verification mandatory; ledger entries are append-only (corrections via reversing entries, never edits, for audit integrity).

**Notifications**: Bill-generated notice, payment-received receipt, overdue reminder (escalating cadence: 3/7/15 days), late-fee-applied notice.

**Reports**: Collection efficiency (% collected vs billed), outstanding-dues aging report (0-30/30-60/60+ days), income-vs-expense statement, per-flat ledger/passbook, defaulter list for Committee.

---

### Module 10 — Parking Management

**Purpose**: Allocate and track parking slots for residents and visitors, and manage violations.

**Features**: Slot inventory, visitor parking, reserved/allocated slots, vehicle-to-slot mapping, violation reporting, utilization reports.

**User Flow**: Admin defines parking slots (numbered, zone, type: covered/open/2-wheeler/4-wheeler) → allocates slots to flats (one flat may get 1–2 slots per society policy) → visitor parking is a shared pool, allocated at gate check-in when a visitor's vehicle needs parking → violation (wrong slot, unauthorized parking) reported by any resident/guard with a photo, routed to Manager.

**Database Tables**:
| Table | Key columns |
|---|---|
| `parking_slots` | `society_id`, `slot_number`, `zone`, `type`, `status (allocated/vacant/reserved)` |
| `parking_allocations` | `slot_id`, `flat_id`, `vehicle_id (nullable)`, `allocated_from`, `allocated_to (nullable = indefinite)` |
| `visitor_parking_log` | `slot_id`, `visitor_visit_id`, `checked_in_at`, `checked_out_at` |
| `parking_violations` | `slot_id`, `reported_by`, `photo_url`, `description`, `status` |

**Key APIs**: `POST /parking/slots`, `POST /parking/allocations`, `POST /parking/violations`, `GET /societies/{id}/parking/availability`.

**Validations**: One active allocation per slot at a time; violation reports require a photo.

**Edge Cases**: Flat with more vehicles than allocated slots (overflow queued to visitor pool with a resident-priority flag); slot under maintenance (temporarily `status=blocked`, excluded from allocation).

**Security**: Violation photos retained per data-retention policy; only Manager/Committee can resolve violations (not peer residents, to avoid conflict).

**Notifications**: Violation-reported alert to the offending flat and Manager; slot-allocation-changed notice.

**Reports**: Slot utilization %, visitor-parking peak-hour report, violation frequency by flat.

---

### Module 11 — Notice Board

**Purpose**: Official, trackable communication channel replacing paper notices and unmoderated WhatsApp groups.

**Features**: Announcements, circulars, document attachments, pinned/priority notices, read-receipts, categorization, targeted audience (all/tower-specific/committee-only).

**User Flow**: Admin/Committee drafts a notice (title, body, category, target audience, optional attachment, optional pin/expiry) → published → push/SMS/email fan-out per resident notification preferences → read-receipt recorded on open → pinned notices surface at the top of the resident home screen until expiry.

**Database Tables**:
| Table | Key columns |
|---|---|
| `notices` | `society_id`, `title`, `body`, `category`, `target_audience (jsonb — all/tower_ids/role)`, `is_pinned`, `expires_at`, `published_by` |
| `notice_attachments` | `notice_id`, `file_url` |
| `notice_reads` | `notice_id`, `user_id`, `read_at` |

**Key APIs**: `POST /notices`, `GET /societies/{id}/notices`, `POST /notices/{id}/read`, `GET /notices/{id}/read-report`.

**Validations**: Target-audience must resolve to at least one recipient; expiry_at must be future at creation.

**Edge Cases**: Urgent notice needing guaranteed delivery (bypass quiet-hours notification throttling); notice targeted at a tower that's later deleted (audience snapshot at publish time preserved for historical read-reports).

**Security**: Draft notices visible only to authors until published; edit history retained (no silent post-publish edits).

**Notifications**: Push/SMS/email per notice, respecting resident notification preferences except for `category=emergency`.

**Reports**: Read-rate per notice, engagement trend over time.

---

### Module 12 — Events

**Purpose**: Organize community events (festivals, meetings, workshops) with RSVP and attendance tracking.

**Features**: Event creation, RSVP, registration with capacity limits, ticketing (free or paid), guest-list management, attendance check-in, photo gallery, post-event feedback.

**User Flow**: Committee creates an event (title, date/venue, capacity, fee if any) → published as a notice + dedicated event card → residents RSVP/register (with optional +guest count) → if paid, integrates with Module 9's payment flow → on event day, check-in at a kiosk (QR from the RSVP confirmation) → post-event, photos uploaded to a shared gallery and a feedback form sent.

**Database Tables**:
| Table | Key columns |
|---|---|
| `events` | `society_id`, `title`, `description`, `venue`, `start_at`, `end_at`, `capacity`, `fee_amount` |
| `event_rsvps` | `event_id`, `flat_id`, `resident_id`, `guest_count`, `status (going/maybe/not_going)`, `payment_id (nullable)` |
| `event_checkins` | `rsvp_id`, `checked_in_at` |
| `event_photos` | `event_id`, `file_url`, `uploaded_by` |
| `event_feedback` | `event_id`, `resident_id`, `rating`, `comments` |

**Key APIs**: `POST /events`, `POST /events/{id}/rsvp`, `POST /events/{id}/check-in`, `POST /events/{id}/photos`, `POST /events/{id}/feedback`.

**Validations**: RSVP capacity enforced (waitlist state once full); paid events require successful payment before RSVP is confirmed.

**Edge Cases**: Event cancelled after paid RSVPs exist (triggers Module 9 refund workflow); guest (non-resident) attendee needs a temporary gate pass (integrates with Module 4's guest-invite as a bulk operation).

**Security**: Event photo uploads scanned for basic content moderation (size/type validation minimum; explicit content moderation is a Future-Ready AI hook).

**Notifications**: RSVP confirmation, event reminder (T-1 day), post-event feedback request.

**Reports**: RSVP-vs-attendance rate, revenue collected (paid events), feedback-score summary.

---

### Module 13 — Polls & Voting

**Purpose**: Structured decision-making for committee and resident matters, including anonymous voting for sensitive topics.

**Features**: Poll creation, anonymous polls, committee-only polls, resident-wide polls, real-time results, exportable reports.

**User Flow**: Committee/Admin creates a poll (question, options, audience, anonymous toggle, close date) → eligible residents vote once → if anonymous, the vote record is decoupled from identity at the storage layer (see Security) → results visible live to creator (and to all voters post-close, per configurable visibility) → exported as a report for AGM/minutes.

**Database Tables**:
| Table | Key columns |
|---|---|
| `polls` | `society_id`, `question`, `options (jsonb)`, `audience`, `is_anonymous`, `closes_at`, `created_by` |
| `poll_votes` | `poll_id`, `voter_id (nullable if anonymous — see below)`, `option_selected`, `voted_at` |
| `poll_eligibility` | `poll_id`, `flat_id` (one-vote-per-flat vs one-vote-per-resident is a configurable policy) |

**Key APIs**: `POST /polls`, `POST /polls/{id}/vote`, `GET /polls/{id}/results`.

**Validations**: One vote per eligible voter/flat (enforced by a unique constraint on `(poll_id, voter_id)` or `(poll_id, flat_id)` depending on policy); voting blocked after `closes_at`.

**Edge Cases**: Anonymous poll where "one vote per flat" must still be enforced without revealing identity — implemented via a separate `poll_eligibility_used` boolean flag table keyed by flat, decoupled from the `poll_votes` row (which for anonymous polls stores no `voter_id`, only `option_selected`), so eligibility can be checked without linking vote content to identity.

**Security**: For anonymous polls, `voter_id` is never persisted in `poll_votes`; the "has this flat already voted" check lives in a separate table, so no query can join a specific person to a specific answer.

**Notifications**: Poll-opened, poll-closing-soon (T-1 day) reminder to non-voters, results-published.

**Reports**: Turnout %, option-wise breakdown, historical poll archive for AGM records.

---

### Module 14 — Lost & Found

**Purpose**: Community bulletin for lost/found items within the society, with a lightweight claim-verification flow.

**Features**: Item posting (lost or found), images, claim requests, verification, status tracking (open/claimed/resolved).

**User Flow**: Resident/Guard posts an item (photo, description, location found/lost, category) → other residents browse and submit a Claim Request with identifying details → poster reviews claim details (not public) and approves/rejects → on approval, status moves to Resolved and a handover is arranged (society office or direct).

**Database Tables**:
| Table | Key columns |
|---|---|
| `lost_found_items` | `society_id`, `type (lost/found)`, `title`, `description`, `photo_url`, `location`, `status`, `posted_by` |
| `lost_found_claims` | `item_id`, `claimant_id`, `verification_details`, `status (pending/approved/rejected)` |

**Key APIs**: `POST /lost-found`, `GET /societies/{id}/lost-found`, `POST /lost-found/{id}/claims`, `PATCH /lost-found/claims/{id}/status`.

**Validations**: Claim verification_details required (free text — "it has a scratch on the back") to deter false claims.

**Edge Cases**: Item never claimed (auto-archive after 30 days, configurable); disputed claim (multiple claimants — Manager mediates, out of automated workflow scope).

**Security**: Claimant's verification details visible only to the item poster, not publicly listed.

**Notifications**: New-item-posted digest (daily, not per-item, to avoid noise), claim-received alert to poster.

**Reports**: Resolution rate, average time-to-claim.

---

### Module 15 — Inventory & Asset Management

**Purpose**: Track society-owned physical assets (generators, gym equipment, furniture, tools) — distinct from Module 7/domestic staff and Module 5/security staff, this is about *things*, not people.

**Features**: Asset registry, equipment tracking, maintenance history, asset assignment (to a staff member or location), purchase details, warranty tracking.

**User Flow**: Manager registers an asset (name, category, purchase date/cost, vendor, warranty period) → assigns to a location/custodian → logs maintenance events (service date, cost, vendor) over the asset's life → system alerts on warranty expiry and on scheduled-maintenance due dates.

**Database Tables**:
| Table | Key columns |
|---|---|
| `assets` | `society_id`, `name`, `category`, `purchase_date`, `purchase_cost`, `vendor`, `warranty_expires_at`, `assigned_to (staff_id/location)`, `status (active/under_repair/retired)` |
| `asset_maintenance_log` | `asset_id`, `service_date`, `cost`, `vendor`, `notes` |

**Key APIs**: `POST /assets`, `POST /assets/{id}/maintenance-log`, `GET /societies/{id}/assets?category=`, `GET /assets/{id}/warranty-alerts`.

**Validations**: Purchase cost non-negative; warranty_expires_at optional but flagged for alerting when present.

**Edge Cases**: Asset retired/disposed (status change, not deletion, for depreciation/audit history); shared assets across multiple towers (assignment can reference a `location` rather than a single custodian).

**Security**: Purchase-cost data restricted to Accountant/Committee/Admin roles, not general residents.

**Notifications**: Warranty-expiring-soon alert, scheduled-maintenance-due alert.

**Reports**: Asset register export, total asset value, maintenance-cost trend by category.

---

### Module 16 — Amenities Booking

**Purpose**: Reservation system for shared facilities (clubhouse, gym, pool, party hall, guest rooms, sports courts) to prevent double-booking and to optionally monetize usage.

**Features**: Booking calendar, availability engine, per-amenity rules (max duration, advance-booking window, resident-only vs guest-allowed), payments for paid amenities, cancellation policy.

**User Flow**: Resident views an amenity's calendar → selects a free slot → system checks availability + resident eligibility (e.g., dues-cleared requirement, configurable) → if paid, routes to Module 9 payment → booking confirmed → cancellation within policy window triggers auto-refund; late cancellation forfeits per policy.

**Database Tables**:
| Table | Key columns |
|---|---|
| `amenity_booking_rules` | `amenity_id (FK to amenities_master)`, `min_duration_mins`, `max_duration_mins`, `advance_booking_days`, `cancellation_window_hours`, `fee_amount` |
| `amenity_bookings` | `amenity_id`, `flat_id`, `booked_by`, `start_at`, `end_at`, `status (confirmed/cancelled/completed)`, `payment_id (nullable)` |

**Key APIs**: `GET /amenities/{id}/availability?date=`, `POST /amenities/{id}/bookings`, `DELETE /amenity-bookings/{id}` (cancellation, not hard-delete — status change).

**Validations**: Overlapping-slot check enforced at the DB level via an exclusion constraint (`EXCLUDE USING gist` on the time range) in addition to application logic, to prevent race-condition double-bookings under concurrent requests.

**Edge Cases**: Amenity under maintenance (blocks bookings for the affected window); dues-defaulter attempting to book a paid amenity (configurable hard-block vs. warning); recurring booking request (e.g., weekly yoga class — modeled as N individual booking rows generated from a `recurrence_rule`, not a single infinite row, to keep availability queries simple).

**Security**: Booking creation is idempotent per request (client-supplied idempotency key) to avoid duplicate bookings from a double-tap/retry on a flaky connection.

**Notifications**: Booking-confirmed, T-1-hour reminder, cancellation-confirmed/refund-initiated.

**Reports**: Amenity utilization rate, revenue per amenity, no-show rate.

---

### Module 17 — Water Tanker Management

**Purpose**: Track third-party water supply (common in societies with municipal supply gaps) — vendor, delivery, consumption, and cost.

**Features**: Vendor registry, water-entry logging (tanker arrival, quantity), tank-filling records, consumption tracking, cost tracking, reports.

**User Flow**: Vendor registered with rate-per-tanker/liter → tanker arrival logged by Guard/Manager (vendor, quantity, tank filled, timestamp, photo of gauge optional) → cost auto-computed from vendor rate → monthly consumption vs. cost report generated for the Committee to evaluate tanker dependency and budget.

**Database Tables**:
| Table | Key columns |
|---|---|
| `water_vendors` | `society_id`, `name`, `rate_per_unit`, `unit (liter/tanker)` |
| `water_tanker_entries` | `society_id`, `vendor_id`, `quantity`, `tank_id (if multiple tanks)`, `cost`, `logged_by`, `entry_time` |

**Key APIs**: `POST /water-vendors`, `POST /water-tanker-entries`, `GET /societies/{id}/water/consumption-report?month=`.

**Validations**: Quantity and cost non-negative; cost auto-calculated server-side from `rate_per_unit × quantity` (not client-entered, to prevent tampering, though an override field with reason is allowed for negotiated one-off rates).

**Edge Cases**: Multiple tanks per society (per-tank consumption tracking); vendor rate change mid-month (historical entries retain the rate at time of entry, not the current rate).

**Security**: Cost data restricted to Accountant/Manager/Committee.

**Notifications**: Low-tank-level alert (if integrated with a future IoT sensor — see Section 7), monthly cost summary to Committee.

**Reports**: Monthly consumption trend, cost-per-month, vendor comparison (cost efficiency).

---

### Module 18 — Electricity Consumption Tracking

**Purpose**: Track common-area and (optionally, where sub-metered) per-flat electricity usage for billing transparency and cost analysis.

**Features**: Meter reading entry, monthly consumption computation, usage reports/graphs, bill correlation, analytics.

**User Flow**: Manager/Guard logs meter readings (common-area meters and, if the society has sub-metering, per-flat meters) on a schedule (monthly, or daily for IoT-ready future) → system computes consumption (delta between readings) → cost computed using the utility's slab-rate table → for sub-metered societies, per-flat electricity charge flows into Module 9's bill line items.

**Database Tables**:
| Table | Key columns |
|---|---|
| `electricity_meters` | `society_id`, `meter_number`, `type (common/flat)`, `flat_id (nullable)` |
| `meter_readings` | `meter_id`, `reading_value`, `reading_date`, `logged_by` |
| `electricity_rate_slabs` | `society_id`, `slab_from_units`, `slab_to_units`, `rate_per_unit`, `effective_from` |

**Key APIs**: `POST /meters`, `POST /meters/{id}/readings`, `GET /meters/{id}/consumption?from=&to=`, `GET /societies/{id}/electricity/summary`.

**Validations**: New reading must be ≥ previous reading unless flagged as a meter-reset/replacement event (a `meter_reset` boolean on the reading row handles rollovers).

**Edge Cases**: Meter replaced mid-cycle (reset flag prevents a false negative-consumption calculation); estimated reading when physical access isn't possible (an `is_estimated` flag, reconciled on the next actual reading).

**Security**: Consumption data tied to a flat is treated as resident-personal data — visible to that resident and Admin/Accountant only.

**Notifications**: Monthly consumption summary, unusually-high-consumption alert (possible leak/fault).

**Reports**: Society-wide consumption trend, per-flat consumption comparison (opt-in, privacy-respecting), cost breakdown by slab.

---

### Module 19 — Notification System

**Purpose**: The cross-cutting delivery layer every other module publishes events to — push, SMS, email, WhatsApp-ready — with templates, logs, and scheduling.

**Features**: Multi-channel dispatch (push/SMS/email/WhatsApp), template management (versioned, per-language-ready), delivery logs, scheduled/delayed sends, per-user channel preferences, quiet hours, priority bypass for emergencies.

**Architecture**: Every module emits a domain event (e.g., `visitor.arrived`, `bill.generated`, `complaint.sla_breached`) onto a **message queue** (see Section 9) rather than calling a notification API synchronously. A dedicated Notification Service consumes events, resolves the recipient(s) + their channel preferences + the right template, and dispatches via the appropriate provider adapter. This decoupling means a notification-provider outage (e.g., SMS gateway down) never blocks the module that triggered it (e.g., gate check-in still succeeds even if the SMS fails — it retries independently).

**Database Tables**:
| Table | Key columns |
|---|---|
| `notification_templates` | `code`, `channel`, `language`, `subject`, `body_template` |
| `notification_preferences` | `user_id`, `channel`, `category`, `enabled (bool)`, `quiet_hours_start/end` |
| `notification_logs` | `user_id`, `channel`, `template_code`, `payload`, `status (queued/sent/delivered/failed)`, `provider_ref`, `sent_at` |
| `notification_schedule` | `template_code`, `recipient_query`, `send_at`, `status` |

**Key APIs**: `POST /notifications/send` (internal, service-to-service), `GET /users/{id}/notification-preferences`, `PATCH /users/{id}/notification-preferences`, `GET /notifications/logs?user_id=`.

**Validations**: Emergency-category notifications ignore `quiet_hours` and `enabled=false` (safety override, disclosed in the privacy policy).

**Edge Cases**: Provider outage (SMS gateway down) — retried with exponential backoff, dead-letter queue after N attempts, alerting the platform ops team; WhatsApp opt-in required per Meta Business Policy before any WhatsApp send is attempted.

**Security**: Templates sanitized against injection (no raw user input concatenated into a WhatsApp/SMS template without escaping); provider API keys stored in a secrets manager (Section 12), never in code/config files.

**Reports**: Delivery-success rate per channel, cost-per-channel (SMS/WhatsApp are billed per message), bounce/failure analysis.

---

### Module 20 — Reports & Analytics Dashboard

**Purpose**: A cross-module reporting surface for Admin/Committee/Company Admin — the "why we chose this platform" retention driver.

**Features**: Revenue reports, occupancy, complaints, visitors, payments, attendance, electricity, water, parking — with charting and export (CSV/PDF).

**Architecture note**: Rather than each module hand-rolling its own report queries against the live transactional DB, high-volume/complex reports (gate logs, financial aggregates) are served from a **read replica** and, at scale, a periodically-refreshed **reporting/aggregation layer** (materialized views or a lightweight OLAP export) — see Section 9 (Tech Stack) and Section 10 (partitioning). This avoids reporting queries degrading gate-operation write performance.

**Database Tables**: This module is largely **read/aggregation** over other modules' tables; it introduces:
| Table | Key columns |
|---|---|
| `report_exports` | `society_id`, `report_type`, `requested_by`, `params (jsonb)`, `file_url`, `status` |
| `dashboard_widgets` | `user_id/role`, `widget_type`, `config (jsonb)` — for a configurable dashboard |

**Key APIs**: `GET /reports/financial-summary`, `GET /reports/visitor-trends`, `GET /reports/complaint-analytics`, `POST /reports/export`.

**Validations**: Export requests rate-limited per user (prevent scraping); large exports processed asynchronously with a download-ready notification rather than blocking the request.

**Edge Cases**: Company Admin requesting a cross-society rollup (aggregation must respect per-society data-residency/tenant-isolation rules, only summing societies the Company Admin actually manages).

**Security**: Every report query passes through the same ABAC row-level scoping as transactional APIs — a report is not a backdoor around tenant isolation.

**Reports**: (this module *is* the reports layer) — dashboards for Revenue, Occupancy, Complaints, Visitors, Payments, Attendance, Electricity, Water, Parking, each with trend charts and CSV/PDF export.

---

### Module 21 — Document Management

**Purpose**: Centralized, versioned document storage spanning resident docs, society docs, vehicle docs, identity proofs, and agreements — referenced by, but shared across, multiple modules above.

**Features**: Unified document store, version history, per-document-type retention/visibility policy, identity-proof handling with elevated security.

**Database Tables**:
| Table | Key columns |
|---|---|
| `documents` | `society_id`, `owner_type (resident/society/vehicle/staff)`, `owner_id`, `doc_type`, `file_url`, `version`, `is_sensitive (bool)`, `retention_expires_at` |
| `document_versions` | `document_id`, `version_number`, `file_url`, `uploaded_by`, `uploaded_at` |
| `document_access_log` | `document_id`, `accessed_by`, `accessed_at` — required for `is_sensitive=true` docs (ID proofs, police-verification) |

**Key APIs**: `POST /documents`, `GET /documents/{id}`, `GET /documents/{id}/versions`, `DELETE /documents/{id}` (soft delete + DPDP-erasure hard-delete path for explicit user requests).

**Validations**: File type/size allow-list; `is_sensitive` documents require MFA-reconfirmed access for non-owner viewers.

**Edge Cases**: Document-erasure request under DPDP (a hard-delete path exists specifically for this, bypassing normal soft-delete, with a compliance audit trail of the deletion itself).

**Security**: Sensitive documents stored in a separate encrypted bucket/prefix with stricter IAM policy; every access to a sensitive document is logged (`document_access_log`), not just writes.

**Reports**: Document-completeness report (e.g., % of residents with ID proof on file), sensitive-document access audit.

---

### Module 22 — Audit Logs

**Purpose**: Tamper-evident record of who did what, when — across user activity, admin activity, logins, API calls, and security events. This underpins trust for a financial + security product.

**Features**: User activity logs, admin activity logs, login logs (Module 1 overlap — `login_audit` feeds here), API request logs, security event logs, before/after change history.

**Database Tables**:
| Table | Key columns |
|---|---|
| `audit_logs` | `society_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `before_state (jsonb)`, `after_state (jsonb)`, `ip`, `user_agent`, `occurred_at` |
| `api_request_logs` | `request_id`, `user_id`, `method`, `path`, `status_code`, `latency_ms`, `occurred_at` (typically shipped to the logging stack, Section 9, rather than the primary DB, given volume) |

**Key APIs**: `GET /audit-logs?entity_type=&entity_id=&from=&to=` (Admin/Super Admin only), `GET /audit-logs/export`.

**Validations**: `audit_logs` rows are insert-only at the application layer; the DB role used by the app has no `UPDATE`/`DELETE` grant on this table, enforced at the database-permission level, not just application logic.

**Edge Cases**: High-write-volume tables (`api_request_logs`) are partitioned by month and shipped to the ELK stack rather than kept indefinitely in Postgres, to avoid the primary OLTP database becoming a logging sink (see Section 10, partitioning).

**Security**: This module is itself a security control — every sensitive action (role change, document access, financial adjustment, ledger reversal) must emit an `audit_logs` row; code review checklist (Section 21) includes "does this change require an audit entry."

**Reports**: Full activity trail export (for AGM disputes/legal requests), admin-action report (what did each Admin/Manager do this month), security-event summary (failed logins, permission-denied spikes).

---

## 7. Future-Ready Capability Hooks

None of the following are built in Phase 1. Each is listed with the specific architectural decision made *now* so it can be added later without a schema/service rewrite.

| Future Feature | Architectural Hook Built Now |
|---|---|
| **Marketplace / Local Vendors** | `vendors` entity already exists (Module 17-style pattern generalized); a `vendor_categories` and `vendor_listings` table can attach without touching core modules. Payment rails (Module 9's gateway integration) are reusable for vendor commerce. |
| **Community Chat** | Notification Service (Module 19) already models per-user delivery preferences and a message-queue backbone; a chat service can be added as a new microservice publishing to the same event bus, reusing identity/RBAC. |
| **Emergency SOS** | `emergency_alerts` table (Module 5) already exists with a generic `type` enum; SOS is simply a new alert type + a dedicated low-latency push path. |
| **Digital Intercom / Video Door Calling** | `gates` and `visitor_visits` (Module 4/5) are structured so a WebRTC signaling service can hook into the same "approval request" event that already exists for visitor approval — visual calling is an alternate transport for the same workflow. |
| **IoT Devices (water level, smart meters)** | Module 17 (water) and Module 18 (electricity) already separate "reading source" conceptually from "reading value" via `logged_by`; an IoT ingestion service can insert readings with `logged_by=system:iot_device_id` without schema change. |
| **Smart Locks** | `verification_method` enum already includes room for extension on `gate_logs`/`staff_attendance`; a lock-integration service publishes "unlock" events consumed by the same gate-log pipeline. |
| **Face Recognition (visitor/staff)** | `verification_method (qr/manual/biometric/facial)` enum is already present in Modules 4/5/7 for exactly this reason — a facial-recognition microservice would produce a `facial` verification event into the same log tables. |
| **AI Complaint Assistant / Triage** | Module 8's `complaint_categories` and routing rules are already data-driven (not hardcoded); an AI classifier can populate `category_id` and `priority` automatically, writing to the same fields a human would. |
| **AI Chatbot (resident support)** | Read-only API surface (Section 11) is already resource-oriented and RBAC/ABAC-scoped, which is exactly what an LLM-based agent needs as a tool-calling interface — no new API design required, only a new consumer. |
| **Resident Mobile App** | Backend is API-first (Section 9); mobile is simply a third client alongside Web and Desktop, consuming the same versioned REST API. |
| **Delivery Tracking (live location)** | `deliveries` table (Module 6) can add a `location_pings` child table without altering the core delivery lifecycle. |
| **Subscription Plans (SaaS monetization)** | `companies.plan_id` and `society_settings.feature_flags` (Module 2) already exist — a Billing microservice can meter usage and gate features via flags already read by the app. |
| **Multi-Society Management (Company Admin)** | Already first-class in Section 4/5's 4-tier hierarchy — not a future add-on but a Phase 1 data-model reality, exposed via UI later. |
| **White-Label** | `societies`/`companies` tables carry room for `branding (jsonb: logo_url, primary_color, app_name)`; theming is a frontend concern reading this config, no backend change needed. |

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | P95 API response < 300ms for read endpoints, < 800ms for write endpoints under nominal load; gate check-in flow (Module 5) must complete < 1.5s end-to-end including QR validation, since a guard has a physical queue of people. |
| **Scalability** | Horizontally scalable stateless API tier (add pods, not bigger boxes); database scales read traffic via replicas; designed to reach 10,000+ societies (~2–5M residents at ~200–500 units/society average) without architecture change — only capacity/sharding additions. |
| **Availability** | 99.9% uptime target for core APIs (gate/visitor/auth); the Guard Desktop app must degrade to an **offline-tolerant local queue** rather than going fully unavailable during backend/network outages (Module 5). |
| **Security** | See Section 12 in full — RBAC/ABAC, encryption at rest/in transit, OWASP Top 10 mitigations, secrets management. |
| **Reliability** | Idempotent write APIs for billing/booking (Section 11); message-queue-based retries for notification delivery; database transactions wrap all multi-table writes (e.g., payment + ledger + receipt). |
| **Backup** | Automated daily full DB backup + continuous WAL archiving for point-in-time recovery (target RPO ≤ 5 minutes); backups encrypted, stored cross-region. |
| **Disaster Recovery** | RTO ≤ 4 hours for full platform restore; documented, periodically drilled runbook (Section 16). |
| **Logging** | Structured JSON logs from every service, correlation-ID propagated end-to-end (client request → API → queue → notification), shipped to a central ELK stack. |
| **Monitoring** | Prometheus metrics (latency, error rate, saturation) + Grafana dashboards per service; alerting on SLO burn-rate, not just raw thresholds. |
| **Caching** | Redis for session/permission caching, amenity-availability caching (short TTL, invalidated on booking write), and rate-limit counters. |
| **Rate Limiting** | Per-user and per-IP limits on public/auth endpoints (OTP request, login) to prevent abuse; per-tenant limits on report-export to prevent noisy-neighbor impact in the SaaS model. |
| **Encryption** | TLS 1.2+ everywhere in transit; AES-256 at rest for object storage (documents/photos) and DB-level encryption for sensitive columns (ID proof numbers) using column-level encryption or a KMS-backed envelope-encryption pattern. |
| **Accessibility** | WCAG 2.1 AA target for the Web app (contrast ratios, keyboard navigation, screen-reader labels) — relevant given the explicit senior-citizen resident persona. |
| **SEO** | Marketing/public-facing pages (not the authenticated app) server-rendered (Next.js SSR) with proper meta tags, sitemap, structured data — relevant for the platform's own acquisition site, not the resident app itself. |
| **Responsive Design** | Mobile-first responsive breakpoints for the resident-facing web app (many residents will use it primarily on phones via browser before a native app exists). |
| **Offline Support** | Guard Desktop app: local write queue + background sync (Module 5). Resident web app: read-only cached last-known state for critical info (e.g., last bill amount) via service worker, not full offline write support (lower priority than the gate). |
| **Desktop Synchronization** | Desktop app (Electron/Tauri, Section 9) syncs via the same REST API as web, with a local SQLite queue table for offline-write buffering, reconciled via idempotency keys on reconnect. |

---

## 9. Technology Stack — Evaluation & Recommendation

### 9.1 Frontend (Web)

| Option | Pros | Cons |
|---|---|---|
| **React + Next.js** | Huge ecosystem, SSR/SSG for the public marketing site + SEO, large hiring pool in India, works well with component libraries (shadcn/ui, MUI) | Framework churn, needs discipline for large-app structure |
| Angular | Batteries-included, strong typing, good for large enterprise teams | Steeper learning curve, smaller Indian hiring pool than React, heavier bundle |
| Vue | Gentle learning curve, good docs | Smaller ecosystem/enterprise adoption than React in this market |

**Recommendation: React + Next.js.** Reason: the product needs both a marketing/SEO surface (public site) and a complex authenticated SPA (resident/admin portals) — Next.js's hybrid SSR/CSR model serves both from one codebase, and React's hiring pool in India is the deepest, which matters for a long-lived commercial product.

### 9.2 Desktop (Security Guard Kiosk / Admin)

| Option | Pros | Cons |
|---|---|---|
| **Electron** | Reuses the web codebase almost entirely (same React components), mature offline/local-DB story (better-sqlite3, electron-store), huge community | Larger binary/memory footprint |
| Tauri | Much smaller binary, Rust-backed security, lower resource use | Younger ecosystem, requires a Rust backend layer the team may not have skills for yet, less mature offline/local-storage tooling |
| Flutter Desktop | Single codebase if a Flutter mobile app is built later | Would fork the web codebase (different framework than Next.js), doubling UI maintenance |

**Recommendation: Electron.** Reason: the guard-kiosk app's core requirement is offline queueing + reusing web UI components rather than minimal footprint; Electron's maturity for local SQLite-backed offline queues (Module 5's critical requirement) outweighs Tauri's efficiency advantage at this stage. Revisit Tauri once the app's scope stabilizes and resource footprint becomes a real constraint on low-spec gate-house PCs.

### 9.3 Backend

| Option | Pros | Cons |
|---|---|---|
| **NestJS (Node.js/TypeScript)** | Same language as frontend (TypeScript everywhere — one hiring pool, shared types/DTOs), opinionated modular architecture out of the box (maps cleanly to our 22 modules), first-class support for queues/websockets/microservices | Node's CPU-bound-task limits (not a concern here — this is an I/O-bound CRUD+notification platform, not compute-heavy) |
| Spring Boot (Java) | Extremely mature, strong typing, great for large enterprise teams | Heavier boilerplate, slower dev velocity for a growing product, separate hiring pool from frontend |
| .NET | Strong tooling, good performance | Smaller open-source/startup mindshare in this specific market segment |
| Django (Python) | Fast CRUD scaffolding, good admin panel out of the box | Weaker at scale for a highly concurrent, event-driven, real-time-notification architecture without extra work (Channels/Celery) |
| Go | Excellent performance/concurrency | Slower development velocity for CRUD-heavy business logic, smaller pool of engineers experienced in modeling complex domain logic idiomatically |

**Recommendation: NestJS.** Reason: this product is dominated by CRUD + workflow + notification-fanout logic across 22 modules — NestJS's built-in module/DI system maps 1:1 to this document's module boundaries, TypeScript end-to-end reduces contract drift between frontend and backend (shared DTO types), and it has first-class, well-documented support for the message-queue and WebSocket needs (Modules 5, 19, real-time guard dashboards).

### 9.4 Database

| Option | Pros | Cons |
|---|---|---|
| **PostgreSQL** | Best-in-class JSONB (used extensively above for `feature_flags`, `target_audience`, `config`), native range/exclusion constraints (critical for Module 16's booking-overlap prevention), robust partitioning, row-level security (a natural fit for our ABAC tenant-isolation requirement), mature managed offerings (RDS/Cloud SQL/Supabase) | None significant for this use case |
| MySQL | Very mature, widely known | Weaker JSONB/range-type support, no native row-level security, would need application-layer-only tenant isolation |

**Recommendation: PostgreSQL.** Reason: two hard requirements in this document — Module 16's double-booking prevention via exclusion constraints, and Module 22's insert-only audit table enforced by DB permissions/row-level security — are natively strong in Postgres and comparatively awkward in MySQL.

### 9.5 Cache — **Redis.** Session/permission caching, availability caching, rate-limit counters, pub/sub for real-time guard-dashboard updates. No serious alternative considered; Redis is the de facto standard and NestJS has first-class support.

### 9.6 Message Queue

| Option | Pros | Cons |
|---|---|---|
| **RabbitMQ** | Simple mental model (routing/exchanges), great for our workload (task queues, event fanout to Notification Service), lower ops overhead | Lower raw throughput ceiling than Kafka |
| Kafka | Massive throughput, durable log/replay, great for analytics pipelines at huge scale | Operationally heavier (ZooKeeper/KRaft, partitioning strategy) — overkill for Phase 1–N's actual event volume |

**Recommendation: RabbitMQ for Phase 1–N**, with a documented migration path to Kafka if/when the platform scales into "millions of residents, real-time analytics pipeline" territory (Section 20 revisits this as a scaling risk). Reason: our event volume (notifications, gate logs) is high-frequency but not "firehose" scale yet, and RabbitMQ's lower operational complexity matches a growing team's capacity better.

### 9.7 Search — **Elasticsearch.** Used for resident/visitor/complaint free-text search and for the ELK logging stack (dual-purpose infrastructure investment). Considered Postgres full-text search as a lighter alternative for Phase 1 (fewer moving parts) — **recommend starting with Postgres full-text search (`tsvector`) for Phase 1–2 and introducing Elasticsearch only when logging-stack needs (Section 8) justify running it anyway**, to avoid operating two search technologies prematurely.

### 9.8 Storage — **AWS S3** (or S3-compatible, e.g., Cloudflare R2 for cost) for documents/photos, with signed URLs and a separate encrypted-bucket policy for sensitive documents (Module 21).

### 9.9 Authentication — JWT (RS256) + refresh-token rotation (Module 1), custom-built rather than a third-party auth-as-a-service (Auth0/Cognito) **recommended** because the platform's ABAC model (society/company/flat-scoped permissions) is domain-specific enough that a generic auth service would need heavy customization anyway — better to own it with a well-tested library (e.g., `@nestjs/passport` + `jsonwebtoken`) than pay per-MAU for a service that doesn't natively model "flat-scoped roles."

### 9.10 Containerization & Orchestration — **Docker** for all services; **Kubernetes** for production orchestration once the service count and scale justify it (recommend starting on a simpler managed container platform — e.g., AWS ECS/Fargate — for Phase 1–3, and graduating to Kubernetes when the team is running enough microservices, or needs enough fine-grained autoscaling, to justify its operational overhead).

### 9.11 Reverse Proxy — **NGINX** (or a managed ALB) in front of the API tier for TLS termination, rate limiting, and routing.

### 9.12 CI/CD — **GitHub Actions.** Reason: tightest integration with GitHub-hosted source, sufficient for this team size, avoids standing up/maintaining a separate Jenkins server.

### 9.13 Testing — Jest + Supertest (backend unit/integration), Playwright (E2E web), k6 (load/performance testing).

### 9.14 Monitoring & Logging — **Prometheus + Grafana** for metrics, **ELK (Elasticsearch, Logstash, Kibana)** for logs — reusing the Elasticsearch investment from 9.7.

### 9.15 Analytics — Product analytics via a lightweight event pipeline (e.g., PostHog, self-hostable — relevant for a company handling Indian resident data under DPDP) feeding the same event bus used for notifications.

### 9.16 Documentation — OpenAPI/Swagger auto-generated from NestJS decorators (single source of truth for API docs, Section 11), Docusaurus for developer/admin guides.

### 9.17 Recommended Combination (Summary)

```
Frontend:        React + Next.js (TypeScript)
Desktop:         Electron (reusing the React codebase)
Backend:         NestJS (Node.js/TypeScript), modular monolith at Phase 1,
                 extracted to microservices only where independent scaling matters
                 (Notification Service, later Reporting Service)
Database:        PostgreSQL (primary) + read replica(s)
Cache:           Redis
Queue:           RabbitMQ (→ Kafka later, if needed)
Search/Logging:  Postgres full-text search (Phase 1-2) → Elasticsearch (Phase 3+, ELK)
Storage:         AWS S3 (or R2)
Auth:            Custom JWT (RS256) + refresh rotation
Containers:      Docker; ECS/Fargate (Phase 1-3) → Kubernetes (scale-driven)
Reverse Proxy:   NGINX / ALB
CI/CD:           GitHub Actions
Monitoring:      Prometheus + Grafana
Testing:         Jest, Supertest, Playwright, k6
```

**Why a modular monolith first, not microservices from day one**: this document defines 22 modules, which invites "22 microservices" as a naive read. That would be a mistake at Phase 1 — it multiplies operational overhead (22 deployments, 22 sets of monitoring, distributed-transaction complexity for things like "book amenity + charge payment") before the team has proven product-market fit or real independent-scaling needs. NestJS's module system gives clean internal boundaries (each of the 22 modules above maps to a NestJS module) so the *code* is already service-shaped; extraction to a real microservice (Notification Service is the first good candidate, since it has genuinely different scaling/failure characteristics) becomes a refactor, not a rewrite, when justified by actual load data.

---

## 10. Database Design (ERD Explanation + Core Schemas)

### 10.1 Entity-Relationship Overview

**Master/lookup tables** (low row-count, rarely change, often global not tenant-scoped): `roles`, `permissions`, `complaint_categories` (global defaults), `notification_templates`.

**Core hierarchy tables** (the tenancy backbone): `companies` (1) → `societies` (N) → `towers` (N) → `flats` (N). One-to-many at each level. `societies.company_id` is nullable — a One-to-Many from Company to Society where a Society can also exist with no Company (self-managed).

**Bridge/many-to-many tables**: `user_roles` (bridges `users` ↔ `roles`, additionally scoped by `society_id`/`flat_id` — this is a "scoped bridge," richer than a plain M:N join), `role_permissions` (bridges `roles` ↔ `permissions`), `staff_flat_mapping` (bridges `domestic_staff` ↔ `flats`, M:N since one maid serves many flats and one flat may use many staff).

**Transaction tables** (high row-count, append-heavy): `visitor_visits`, `gate_logs`, `bills`, `payments`, `complaints`, `notification_logs`, `audit_logs`, `meter_readings`, `staff_attendance`. These dominate storage growth and are the partitioning candidates (10.4).

**One-to-One relationships**: `lease_details` to a `residents` row (a tenant's lease details are 1:1 with their resident record); `society_settings` to `societies` (1:1 configuration row).

### 10.2 Expected Row-Count Planning (for a mature multi-tenant deployment: 10,000 societies × ~300 flats average)

| Table | Estimated rows at scale | Growth pattern |
|---|---|---|
| `societies` | ~10,000 | Slow, linear with sales |
| `flats` | ~3,000,000 | One-time bulk-load per society onboarding |
| `users` | ~6,000,000 (2 residents/flat average incl. family) | Linear with flat growth |
| `visitor_visits` | ~500M+/year (150 visits/flat/year assumption) | Fast, unbounded — **primary partitioning target** |
| `gate_logs` | ~1B+/year | Fastest-growing table in the system — **partitioning mandatory** |
| `bills` | ~36M/year (3M flats × 12 months) | Predictable, linear |
| `payments` | ~40M/year | Linear with bills, plus retries |
| `complaints` | ~30M/year (assume ~10/flat/year) | Linear |
| `notification_logs` | ~2B+/year (multiple notifications per event, multiple channels) | Fastest after gate_logs — candidate to live outside Postgres entirely (a document store or the logging stack) once volume is proven |
| `audit_logs` | ~500M+/year | Partitioning mandatory; long retention for compliance |

### 10.3 Representative Core Table DDL

```sql
-- Tenancy backbone
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    plan_id UUID REFERENCES subscription_plans(id),
    billing_status VARCHAR(20) NOT NULL DEFAULT 'active',
    branding JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE societies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    geo_lat NUMERIC(9,6),
    geo_lng NUMERIC(9,6),
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    registration_number VARCHAR(100),
    branding JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_societies_company ON societies(company_id) WHERE deleted_at IS NULL;

CREATE TABLE flats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    tower_id UUID REFERENCES towers(id),
    floor_number INT,
    flat_number VARCHAR(20) NOT NULL,
    type VARCHAR(30),
    area_sqft NUMERIC(8,2),
    status VARCHAR(20) NOT NULL DEFAULT 'vacant',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (society_id, tower_id, flat_number)
);
CREATE INDEX idx_flats_society ON flats(society_id) WHERE deleted_at IS NULL;

-- Identity
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(15) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_verification',
    phone_verified_at TIMESTAMPTZ,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT chk_identity CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    role_id UUID NOT NULL REFERENCES roles(id),
    society_id UUID REFERENCES societies(id),
    flat_id UUID REFERENCES flats(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (user_id, role_id, society_id, flat_id)
);
CREATE INDEX idx_user_roles_lookup ON user_roles(user_id, society_id) WHERE deleted_at IS NULL;

-- Visitor Management (transaction table, partitioned — see 10.4)
CREATE TABLE visitor_visits (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    visitor_id UUID NOT NULL REFERENCES visitors(id),
    flat_id UUID NOT NULL REFERENCES flats(id),
    visit_type VARCHAR(20) NOT NULL,
    purpose VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    qr_code TEXT,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Billing (financial integrity: NUMERIC not FLOAT, currency alongside amount)
CREATE TABLE bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    flat_id UUID NOT NULL REFERENCES flats(id),
    billing_period DATE NOT NULL,
    amount_due NUMERIC(12,2) NOT NULL CHECK (amount_due >= 0),
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
    late_fee_applied NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (flat_id, billing_period)  -- idempotency: one bill per flat per period
);
CREATE INDEX idx_bills_society_status ON bills(society_id, status);

-- Amenity booking — exclusion constraint prevents overlap at the DB level
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE amenity_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amenity_id UUID NOT NULL REFERENCES amenities_master(id),
    flat_id UUID NOT NULL REFERENCES flats(id),
    booked_by UUID NOT NULL REFERENCES users(id),
    slot TSTZRANGE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    idempotency_key UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    EXCLUDE USING gist (amenity_id WITH =, slot WITH &&) WHERE (status = 'confirmed')
);

-- Audit — insert-only, enforced at the DB permission level
CREATE TABLE audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    society_id UUID REFERENCES societies(id),
    actor_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    before_state JSONB,
    after_state JSONB,
    ip INET,
    user_agent TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
-- REVOKE UPDATE, DELETE ON audit_logs FROM app_write_role;  (granted INSERT, SELECT only)
```

### 10.4 Partitioning Strategy

Tables partitioned by month (RANGE on a timestamp column), with automated partition creation via a scheduled job (e.g., `pg_partman`):
- `visitor_visits`, `gate_logs`, `notification_logs`, `audit_logs`, `meter_readings`, `staff_attendance`, `api_request_logs`.

Rationale: these are the tables in 10.2 with unbounded, fast growth. Monthly partitions keep index sizes manageable, allow cheap bulk-archival (detach + move old partitions to cold storage after a retention window, e.g., 24 months for gate logs, 7 years for financial/audit records per typical Indian compliance/AGM-record norms), and keep query planning fast since most operational queries (guard dashboard, "this month's activity") only touch the current partition.

### 10.5 Row-Level Security for Tenant Isolation

In addition to application-layer ABAC checks, Postgres **Row-Level Security (RLS)** policies are enabled on every `society_id`-scoped table as defense-in-depth:

```sql
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bills
  USING (society_id = current_setting('app.current_society_id')::UUID);
```

The application sets `app.current_society_id` (and, for platform/company-tier roles, a bypass role) per request/transaction. This means even a bug in application-layer query-building cannot leak one society's data into another's response — the database itself refuses to return rows outside the session's tenant scope.

---

## 11. API Design Standards & Endpoint Catalog

### 11.1 Conventions
- **Style**: REST resource-oriented (`/api/v1/{resource}`), JSON request/response. GraphQL is *not* recommended for Phase 1 — the domain is resource-CRUD-heavy with well-understood access patterns per screen, and REST + OpenAPI gives simpler caching, rate-limiting, and RBAC middleware than a GraphQL gateway would justify at this stage.
- **Versioning**: URI-based (`/api/v1/...`); breaking changes ship as `/api/v2/...` with the prior version maintained for a documented deprecation window (minimum 6 months), since Desktop kiosk apps may not auto-update as fast as the web app.
- **Authentication**: `Authorization: Bearer <JWT>` on every endpoint except those explicitly marked Public (OTP request/verify, webhook receivers, QR-invite resolution).
- **Pagination**: cursor-based (`?cursor=&limit=`) for high-volume lists (gate logs, notifications); offset-based (`?page=&page_size=`) acceptable for low-volume admin lists. Cursor pagination is mandated for any table identified in 10.2/10.4 as partitioned/high-growth, since offset pagination degrades badly on large tables.
- **Sorting/Filtering**: `?sort=field:asc|desc`, `?filter[field]=value`; filters are allow-listed per endpoint (never raw query passthrough) to prevent injection and to keep filterable columns indexed.
- **Errors**: RFC 7807 Problem+JSON style — `{ type, title, status, detail, instance, errors: [{field, message}] }` — consistent across all 22 modules so frontend error-handling is generic, not per-module.
- **Idempotency**: any state-changing endpoint that could plausibly be retried by a flaky client (payments, bookings, bill generation) accepts an `Idempotency-Key` header; the server stores the key + response for a window (24h) and replays the original response on duplicate submission.

### 11.2 Standard Response Envelope

```json
{
  "data": { },
  "meta": { "request_id": "uuid", "timestamp": "iso8601" },
  "pagination": { "next_cursor": "...", "has_more": true }
}
```

### 11.3 Representative Endpoint Catalog (full catalog is the OpenAPI spec deliverable, Section 19)

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/otp/request` | Public | Rate-limited |
| POST | `/api/v1/auth/otp/verify` | Public | Returns JWT pair |
| GET | `/api/v1/societies/{id}/flats` | Bearer | Cursor-paginated |
| POST | `/api/v1/visits/walk-in` | Bearer (Guard) | Idempotency-Key optional |
| POST | `/api/v1/visits/{id}/approve` | Bearer (Resident) | Push-triggered action |
| POST | `/api/v1/gate/scan` | Bearer (Guard) | < 1.5s SLA (Section 8) |
| POST | `/api/v1/complaints` | Bearer (Resident) | Multipart for attachments |
| PATCH | `/api/v1/complaints/{id}/status` | Bearer (Staff/Manager) | Triggers audit_logs entry |
| POST | `/api/v1/bills/generate` | Bearer (System/Cron) | Idempotent per (flat, period) |
| POST | `/api/v1/bills/{id}/pay` | Bearer (Resident) | Returns gateway session |
| POST | `/api/v1/webhooks/payment-gateway` | Public, signature-verified | HMAC signature required |
| POST | `/api/v1/amenities/{id}/bookings` | Bearer (Resident) | Idempotency-Key required |
| GET | `/api/v1/reports/financial-summary` | Bearer (Admin/Committee) | RLS-scoped, async for large ranges |
| GET | `/api/v1/audit-logs` | Bearer (Admin/Super Admin) | Insert-only source table |

### 11.4 Request/Response Example

```
POST /api/v1/complaints
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "flat_id": "b3f1...",
  "category_id": "c1a2...",
  "priority": "high",
  "description": "Water leakage in parking area B2"
}

201 Created
{
  "data": {
    "id": "d4e5...",
    "status": "open",
    "sla_due_at": "2026-07-15T14:00:00+05:30",
    "category": { "id": "c1a2...", "name": "Plumbing" }
  },
  "meta": { "request_id": "req_9f8...", "timestamp": "2026-07-14T10:00:00+05:30" }
}
```

### 11.5 Error Codes (representative)

| HTTP Status | Usage |
|---|---|
| 400 | Validation failure (field-level `errors[]` populated) |
| 401 | Missing/invalid/expired JWT |
| 403 | Valid JWT, insufficient RBAC/ABAC permission (e.g., Tenant querying another flat) |
| 404 | Resource not found or soft-deleted |
| 409 | Conflict (e.g., double-booking attempt, duplicate bill generation) |
| 422 | Semantically invalid (e.g., `lease_end` before `lease_start`) |
| 429 | Rate limit exceeded |
| 5xx | Server error — always logged with `request_id` for support correlation |

---

## 12. Security Architecture

| Control | Implementation |
|---|---|
| **RBAC** | Role → Permission mapping (Module 1 tables); coarse module/action gating at the API-gateway/middleware layer before a request reaches business logic. |
| **Permission Matrix** | Maintained as data (`role_permissions`), not hardcoded conditionals — allows Society Admins to customize Committee-Member sub-permissions without a code deploy. |
| **ABAC / Row-level scoping** | Every query additionally filtered by `society_id`/`flat_id` derived from the JWT claims, enforced twice: application-layer query builder AND Postgres RLS (Section 10.5) as defense-in-depth. |
| **JWT** | RS256 (asymmetric) access tokens, 15-minute expiry; resource servers verify with the public key only, so no shared-secret sprawl across services. |
| **Refresh Tokens** | Stored hashed (SHA-256), rotated on every use (old token invalidated the moment a new one is issued), device-bound, individually revocable ("sign out this device"). |
| **CSRF** | Not applicable to the Bearer-JWT API (no ambient cookie auth for state-changing calls); if a cookie-based session is ever introduced for the web app's SSR pages, double-submit-cookie CSRF tokens apply there specifically. |
| **XSS** | React's default output-escaping + a strict Content-Security-Policy header; all rich-text fields (complaint descriptions, notice bodies) sanitized server-side before storage, not just at render. |
| **SQL Injection** | ORM/query-builder with parameterized queries exclusively (NestJS + TypeORM/Prisma); no raw string-concatenated SQL anywhere in the codebase — enforced via lint rule + code review checklist. |
| **Rate Limiting** | Redis-backed sliding-window limiter at the gateway; stricter limits on public/unauthenticated endpoints (OTP, login) than authenticated ones. |
| **Password Hashing** | Argon2id (preferred) or bcrypt with a high work factor; OTP is the primary/encouraged login path given the Indian market, reducing password-related attack surface overall. |
| **Encryption** | TLS 1.2+ in transit everywhere; AES-256 at rest for S3 buckets; envelope encryption (KMS-backed) for specific sensitive columns (ID-proof numbers) rather than whole-table encryption, balancing security with query-ability. |
| **Secure Cookies** | If used at all (SSR marketing pages), `HttpOnly`, `Secure`, `SameSite=Strict`. |
| **HTTPS** | Enforced end-to-end; HSTS header on all responses. |
| **CORS** | Allow-list of known frontend origins only; no wildcard `*` in production. |
| **File Upload Validation** | Type allow-list (image/pdf for docs, image/video with size caps for complaint/event attachments), server-side re-validation of magic bytes (not just extension), antivirus scan hook (e.g., ClamAV) before a file is served back to other users. |
| **Audit Logs** | Insert-only at the DB-grant level (Section 10.3); every sensitive action (role change, financial adjustment, document access on `is_sensitive` docs) writes an entry. |
| **Account Lockout / Brute-Force Prevention** | Progressive backoff on failed login/OTP attempts (3 fails → 15-min lockout → exponential increase on repeat offenses), IP + account dual tracking to prevent both credential-stuffing and single-account harassment. |
| **OWASP Top 10** | Addressed via the controls above: A01 (Broken Access Control) → RBAC+ABAC+RLS; A02 (Crypto Failures) → TLS+AES+Argon2; A03 (Injection) → parameterized queries; A04 (Insecure Design) → this document's threat modeling; A05 (Security Misconfig) → infra-as-code with reviewed defaults; A06 (Vulnerable Components) → automated dependency scanning (Dependabot/Snyk) in CI; A07 (Auth Failures) → Module 1's OTP/lockout design; A08 (Data Integrity Failures) → signed webhook payloads, idempotency keys; A09 (Logging Failures) → Module 22; A10 (SSRF) → allow-listed outbound domains for any server-side fetch (e.g., webhook callbacks). |
| **Secrets Management** | AWS Secrets Manager / HashiCorp Vault — no secrets in code, `.env` files, or CI logs; rotated on a schedule and on suspected compromise. |
| **Data Residency / DPDP** | Since the primary market is India, hosting infra should default to an India region (e.g., AWS ap-south-1) for resident personal data, consistent with the assumed DPDP Act 2023 compliance baseline (Assumption 11). |

---

## 13. UI/UX & Design System Guidelines

- **Navigation**: Role-aware sidebar (Guard sees only Gate/Visitors/Emergency; Resident sees Home/Bills/Complaints/Amenities/Notices; Admin sees full module list) — the same shell renders different nav configs from the `role_permissions` data, not separate codebases.
- **Dashboard**: Widget-based home screen (Module 20's `dashboard_widgets`), so Committee members can pin the KPIs they personally care about (collections vs. complaints, e.g.).
- **Responsive Layout**: Mobile-first breakpoints; Guard kiosk UI is a distinct, larger-touch-target layout optimized for a tablet mounted at a gate, not a shrunk desktop view.
- **Dark Mode**: Supported via CSS variables/design tokens from day one (cheap to add early, expensive to retrofit).
- **Accessibility**: WCAG 2.1 AA — contrast ratios, focus states, ARIA labels, and a font-size control given the senior-citizen persona.
- **Color Palette & Typography**: Defined as design tokens (not hardcoded hex values in components) so white-label theming (Section 7) is a token-swap, not a re-skin.
- **Component Library**: shadcn/ui (Tailwind-based, unstyled-primitive approach) recommended over a heavier pre-styled kit (MUI/Ant) specifically because white-labeling and a distinctive brand (vs. looking like "another Ant Design app") matter for a commercial SaaS product.
- **Reusable Components**: A shared `packages/ui` workspace (Section 14) consumed by both the Web app and the Electron desktop app, since both are React.
- **Design System governance**: A component's props/API is reviewed the same as a backend API contract — breaking a shared component breaks two apps (web + desktop) at once.

## 14. Enterprise Folder Structures

### 14.1 Monorepo Layout (recommended overall strategy)

A **Turborepo/Nx-managed monorepo** is recommended over separate repos, because Frontend, Desktop, and Backend share TypeScript types (DTOs) and a `packages/ui` component library — separate repos would require publishing/versioning an internal npm package for every shared-type change, adding friction for a small-to-mid-size team.

```
society-platform/
├── apps/
│   ├── web/                 # Next.js resident/admin/committee app
│   ├── desktop/             # Electron guard-kiosk app
│   ├── api/                 # NestJS backend (modular monolith)
│   └── notification-service/ # First microservice extraction (Section 9.17)
├── packages/
│   ├── ui/                  # Shared React component library (design system)
│   ├── types/               # Shared DTO/TypeScript types (generated from OpenAPI)
│   ├── config/              # Shared ESLint/TSConfig/Prettier config
│   └── utils/                # Shared pure-function utilities (date/currency formatting)
├── infra/
│   ├── terraform/           # IaC: VPC, RDS, ECS/EKS, S3, IAM
│   ├── docker/               # Dockerfiles per app
│   └── k8s/                 # Kubernetes manifests (once graduated from ECS)
├── docs/                     # Docusaurus developer/admin/user guides
├── .github/workflows/        # CI/CD pipelines
└── turbo.json / nx.json
```

### 14.2 Backend (`apps/api`) — NestJS Module Structure

```
apps/api/src/
├── modules/
│   ├── auth/                 # Module 1
│   ├── society/              # Module 2
│   ├── resident/             # Module 3
│   ├── visitor/               # Module 4
│   ├── security-guard/        # Module 5
│   ├── delivery/              # Module 6
│   ├── domestic-staff/        # Module 7
│   ├── complaint/             # Module 8
│   ├── billing/               # Module 9
│   ├── parking/               # Module 10
│   ├── notice-board/          # Module 11
│   ├── event/                 # Module 12
│   ├── poll/                  # Module 13
│   ├── lost-found/            # Module 14
│   ├── inventory/             # Module 15
│   ├── amenity-booking/       # Module 16
│   ├── water-tanker/          # Module 17
│   ├── electricity/           # Module 18
│   ├── notification/          # Module 19 (thin proxy to notification-service)
│   ├── reports/               # Module 20
│   ├── document/              # Module 21
│   └── audit/                 # Module 22
├── common/
│   ├── guards/                # RBAC/ABAC guards, JWT strategy
│   ├── interceptors/           # Audit-log interceptor, response envelope
│   ├── filters/                 # RFC 7807 exception filter
│   └── decorators/
├── database/
│   ├── migrations/
│   └── seeds/
└── main.ts
```

Each module folder internally follows NestJS convention (`*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`, `entities/`) — this structure is intentionally 1:1 with Section 6's 22 modules so a new engineer can map "the document" directly to "the code."

### 14.3 Frontend (`apps/web`) — Next.js Structure

```
apps/web/src/
├── app/                       # Next.js App Router
│   ├── (auth)/                # login, otp, forgot-password
│   ├── (resident)/            # resident-scoped routes
│   ├── (admin)/                # society-admin/committee routes
│   └── (public)/               # marketing/SEO pages
├── components/                 # app-specific components (imports packages/ui for shared ones)
├── lib/
│   ├── api-client/              # generated from OpenAPI (packages/types)
│   └── hooks/
└── styles/
```

### 14.4 Desktop (`apps/desktop`) — Electron Structure

```
apps/desktop/
├── src/main/                  # Electron main process — local SQLite offline queue, sync logic
├── src/renderer/               # Reuses apps/web components where possible
└── src/preload/
```

## 15. Multi-Tenant SaaS Architecture

- **Isolation model**: Shared database, shared schema, tenant-scoped via `society_id` + Postgres RLS (Section 10.5) — chosen over "database-per-tenant" because 10,000+ societies as separate databases is an operationally unmanageable migration/backup story, and chosen over "schema-per-tenant" for the same reason at this scale. Row-level isolation with RLS gives strong isolation guarantees without the operational multiplication.
- **3-tier commercial hierarchy**: Platform (Super Admin) → Company (facility management firms, optional) → Society. A `companies` row is optional per society (Assumption 2), supporting both direct-to-society sales and B2B2C sales through management companies.
- **Feature flagging**: `society_settings.feature_flags` (JSONB) gates which of the 22 modules (and future hooks) are active per society/plan tier — e.g., a "Basic" plan society might not have Amenity Booking or Polls enabled.
- **Usage metering**: for future subscription billing (Section 7), a lightweight event (`society.active_flat_count`, `society.notification_volume`) feeds a Billing microservice — not built in Phase 1, but the event bus (Module 19) already carries the data needed.
- **Noisy-neighbor protection**: per-tenant rate limits (Section 8) and, at the database level, statement-timeout guards so one society's expensive report query cannot starve others sharing the same DB instance.
- **White-label**: `companies.branding`/`societies.branding` JSONB (logo, colors, app display name) read by the frontend at load time; a custom domain per Company Admin (CNAME) is a later, purely-infra addition (no data-model change).

---

## 16. DevOps & Deployment Architecture

- **Environments**: `local` (Docker Compose) → `staging` (mirrors prod, used for UAT) → `production`. Feature branches deploy ephemeral preview environments for QA.
- **Docker Compose (local dev)**: Postgres, Redis, RabbitMQ, MinIO (S3-compatible local storage), the NestJS API, and Next.js web app — one `docker-compose.yml` for a new engineer to be productive in under 30 minutes.
- **Environment Variables & Secrets**: `.env.example` committed (no real values); actual secrets injected at deploy time from AWS Secrets Manager, never committed, never logged (log-scrubbing middleware redacts known secret-shaped fields).
- **Production Deployment**: Blue-green or rolling deployment on ECS/Fargate (Phase 1-3) behind an ALB; database migrations run as a separate, gated CI step before traffic cutover, with an automated rollback path if migration or smoke tests fail.
- **Staging**: production-like data volume (anonymized snapshot) to catch performance regressions before they reach residents.
- **Backup**: automated nightly full backup + continuous WAL archiving (Section 8); backups tested via periodic restore drills, not just taken on faith.
- **Disaster Recovery**: documented runbook, RTO ≤ 4 hours, RPO ≤ 5 minutes (Section 8); cross-region backup replication.
- **SSL**: managed certificates (ACM) auto-renewed; HSTS enforced.
- **Reverse Proxy**: ALB/NGINX handles TLS termination, path-based routing to the API vs. static web assets, and basic WAF rules (rate limiting, known-bad-IP blocking) in front of the API tier.
- **Monitoring**: Prometheus scrapes service metrics; Grafana dashboards per module-critical-path (gate check-in latency, payment webhook success rate); PagerDuty/Opsgenie-style alerting on SLO burn.
- **Logging**: every service ships structured JSON logs to the ELK stack with a propagated `request_id`/`correlation_id`.
- **Scaling**: API tier scales horizontally (stateless, session state in Redis/JWT) via ECS/Kubernetes autoscaling on CPU + request-latency signals; database scales read traffic via replicas first, with partitioning (Section 10.4) delaying the need for sharding as long as possible.

## 17. Development Phases & Roadmap

| Phase | Focus | Key Deliverables |
|---|---|---|
| **Phase 0** | Architecture & Foundations | This document approved; monorepo scaffolded; CI/CD skeleton; Docker Compose local env; Terraform baseline (VPC, RDS, S3) |
| **Phase 1** | Authentication & Society Core | Module 1 (Auth/RBAC), Module 2 (Society/Flats), Module 3 (Residents) — nothing else works without these |
| **Phase 2** | Gate Operations | Module 4 (Visitor), Module 5 (Security Guard incl. offline queue), Module 6 (Delivery) — the highest-visibility, daily-use features |
| **Phase 3** | Financial Core | Module 9 (Billing), payment gateway integration, Module 22 (Audit — introduced early since finance needs it immediately) |
| **Phase 4** | Community & Operations | Module 7 (Domestic Staff), Module 8 (Complaints), Module 11 (Notice Board) |
| **Phase 5** | Facilities | Module 10 (Parking), Module 16 (Amenities Booking), Module 15 (Inventory) |
| **Phase 6** | Engagement | Module 12 (Events), Module 13 (Polls), Module 14 (Lost & Found) |
| **Phase 7** | Utilities & Reporting | Module 17 (Water), Module 18 (Electricity), Module 20 (Reports Dashboard) |
| **Phase 8** | Documents & Hardening | Module 21 (Document Management full version-history), Module 19 (Notification Service extraction to microservice), security audit/pen-test |
| **Phase 9** | SaaS Readiness | Company Admin tier UI, subscription/billing metering, white-label theming, multi-society rollup reporting |
| **Phase 10** | Production Launch | Load testing at target scale, DR drill, UAT sign-off, phased society onboarding (pilot → 10 → 100 → open) |
| **Phase 11+** | Future-Ready Features | Section 7 items, prioritized by customer demand (Resident Mobile App and AI Chatbot are typically the highest-ROI early picks) |

**Sequencing rationale**: Auth/Society/Resident (Phase 1) is the unavoidable dependency for every other module (a visitor visit needs a flat and a resident to notify). Gate Operations (Phase 2) is sequenced next — not Billing — because daily-use, highly-visible features (visitor management) drive adoption and habit formation faster than financial features, which residents interact with monthly. Billing (Phase 3) follows once there's a base of engaged users to bill. Audit (Module 22) is pulled into Phase 3 rather than its "natural" Phase 8 position because financial operations need an audit trail from the moment money starts moving, not retrofitted after the fact.

## 18. Testing Strategy

| Layer | Approach | Tooling |
|---|---|---|
| **Unit Testing** | Every service method, especially billing/late-fee math, SLA calculations, and permission-resolution logic | Jest |
| **Integration Testing** | Module-boundary tests hitting a real (test) Postgres instance — e.g., "generate bill → idempotent on retry" | Jest + Supertest + Testcontainers |
| **API Testing** | Contract tests against the OpenAPI spec, run in CI on every PR | Dredd / Schemathesis |
| **Performance Testing** | Gate check-in flow and bill-generation batch job benchmarked against Section 8's SLAs | k6 |
| **Load Testing** | Simulated peak load (e.g., festival-season visitor surge, month-start billing-generation spike) | k6 + a staging environment sized like production |
| **Security Testing** | Automated dependency scanning (Dependabot/Snyk) in CI; annual third-party penetration test before major scale milestones (Phase 9-10) | Snyk, OWASP ZAP, manual pen-test |
| **Automation Testing** | Critical user journeys (OTP login, visitor approval, bill payment, complaint lifecycle) as E2E suites, run on every deploy to staging | Playwright |
| **UAT** | Structured sign-off checklist per module with real Committee/Guard/Resident testers before each phase's production rollout | Manual, tracked in the project management tool |

---

## 19. Documentation Deliverables

| Document | Purpose | Owner |
|---|---|---|
| This SRS/Architecture Document | Master blueprint | Architect |
| API Documentation (OpenAPI/Swagger, auto-generated) | Frontend/backend/mobile contract | Backend team |
| Architecture Diagrams (C4 model: context/container/component) | Onboarding, DR planning | Architect |
| ER Diagram (generated from schema, e.g., via `dbdiagram.io` or `pg_dump` + a visualizer) | Database reference | Backend/DBA |
| Deployment Guide | Runbook for standing up/updating environments | DevOps |
| Developer Guide | Local setup, coding conventions, module-boundary rules | Tech Lead |
| Admin Guide | Full permission matrix, society-configuration walkthrough | Product/Support |
| User Guide (Resident/Guard/Committee variants) | End-user help content | Product |
| Testing Guide | How to run each test layer, coverage expectations | QA Lead |
| Release Notes | Per-deploy changelog, especially breaking API changes | Tech Lead |
| Security & Compliance Runbook | DPDP data-handling procedures, breach-response plan, DR drill log | Security Engineer |

## 20. Risks & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Gate operations halt during internet outage | High — physical security queue backs up | Offline-tolerant Guard Desktop with local queue + sync (Module 5, Section 8) |
| Double-booking / double-billing under concurrent requests | Medium — resident trust/financial dispute | DB-level exclusion constraints (Section 10.3) and idempotency keys (Section 11.1), not application-logic-only checks |
| Payment gateway webhook replay or loss | High — financial integrity | Idempotency on `gateway_ref`; reconciliation job cross-checking gateway records vs. `payments` table nightly |
| Tenant data leakage across societies | Critical — trust-ending for a SaaS product | Defense-in-depth: application ABAC + Postgres RLS (Section 10.5), not either alone |
| Notification-provider outage blocking core operations | Medium | Event-queue decoupling (Module 19) — a notification failure never blocks the triggering action |
| Rapid growth outpacing RabbitMQ/Postgres | Medium (multi-year horizon) | Documented migration path to Kafka and read-replica/sharding strategy (Section 9.6, 10.4); revisit at defined trigger metrics (e.g., >X messages/sec sustained) |
| Sensitive document (ID proof, police verification) exposure | Critical — legal/compliance | Separate encrypted bucket, access logging, MFA-reconfirm for non-owner access (Module 21) |
| Anonymous poll de-anonymization | Medium — governance trust | Structural separation of `poll_votes` (no voter_id) from `poll_eligibility` (Module 13) |
| Scope creep from 22-module ambition delaying launch | High — business risk | Phased roadmap (Section 17) ships Gate Operations + Billing (the highest-value modules) well before the full 22-module surface is complete |
| Vendor lock-in (payment gateway, SMS gateway) | Medium | Adapter/interface pattern in the Notification Service and Billing module so a provider swap is a config + adapter change, not a rewrite |

## 21. Final Development Checklist

- [ ] This document reviewed and signed off by Product, Engineering, and Security stakeholders
- [ ] Monorepo scaffolded with the folder structure in Section 14
- [ ] CI/CD pipeline running lint + unit tests on every PR (Section 9.12, 18)
- [ ] Local Docker Compose environment functional for a new engineer in < 30 minutes
- [ ] Terraform baseline provisioned (VPC, RDS Postgres with RLS enabled, S3, Secrets Manager)
- [ ] Module 1 (Auth/RBAC/ABAC) implemented and security-reviewed before any other module builds on it
- [ ] Every table from Section 10 created via versioned migrations (no manual schema edits in any environment)
- [ ] Partitioning (Section 10.4) configured on all identified high-growth tables before first production data lands, not retrofitted later
- [ ] Row-Level Security policies verified with a cross-tenant-leakage test suite (deliberately try to read another society's data and confirm it's blocked)
- [ ] OpenAPI spec generated and published as the frontend/backend contract source of truth
- [ ] Notification Service event-contract documented (what events exist, what payload each carries) before modules start publishing to it
- [ ] Offline-queue sync logic on the Guard Desktop app tested against real network-flakiness scenarios, not just the happy path
- [ ] Payment webhook signature verification and idempotency tested against replay/duplicate scenarios
- [ ] Load test against Section 8's SLAs completed before Phase 10 production launch
- [ ] DR restore drill completed successfully at least once before production launch
- [ ] Security/pen-test completed before Phase 9-10 scale-up
- [ ] All Section 19 documentation deliverables drafted (even if v1/incomplete) before external UAT begins

---

*End of Document. This SRS is intended to be a living document — revise it as Phase 0 architecture decisions are validated or challenged during implementation, but any deviation from the data model, tenancy model, or security architecture in Sections 10, 12, and 15 should be treated as an architecture-review event, not a casual code-review comment, given how expensive those particular decisions are to reverse after real tenant data exists.*
