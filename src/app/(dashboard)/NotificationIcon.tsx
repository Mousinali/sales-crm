import { notificationDisplay } from "./notificationDisplay";

// A round, type-colored icon for a notification (lead, visit, calendar, chat…).
export default function NotificationIcon({ type }: { type: string }) {
  const { icon, chipClass, label } = notificationDisplay(type);
  return (
    <span title={label} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${chipClass}`}>
      <i className={`${icon} text-base`} aria-hidden="true" />
    </span>
  );
}
