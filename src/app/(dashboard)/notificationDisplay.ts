import type { NotificationType } from "@/lib/notifications/record";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  LEAD_ASSIGNED: "Lead assigned",
  LEAD_TRANSFERRED: "Lead transferred",
  VISIT_SCHEDULED: "Visit scheduled",
  VISIT_RESCHEDULED: "Visit rescheduled",
  VISIT_CANCELLED: "Visit cancelled",
  CALENDAR_EVENT: "Calendar event",
  CHAT_MESSAGE: "Chat message",
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  LEAD_ASSIGNED: "ri-user-add-line",
  LEAD_TRANSFERRED: "ri-arrow-left-right-line",
  VISIT_SCHEDULED: "ri-calendar-event-line",
  VISIT_RESCHEDULED: "ri-calendar-check-line",
  VISIT_CANCELLED: "ri-calendar-close-line",
  CALENDAR_EVENT: "ri-calendar-line",
  CHAT_MESSAGE: "ri-chat-3-line",
};

export const NOTIFICATION_TYPE_BADGE_CLASSES: Record<NotificationType, string> = {
  LEAD_ASSIGNED: "bg-sky-50 text-sky-700",
  LEAD_TRANSFERRED: "bg-violet-50 text-violet-700",
  VISIT_SCHEDULED: "bg-amber-50 text-amber-700",
  VISIT_RESCHEDULED: "bg-amber-50 text-amber-700",
  VISIT_CANCELLED: "bg-rose-50 text-rose-700",
  CALENDAR_EVENT: "bg-brand-50 text-brand-700",
  CHAT_MESSAGE: "bg-emerald-50 text-emerald-700",
};
