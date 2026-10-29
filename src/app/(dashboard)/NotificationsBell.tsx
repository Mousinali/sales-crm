"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { toast } from "@/lib/toast";

const MUTE_STORAGE_KEY = "notificationsMuted";

type Notification = {
  id: number;
  type: string;
  message: string;
  read_at: string | null;
  lead_id: number | null;
  related_user_id: number | null;
};

const LEAD_NOTIFICATION_TYPES = new Set([
  "LEAD_ASSIGNED",
  "LEAD_TRANSFERRED",
  "VISIT_SCHEDULED",
  "VISIT_RESCHEDULED",
  "VISIT_CANCELLED",
]);

export default function NotificationsBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  // Muting only silences the unread badge (so it stops demanding attention)
  // — notifications still arrive and list normally, nothing is suppressed
  // server-side. Per-browser, not per-account, since it's "stop pinging me
  // on this device" rather than a account-wide preference.
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    // Reads a client-only preference after mount (localStorage doesn't
    // exist during SSR) and renders unmuted on the very first paint either
    // way, so there's nothing to defer onto a real async boundary here —
    // intentionally synchronous, not an oversight.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMuted(localStorage.getItem(MUTE_STORAGE_KEY) === "true");
    } catch {
      // Private browsing / blocked storage: default to unmuted.
    }
  }, []);

  function toggleMuted() {
    setMuted((current) => {
      const next = !current;
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      } catch {
        // Best-effort; the toggle still works for this page view.
      }
      return next;
    });
  }

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((body) => setNotifications(body.notifications ?? []))
      .catch(() => {});
  }, []);

  // The bell is mounted once in the persistent dashboard layout and never
  // remounts on route changes, so without this it would only ever show
  // whatever existed at that first fetch — any notification recorded
  // afterward (e.g. a chat message arriving while already on another page)
  // would stay invisible until a full page reload.
  useEffect(() => {
    const socket = io();
    socket.on("notification:new", (notification: Notification) => {
      setNotifications((current) => (current.some((n) => n.id === notification.id) ? current : [notification, ...current]));
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function markRead(id: number) {
    setNotifications((current) => current.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {
      // Best-effort: a failed PATCH just means it reappears as unread on next load.
    }
  }

  function handleClick(notification: Notification) {
    void markRead(notification.id);
    setOpen(false);
    if (notification.type === "CHAT_MESSAGE" && notification.related_user_id !== null) {
      router.push(`/chat?with=${notification.related_user_id}`);
    } else if (LEAD_NOTIFICATION_TYPES.has(notification.type) && notification.lead_id !== null) {
      router.push(`/leads/${notification.lead_id}`);
    } else if (notification.type === "CALENDAR_EVENT") {
      router.push("/calendar");
    }
  }

  async function handleDelete(event: MouseEvent, id: number) {
    event.stopPropagation();
    const previous = notifications;
    setNotifications((current) => current.filter((n) => n.id !== id));
    try {
      const response = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setNotifications(previous);
        toast.error("Could not delete notification");
      }
    } catch {
      setNotifications(previous);
      toast.error("Could not delete notification");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        <i className="ri-notification-3-line text-lg" aria-hidden="true" />
        {!muted && unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Notifications</p>
            <button
              type="button"
              onClick={toggleMuted}
              title={muted ? "Unmute notifications" : "Mute notifications"}
              className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <i className={muted ? "ri-notification-off-line" : "ri-notification-3-line"} aria-hidden="true" />
              {muted ? "Muted" : "Mute"}
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="group flex items-center hover:bg-zinc-50">
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`block flex-1 px-4 py-2 text-left text-sm ${n.read_at ? "text-zinc-400" : "font-medium text-zinc-900"}`}
                >
                  {n.message}
                </button>
                <button
                  type="button"
                  onClick={(event) => handleDelete(event, n.id)}
                  aria-label="Delete notification"
                  title="Delete"
                  className="mr-2 shrink-0 rounded p-1.5 text-zinc-300 opacity-0 hover:bg-zinc-200 hover:text-zinc-600 group-hover:opacity-100"
                >
                  <i className="ri-delete-bin-line text-sm" aria-hidden="true" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
