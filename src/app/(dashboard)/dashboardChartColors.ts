import type { LeadStatus, LeadPriority } from "@/lib/leads/types";
import type { Role } from "@/lib/auth/roles";
import { LEAD_STATUS_LABELS, LEAD_PRIORITY_LABELS } from "@/app/(dashboard)/leadDisplay";
import { ROLE_LABELS } from "@/app/(dashboard)/roleDisplay";
import type { BarDatum } from "@/components/ui/BarChart";
import { hashColorHex } from "@/components/ui/hashColor";

// Hex equivalents of the exact Tailwind classes already used for these
// categories' badges elsewhere (leadDisplay.ts, roleDisplay.ts) — so a
// dashboard bar and a status/priority/role badge always mean the same
// color for the same value, instead of inventing a second palette.
const LEAD_STATUS_HEX: Record<LeadStatus, string> = {
  NEW: "#71717a",
  PENDING_REVIEW: "#d97706",
  MORE_INFO_REQUIRED: "#0d9488",
  QUALIFIED: "#0284c7",
  CONVERTED: "#059669",
  REJECTED: "#e11d48",
  ON_HOLD: "#71717a",
  CLOSED_WON: "#059669",
  CLOSED_LOST: "#e11d48",
};

const LEAD_PRIORITY_HEX: Record<LeadPriority, string> = {
  LOW: "#71717a",
  MEDIUM: "#d97706",
  HIGH: "#cf362a",
};

const ROLE_HEX: Record<Role, string> = {
  SUPER_ADMIN: "#7c3aed",
  HR: "#d97706",
  MARKETING_HEAD: "#0284c7",
  PRE_SALES: "#0d9488",
  SALESPERSON: "#e11d48",
};

export function leadStatusBarData(counts: Record<string, number>): BarDatum[] {
  return Object.entries(counts).map(([key, value]) => ({
    label: LEAD_STATUS_LABELS[key as LeadStatus] ?? key,
    value,
    color: LEAD_STATUS_HEX[key as LeadStatus] ?? "#71717a",
  }));
}

export function leadPriorityBarData(counts: Record<string, number>): BarDatum[] {
  return Object.entries(counts).map(([key, value]) => ({
    label: LEAD_PRIORITY_LABELS[key as LeadPriority] ?? key,
    value,
    color: LEAD_PRIORITY_HEX[key as LeadPriority] ?? "#71717a",
  }));
}

export function roleBarData(counts: Record<string, number>): BarDatum[] {
  return Object.entries(counts).map(([key, value]) => ({
    label: ROLE_LABELS[key as Role] ?? key,
    value,
    color: ROLE_HEX[key as Role] ?? "#71717a",
  }));
}

// Owner names already have an established per-person color elsewhere (the
// Avatar initials circle) — reusing the same hash keeps a given person's
// bar and their avatar the same hue.
export function ownerBarData(counts: Record<string, number>): BarDatum[] {
  return Object.entries(counts).map(([name, value]) => ({ label: name, value, color: hashColorHex(name) }));
}
