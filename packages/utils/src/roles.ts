/** Mirrors apps/api's roles seed catalog (SRS §5.2) — kept in sync by hand since the API only ever sends role codes, never names. */
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Company Admin',
  society_admin: 'Society Admin',
  society_manager: 'Society Manager',
  committee_member: 'Committee Member',
  accountant: 'Accountant',
  security_guard: 'Security Guard',
  flat_owner: 'Owner',
  tenant: 'Tenant',
  family_member: 'Family Member',
  domestic_staff: 'Domestic Staff',
  vendor: 'Vendor',
  delivery_agent: 'Delivery Agent',
  visitor_guest: 'Visitor / Guest',
};

function titleCaseFallback(code: string): string {
  return code
    .split(/[_-]/)
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Never let a raw snake_case role code reach the UI — falls back to a title-cased guess for anything not in the map. */
export function formatRoleName(code: string): string {
  return ROLE_LABELS[code] ?? titleCaseFallback(code);
}
