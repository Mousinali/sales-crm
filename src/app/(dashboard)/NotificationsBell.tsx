"use client";

import { useEffect, useState } from "react";

type Notification = {
  id: number;
  type: string;
  message: string;
  read_at: string | null;
};

export default function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((body) => setNotifications(body.notifications ?? []))
      .catch(() => {});
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

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-md p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        <i className="ri-notification-3-line text-lg" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
          {notifications.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => markRead(n.id)}
                className={`block w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 ${n.read_at ? "text-zinc-400" : "font-medium text-zinc-900"}`}
              >
                {n.message}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
