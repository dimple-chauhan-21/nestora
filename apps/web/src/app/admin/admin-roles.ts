/**
 * The role-code allow-list that gates entry to `/admin` as a whole —
 * Society Admin/Manager/Committee Member/Accountant, the society-tier roles
 * this console is for (deliberately excludes security_guard, also
 * society-tier, which has its own guard-kiosk surface in apps/desktop).
 * No single permission string is shared across all four roles (confirmed
 * against the seed data), so this is a role-code check, not a permission
 * check — section-level UI within `/admin` narrows further by `me.permissions`.
 */
export const ADMIN_CONSOLE_ROLES = ['society_admin', 'society_manager', 'committee_member', 'accountant'] as const;

export type AdminConsoleRole = (typeof ADMIN_CONSOLE_ROLES)[number];

export function isAdminConsoleRole(roles: string[]): boolean {
  return roles.some((role) => (ADMIN_CONSOLE_ROLES as readonly string[]).includes(role));
}
