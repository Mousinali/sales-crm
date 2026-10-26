import type { Role } from "../../lib/auth/roles";

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

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
