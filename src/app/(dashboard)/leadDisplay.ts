import type { LeadStatus, LeadPriority } from "@/lib/leads/types";
import type { VisitStatus } from "@/lib/visits/types";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  PENDING_REVIEW: "Pending review",
  MORE_INFO_REQUIRED: "More information required",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  REJECTED: "Rejected",
  ON_HOLD: "On hold",
  CLOSED_WON: "Closed — won",
  CLOSED_LOST: "Closed — lost",
};

export const LEAD_STATUS_BADGE_CLASSES: Record<LeadStatus, string> = {
  NEW: "bg-zinc-100 text-zinc-600",
  PENDING_REVIEW: "bg-amber-50 text-amber-700",
  MORE_INFO_REQUIRED: "bg-teal-50 text-teal-700",
  QUALIFIED: "bg-sky-50 text-sky-700",
  CONVERTED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
  ON_HOLD: "bg-zinc-100 text-zinc-600",
  CLOSED_WON: "bg-emerald-50 text-emerald-700",
  CLOSED_LOST: "bg-rose-50 text-rose-700",
};

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const LEAD_PRIORITY_BADGE_CLASSES: Record<LeadPriority, string> = {
  LOW: "bg-zinc-100 text-zinc-600",
  MEDIUM: "bg-sky-50 text-sky-700",
  HIGH: "bg-rose-50 text-rose-700",
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
  MISSED: "Missed",
};

export const VISIT_STATUS_BADGE_CLASSES: Record<VisitStatus, string> = {
  SCHEDULED: "bg-sky-50 text-sky-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  RESCHEDULED: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-zinc-100 text-zinc-600",
  MISSED: "bg-rose-50 text-rose-700",
};
