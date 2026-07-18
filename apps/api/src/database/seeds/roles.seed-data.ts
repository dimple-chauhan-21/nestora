/**
 * SRS §5.2 roles catalog (14 roles). `tier` here is constrained to the DB's
 * 4-value column (platform/company/society/unit) per §5.1's stated design
 * ("4-tier tenancy is required..."), which is coarser than §5.2's descriptive
 * "Tier" column (Platform/Company/Society/Gate/Unit/Unit-mapped/Transient).
 * Mapping: Gate -> society (guard belongs to a society), Unit-mapped -> unit,
 * Transient (Delivery Agent, Visitor/Guest) -> society (visit-scoped within a
 * society's gate operations, no persistent tier of their own yet).
 */
export interface RoleSeed {
  code: string;
  name: string;
  tier: 'platform' | 'company' | 'society' | 'unit';
}

export const ROLES: RoleSeed[] = [
  { code: 'super_admin', name: 'Super Admin', tier: 'platform' },
  { code: 'company_admin', name: 'Company Admin', tier: 'company' },
  { code: 'society_admin', name: 'Society Admin', tier: 'society' },
  { code: 'society_manager', name: 'Society Manager', tier: 'society' },
  { code: 'committee_member', name: 'Committee Member', tier: 'society' },
  { code: 'accountant', name: 'Accountant', tier: 'society' },
  { code: 'security_guard', name: 'Security Guard', tier: 'society' },
  { code: 'flat_owner', name: 'Flat Owner', tier: 'unit' },
  { code: 'tenant', name: 'Tenant', tier: 'unit' },
  { code: 'family_member', name: 'Family Member', tier: 'unit' },
  { code: 'domestic_staff', name: 'Domestic Staff (Maid/Driver/Cook/Cleaner/Caretaker)', tier: 'unit' },
  { code: 'vendor', name: 'Vendor', tier: 'society' },
  { code: 'delivery_agent', name: 'Delivery Agent', tier: 'society' },
  { code: 'visitor_guest', name: 'Visitor / Guest', tier: 'society' },
];

/**
 * Only auth + the modules actually built so far (society, resident, visitor,
 * security-guard) — nothing for modules 6-22, seeded when each lands.
 * `resident:create` was added alongside the pre-existing four in the
 * society/resident session; this session adds `visitor:*`,
 * `security-guard:manage`, and `gate:*`/`emergency:raise` as their own
 * module namespaces (not sub-actions of security-guard:manage — a guard's
 * `gate:scan` grant doesn't come from `security-guard:manage` implying it,
 * since PermissionGuard's manage-implies-any-action rule only reaches
 * within the same module prefix).
 */
export interface PermissionSeed {
  code: string;
  module: string;
  action: string;
}

export const PERMISSIONS: PermissionSeed[] = [
  { code: 'auth:manage', module: 'auth', action: 'manage' },
  { code: 'society:manage', module: 'society', action: 'manage' },
  { code: 'society:read', module: 'society', action: 'read' },
  { code: 'resident:manage', module: 'resident', action: 'manage' },
  { code: 'resident:read', module: 'resident', action: 'read' },
  { code: 'resident:create', module: 'resident', action: 'create' },
  { code: 'visitor:manage', module: 'visitor', action: 'manage' },
  { code: 'visitor:read', module: 'visitor', action: 'read' },
  { code: 'visitor:approve', module: 'visitor', action: 'approve' },
  { code: 'security-guard:manage', module: 'security-guard', action: 'manage' },
  { code: 'gate:scan', module: 'gate', action: 'scan' },
  { code: 'gate:checkin', module: 'gate', action: 'checkin' },
  { code: 'emergency:raise', module: 'emergency', action: 'raise' },
  { code: 'billing:manage', module: 'billing', action: 'manage' },
  { code: 'billing:read', module: 'billing', action: 'read' },
  { code: 'billing:pay', module: 'billing', action: 'pay' },
  { code: 'audit:read', module: 'audit', action: 'read' },
  { code: 'domestic-staff:manage', module: 'domestic-staff', action: 'manage' },
  { code: 'domestic-staff:read', module: 'domestic-staff', action: 'read' },
  { code: 'complaint:manage', module: 'complaint', action: 'manage' },
  { code: 'complaint:read', module: 'complaint', action: 'read' },
  { code: 'complaint:create', module: 'complaint', action: 'create' },
  { code: 'complaint:comment', module: 'complaint', action: 'comment' },
  { code: 'notice-board:manage', module: 'notice-board', action: 'manage' },
  { code: 'notice-board:read', module: 'notice-board', action: 'read' },
  { code: 'parking:manage', module: 'parking', action: 'manage' },
  { code: 'parking:read', module: 'parking', action: 'read' },
  { code: 'amenity-booking:manage', module: 'amenity-booking', action: 'manage' },
  { code: 'amenity-booking:read', module: 'amenity-booking', action: 'read' },
  { code: 'amenity-booking:book', module: 'amenity-booking', action: 'book' },
  { code: 'inventory:manage', module: 'inventory', action: 'manage' },
  { code: 'inventory:read', module: 'inventory', action: 'read' },
  { code: 'delivery:manage', module: 'delivery', action: 'manage' },
  { code: 'delivery:read', module: 'delivery', action: 'read' },
];

/**
 * Role -> permission codes, per SRS §5.3's representative matrix rows
 * ("Onboard/configure a society", "Manage flats/residents/roles"), restricted
 * to the 6 permissions above. Roles not listed here get zero permissions —
 * that's intentional, not an oversight (e.g. Security Guard: gate/visitor
 * permissions don't exist yet, so it gets none; Accountant/Family
 * Member/Domestic Staff/Vendor/Delivery Agent/Visitor-Guest: the matrix's ✅
 * cells for their capabilities are all in unbuilt modules, e.g. billing,
 * complaint, amenity-booking, so none of the current permissions apply to
 * them either).
 *
 * `auth:manage` (administer roles/user_roles assignments) is treated as a
 * platform/company-tier capability — reserved for Super Admin/Company Admin,
 * distinct from Society Admin/Manager's society-scoped "manage flats/
 * residents/roles" grant (which the matrix bundles into resident:manage
 * here).
 *
 * Flat Owner gets `resident:manage` — the SRS's "Self-unit" cell in §5.3
 * isn't a *weaker* permission than Admin's, it's the *same* RBAC grant
 * narrowed by ABAC: an Owner's `user_roles` row is created with this
 * specific flat_id (not null), so PermissionsService/TenantScopeInterceptor
 * resolve their JWT's tenantScope.flatId to that one flat, and every
 * resident-module query scopes to it (see tenant-scope.util.ts). An Owner
 * is the root authority for their unit (§5.4) — inviting tenants, adding
 * family/vehicles/pets/documents, triggering move-out — all "manage"-level
 * actions, just row-scoped to one flat instead of the whole society.
 *
 * Tenant gets `resident:read` + `resident:create` (not `:manage`) — can see
 * their unit's residents and add family members, but not the fuller
 * management surface (e.g. removing the Owner's own records) that a
 * flat's root authority has.
 *
 * Visitor module, per §5.3's "Approve visitors" row: Super/Company/Society
 * Admin and Manager ✅ (society-wide), Guard "check-in only" (handled via
 * separate `gate:*` grants, not `visitor:manage`), Owner/Tenant ✅ "(own
 * flat)" — both get `visitor:manage`, ABAC-narrowed to their flat exactly
 * like `resident:manage` (ability to create guest invites and
 * approve/reject walk-ins for their own unit). Committee gets `visitor:read`
 * (view-only, same pattern as their resident-module grant).
 *
 * Security Guard gets `visitor:manage` too — not because a guard "owns" a
 * flat, but because a guard's `user_roles` row is society-wide (flat_id
 * null), same shape as Admin/Manager, so it resolves to society-wide visitor
 * scope: a guard registers walk-ins for *any* flat in their society. Plus
 * their own module's `security-guard:manage`, `gate:scan`, `gate:checkin`,
 * `emergency:raise`.
 *
 * Billing, per §5.3's "Generate/view bills" and "Approve expenses/ledger
 * entries" rows: Super/Company/Society Admin and Manager ✅ (society-wide
 * `billing:manage` — generate bills, record offline payments, adjust
 * plans), Accountant ✅ (bookkeeper role — `billing:manage`, its first real
 * grant in this codebase; every earlier session left it at zero permissions
 * because no financial module existed yet), Committee "View" (`billing:read`
 * only), Owner/Tenant "View own" (`billing:read`, ABAC-narrowed to their
 * flat the same way as resident/visitor) plus `billing:pay` — they're the
 * ones actually paying their own bills, a capability the matrix's "View
 * own" cell implies even though it doesn't spell out the write.
 *
 * `audit:read` is deliverable #9's explicit "Admin/Committee only" — Guard,
 * Accountant, Owner, and Tenant do not get it even though some have other
 * financial/operational permissions; audit trail visibility is a distinct,
 * narrower grant than the ability to act.
 *
 * Domestic Staff, per §6 Module 7's user flow ("Society Admin or Owner
 * onboards staff"): Super/Company/Society Admin and Manager get
 * `domestic-staff:manage` society-wide. Owner/Tenant also get
 * `domestic-staff:manage`, ABAC-narrowed to their own flat (same
 * resident:manage/visitor:manage pattern) — they can onboard staff, manage
 * the flat-mapping, and upload a police-verification document. Police-
 * verification *read* access (and the ability to set verification status)
 * is additionally gated inside DomesticStaffService by a society-wide-scope
 * check, not a separate permission — deliverable #4's "not even the flat
 * the staff serves" is enforced there, since `:manage` alone isn't narrow
 * enough to express that exclusion. Committee gets `domestic-staff:read`
 * (view-only, same pattern as their other module grants).
 *
 * Complaint, per deliverable #8's explicit instruction: Super/Company/
 * Society Admin and Manager get `complaint:manage` (assign, change status,
 * society-wide read). Committee gets `complaint:read` only. Owner/Tenant get
 * `complaint:create` + `complaint:read` + `complaint:comment`, ABAC-narrowed
 * to their own flat's complaints — "create + read own, not society-wide,"
 * exactly as specified. `complaint:manage` is intentionally withheld from
 * Owner/Tenant: assigning/resolving complaints is a Manager action per §8's
 * user flow, not something a resident's own-flat scope should reach.
 *
 * Notice Board: Super/Company/Society Admin, Manager, and Committee get
 * `notice-board:manage` (draft/publish, read-reports) — §11's own flow has
 * "Admin/Committee drafts a notice." Owner/Tenant get `notice-board:read`
 * only (view + mark-read), matching a resident's role in this module.
 *
 * Parking: Super/Company/Society Admin and Manager get `parking:manage`
 * (define slots, allocate, resolve violations). Committee also gets
 * `parking:manage`, not just `:read` — §10's own Security note explicitly
 * authorizes Committee to resolve violations ("only Manager/Committee can
 * resolve violations"), a manage-level action, so a narrower grant would
 * leave them unable to do what the SRS says they can. Owner/Tenant/Guard
 * get `parking:read` — deliverable #5 specifies only two parking
 * permissions total, so "any resident/guard" reporting a violation (§10's
 * own Edge Cases wording) is treated as `parking:read`-level, not folded
 * into a nonexistent third permission. Visitor-pool allocation at gate
 * check-in needs no parking permission of its own — it's a side effect
 * inside GateService, already gated by the guard's existing
 * `gate:scan`/`gate:checkin` grants.
 *
 * Amenity Booking: Super/Company/Society Admin and Manager get
 * `amenity-booking:manage` (define rules, cancel any booking — `:manage`
 * implies `:read`/`:book` in the same module via PermissionGuard's
 * existing rule, so no separate grant is needed for them to book too).
 * Committee gets `amenity-booking:read` (view calendars/utilization, no
 * booking capability of their own). Owner/Tenant get `amenity-booking:read`
 * + `amenity-booking:book`, ABAC-narrowed to their own flat — they browse
 * availability and book/cancel for their own unit, never another flat's.
 *
 * Inventory, per §15's explicit "Purchase-cost data restricted to
 * Accountant/Committee/Admin roles, not general residents": this reuses
 * billing's plain grant-shaped pattern (permission held = full record
 * visible, cost included) rather than a field-filtering mechanism like
 * domestic-staff's police-verification scope check — there's no resident-
 * facing use case for the asset registry at all (every Key API in §15 is
 * Manager-initiated), so Owner/Tenant simply get neither `inventory:manage`
 * nor `inventory:read`. Super/Company/Society Admin, Manager, and
 * Accountant get `inventory:manage`; Committee gets `inventory:read` — the
 * exact "Accountant/Committee/Admin" set §15 names, and nobody outside it
 * can reach the endpoints that return cost fields at all.
 *
 * Delivery (§6 Module 6): Super/Company/Society Admin and Manager get
 * `delivery:manage` for oversight. Security Guard gets `delivery:manage`
 * too — same reasoning as their `visitor:manage` grant: a guard's
 * `user_roles` row is society-wide (flat_id null), so it resolves to
 * "log/verify/update deliveries for any flat in this society," matching
 * §6's own user flow ("Guard logs agent... on handover confirmation,
 * status moves to..."). Owner/Tenant get `delivery:read` only, ABAC-narrowed
 * to their own flat — residents view their deliveries' status but never log
 * or verify handover themselves, that's the guard's action per the SRS
 * flow, not theirs. Committee gets `delivery:read` for the same
 * view-only pattern as every other module.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [
    'auth:manage',
    'society:manage',
    'resident:manage',
    'visitor:manage',
    'security-guard:manage',
    'billing:manage',
    'audit:read',
    'domestic-staff:manage',
    'complaint:manage',
    'notice-board:manage',
    'parking:manage',
    'amenity-booking:manage',
    'inventory:manage',
    'delivery:manage',
  ],
  company_admin: [
    'auth:manage',
    'society:manage',
    'resident:manage',
    'visitor:manage',
    'security-guard:manage',
    'billing:manage',
    'audit:read',
    'domestic-staff:manage',
    'complaint:manage',
    'notice-board:manage',
    'parking:manage',
    'amenity-booking:manage',
    'inventory:manage',
    'delivery:manage',
  ],
  society_admin: [
    'society:manage',
    'resident:manage',
    'visitor:manage',
    'security-guard:manage',
    'billing:manage',
    'audit:read',
    'domestic-staff:manage',
    'complaint:manage',
    'notice-board:manage',
    'parking:manage',
    'amenity-booking:manage',
    'inventory:manage',
    'delivery:manage',
  ],
  society_manager: [
    'resident:manage',
    'visitor:manage',
    'security-guard:manage',
    'billing:manage',
    'audit:read',
    'domestic-staff:manage',
    'complaint:manage',
    'notice-board:manage',
    'parking:manage',
    'amenity-booking:manage',
    'inventory:manage',
    'delivery:manage',
  ],
  committee_member: [
    'resident:read',
    'visitor:read',
    'billing:read',
    'audit:read',
    'domestic-staff:read',
    'complaint:read',
    'notice-board:manage',
    'parking:manage',
    'amenity-booking:read',
    'inventory:read',
    'delivery:read',
  ],
  security_guard: [
    'visitor:manage',
    'security-guard:manage',
    'gate:scan',
    'gate:checkin',
    'emergency:raise',
    'parking:read',
    'delivery:manage',
  ],
  accountant: ['billing:manage', 'inventory:manage'],
  flat_owner: [
    'resident:manage',
    'visitor:manage',
    'billing:read',
    'billing:pay',
    'domestic-staff:manage',
    'complaint:create',
    'complaint:read',
    'complaint:comment',
    'notice-board:read',
    'parking:read',
    'amenity-booking:read',
    'amenity-booking:book',
    'delivery:read',
  ],
  tenant: [
    'resident:read',
    'resident:create',
    'visitor:manage',
    'billing:read',
    'billing:pay',
    'domestic-staff:manage',
    'complaint:create',
    'complaint:read',
    'complaint:comment',
    'notice-board:read',
    'parking:read',
    'amenity-booking:read',
    'amenity-booking:book',
    'delivery:read',
  ],
};
