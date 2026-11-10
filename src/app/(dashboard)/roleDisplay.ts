import type { Role } from "@/lib/auth/roles";

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR: "HR",
  MARKETING_HEAD: "Marketing Head",
  PRE_SALES: "Pre-sales",
  SALESPERSON: "Salesperson",
};

// Each role gets one consistent accent wherever it's shown (sidebar, table,
// filters) so the color itself becomes a recognizable shorthand for the role.
export const ROLE_BADGE_CLASSES: Record<Role, string> = {
  SUPER_ADMIN: "bg-violet-50 text-violet-700",
  HR: "bg-amber-50 text-amber-700",
  MARKETING_HEAD: "bg-sky-50 text-sky-700",
  PRE_SALES: "bg-teal-50 text-teal-700",
  SALESPERSON: "bg-rose-50 text-rose-700",
};

// Falls back to a Title Case conversion (e.g. "BUSINESS_DEV_LEAD" ->
// "Business Dev Lead") for any role not in the static map above — so a
// raw DB role key never leaks into the UI as-is (e.g. in chat's roster).
export function formatRoleLabel(role: string): string {
  if (role in ROLE_LABELS) return ROLE_LABELS[role as Role];
  return role
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
