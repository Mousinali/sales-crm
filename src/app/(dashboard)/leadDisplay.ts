import type { LeadStatus, LeadPriority, LeadBudgetType, LeadSource } from "@/lib/leads/types";
import type { VisitStatus } from "@/lib/visits/types";
import type { LeadActivityType } from "@/lib/leads/activities";

export const LEAD_ACTIVITY_DISPLAY: Record<LeadActivityType, { label: string; icon: string; iconClass: string }> = {
  NOTE: { label: "Note", icon: "ri-sticky-note-line", iconClass: "bg-zinc-100 text-zinc-500" },
  CALL: { label: "Call", icon: "ri-phone-line", iconClass: "bg-sky-50 text-sky-600" },
  MEETING: { label: "Meeting", icon: "ri-calendar-event-line", iconClass: "bg-violet-50 text-violet-600" },
  CLIENT_VISIT: { label: "Client visit", icon: "ri-map-pin-line", iconClass: "bg-teal-50 text-teal-600" },
  STATUS_CHANGE: { label: "Status change", icon: "ri-flag-line", iconClass: "bg-amber-50 text-amber-600" },
  ASSIGNMENT: { label: "Assignment", icon: "ri-user-add-line", iconClass: "bg-indigo-50 text-indigo-600" },
  TRANSFER: { label: "Transfer", icon: "ri-arrow-left-right-line", iconClass: "bg-indigo-50 text-indigo-600" },
  OTHER: { label: "Other", icon: "ri-more-line", iconClass: "bg-zinc-100 text-zinc-500" },
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE_ENQUIRY: "Website enquiry",
  GOOGLE_SEARCH: "Google search",
  GOOGLE_ADS: "Google ads",
  GOOGLE_MAPS: "Google maps",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  LINKEDIN: "LinkedIn",
  YOUTUBE: "YouTube",
  SMS_CAMPAIGN: "SMS campaign",
  REFERRAL: "Referral",
  COLD_OUTREACH: "Cold outreach",
  WALK_IN: "Walk-in",
  EXISTING_CLIENT: "Existing client",
  OTHER: "Other",
};

export const LEAD_SOURCE_ICONS: Partial<Record<LeadSource, string>> = {
  WEBSITE_ENQUIRY: "/icons/internet.svg",
  GOOGLE_SEARCH: "/icons/search.svg",
  GOOGLE_ADS: "/icons/adwords.svg",
  GOOGLE_MAPS: "/icons/google-maps.svg",
  FACEBOOK: "/icons/facebook.svg",
  INSTAGRAM: "/icons/instagram.svg",
  LINKEDIN: "/icons/linkedin.svg",
  YOUTUBE: "/icons/youtube.svg",
  SMS_CAMPAIGN: "/icons/ad-campaign.svg",
  REFERRAL: "/icons/communication.svg",
  COLD_OUTREACH: "/icons/cold-call.svg",
  WALK_IN: "/icons/walking.svg",
  EXISTING_CLIENT: "/icons/existent.svg",
  OTHER: "/icons/other.svg",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  PENDING_REVIEW: "Pending review",
  MORE_INFO_REQUIRED: "Info Required",
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

export const LEAD_STATUS_ICONS: Record<LeadStatus, string> = {
  NEW: "ri-sparkling-2-line",
  PENDING_REVIEW: "ri-time-line",
  MORE_INFO_REQUIRED: "ri-question-line",
  QUALIFIED: "ri-checkbox-circle-line",
  CONVERTED: "ri-checkbox-circle-line",
  REJECTED: "ri-close-circle-line",
  ON_HOLD: "ri-pause-circle-line",
  CLOSED_WON: "ri-checkbox-circle-line",
  CLOSED_LOST: "ri-close-circle-line",
};

// Shared with sales' own BUDGET_TYPE_LABELS (kept as a separate copy, same
// as the LEAD_BUDGET_TYPES enum itself) — one-time/monthly/part payment/advance.
export const LEAD_BUDGET_TYPE_LABELS: Record<LeadBudgetType, string> = {
  ONE_TIME: "One time",
  MONTHLY: "Monthly",
  PART_PAYMENT: "Part payment",
  ADVANCE: "Advance",
};

// The budget type picker only offers these three by default — "Advance" was
// dropped from the pick list (per request), but stays a valid, labelled
// value above so a lead already saved with it still displays correctly.
export const SELECTABLE_LEAD_BUDGET_TYPES: readonly LeadBudgetType[] = ["ONE_TIME", "MONTHLY", "PART_PAYMENT"];

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

// Reads as rising intensity — neutral, then caution, then the brand red for
// "this needs attention now" — paired with an icon of the same shape below.
export const LEAD_PRIORITY_BADGE_CLASSES: Record<LeadPriority, string> = {
  LOW: "bg-zinc-100 text-zinc-600",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-brand-50 text-brand-700",
};

export const LEAD_PRIORITY_ICONS: Record<LeadPriority, string> = {
  LOW: "ri-flag-line",
  MEDIUM: "ri-flag-line",
  HIGH: "ri-fire-line",
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
