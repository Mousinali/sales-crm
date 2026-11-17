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
  VISIT_SCHEDULED: "ri-map-pin-time-line",
  VISIT_RESCHEDULED: "ri-calendar-schedule-line",
  VISIT_CANCELLED: "ri-calendar-close-line",
  CALENDAR_EVENT: "ri-calendar-event-line",
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

// For a type string that may not be one of the known types (a row written by a
// newer version, say) — falls back to a neutral bell so nothing renders blank.
export function notificationDisplay(type: string): { label: string; icon: string; chipClass: string } {
  if (type in NOTIFICATION_TYPE_LABELS) {
    const t = type as NotificationType;
    return { label: NOTIFICATION_TYPE_LABELS[t], icon: NOTIFICATION_TYPE_ICONS[t], chipClass: NOTIFICATION_TYPE_BADGE_CLASSES[t] };
  }
  return { label: "Notification", icon: "ri-notification-3-line", chipClass: "bg-zinc-100 text-zinc-600" };
}
