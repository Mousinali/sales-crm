"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { toast } from "@/lib/toast";
import { useMobileOverlay } from "./MobileOverlayContext";
import NotificationIcon from "./NotificationIcon";
import { notificationDisplay } from "./notificationDisplay";

const MUTE_STORAGE_KEY = "notificationsMuted";
// The desktop dropdown shows a preview; the rest live on the full page.
const DESKTOP_PREVIEW_COUNT = 6;

// Compact relative time ("just now", "5m ago", "3h ago", "2d ago", …).
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [60, "m"],
    [3600, "h"],
    [86400, "d"],
    [604800, "w"],
  ];
  for (let i = units.length - 1; i >= 0; i--) {
    const [secs, label] = units[i];
    if (seconds >= secs) return `${Math.floor(seconds / secs)}${label} ago`;
  }
  return "just now";
}

type Notification = {
  id: number;
  type: string;
  message: string;
  read_at: string | null;
  created_at?: string;
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

// `variant="mobile"` is the only thing MobileNav opts into — it swaps the
// desktop dropdown for a right-side offcanvas panel (same data/handlers,
// just a different shell). Every other caller passes nothing and keeps
// the original dropdown exactly as it was.
export default function NotificationsBell({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const desktopRef = useRef<HTMLDivElement>(null);
  // Muting only silences the unread badge (so it stops demanding attention)
  // — notifications still arrive and list normally, nothing is suppressed
  // server-side. Per-browser, not per-account, since it's "stop pinging me
  // on this device" rather than a account-wide preference.
  const [muted, setMuted] = useState(false);
  const { setOverlayOpen } = useMobileOverlay();

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

  // The mobile panel overlays the whole screen rather than replacing it
  // (same as the hamburger drawer), so without this a touch-scroll still
  // scrolls the page underneath it. The desktop dropdown is small enough
  // that this was never needed there.
  useEffect(() => {
    if (variant !== "mobile") return;
    setOverlayOpen("notifications-panel", open);
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [variant, open, setOverlayOpen]);

  // Desktop dropdown has no backdrop, so close on any click/tap outside it.
  useEffect(() => {
    if (variant === "mobile" || !open) return;
    function handleMouseDown(event: globalThis.MouseEvent) {
      if (!desktopRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [variant, open]);

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

  const muteToggle = (
    <button
      type="button"
      onClick={toggleMuted}
      title={muted ? "Unmute notifications" : "Mute notifications"}
      className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
    >
      <i className={muted ? "ri-notification-off-line" : "ri-notification-3-line"} aria-hidden="true" />
      {muted ? "Muted" : "Mute"}
    </button>
  );

  const renderList = (items: Notification[]) =>
    items.length === 0 ? (
      <p className="px-4 py-3 text-sm text-zinc-500">No notifications yet.</p>
    ) : (
      items.map((n) => (
        <div key={n.id} className="group flex items-center hover:bg-zinc-50">
          <button
            type="button"
            onClick={() => handleClick(n)}
            className="flex min-w-0 flex-1 items-start gap-3 px-4 py-2 text-left"
          >
            <NotificationIcon type={n.type} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-zinc-900">{notificationDisplay(n.type).label}</span>
              <span className={`mt-0.5 block text-xs leading-snug line-clamp-2 ${n.read_at ? "text-zinc-400" : "text-zinc-600"}`}>{n.message}</span>
              {n.created_at && <time className="mt-0.5 block text-[11px] text-zinc-400">{timeAgo(n.created_at)}</time>}
            </span>
            {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
          </button>
          <button
            type="button"
            onClick={(event) => handleDelete(event, n.id)}
            aria-label="Delete notification"
            title="Delete"
            className="mr-2 shrink-0 self-center rounded-md p-2 text-zinc-400 opacity-0 transition-colors hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
          >
            <i className="ri-delete-bin-line text-sm" aria-hidden="true" />
          </button>
        </div>
      ))
    );

  const viewAllLink = (
    <div className="border-t border-zinc-100 p-3">
      <Link
        href="/notifications"
        onClick={() => setOpen(false)}
        className="block rounded-lg bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        View all notifications
      </Link>
    </div>
  );

  const newBadge = unreadCount > 0 && (
    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{unreadCount} New</span>
  );

  const bellButton = (
    <button
      type="button"
      aria-label="Notifications"
      onClick={() => setOpen((value) => !value)}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-brand-400 ${
        variant === "mobile"
          ? "text-sidebar-muted hover:bg-sidebar-elevated hover:text-sidebar-foreground"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      <i className="ri-notification-3-line text-lg" aria-hidden="true" />
      {!muted && unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
          {unreadCount}
        </span>
      )}
    </button>
  );

  if (variant === "mobile") {
    return (
      <>
        {bellButton}
        {/* Stays mounted (not `{open && ...}`) so the slide transition has
            something to animate between — mirrors MobileNav's own drawer. */}
        <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className={`absolute inset-0 bg-zinc-900/40 transition-opacity duration-200 ease-in-out ${open ? "opacity-100" : "opacity-0"}`}
          />
          <div
            className={`absolute inset-y-0 right-0 flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200 ease-in-out ${
              open ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 p-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-zinc-900">Notifications</p>
                {newBadge}
              </div>
              {muteToggle}
            </div>
            <div className="flex-1 overflow-y-auto">{renderList(notifications)}</div>
            {notifications.length > 0 && viewAllLink}
          </div>
        </div>
      </>
    );
  }

  return (
    <div ref={desktopRef} className="relative">
      {bellButton}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-1rem)] rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-zinc-900">Notifications</p>
              {newBadge}
            </div>
            {muteToggle}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">{renderList(notifications.slice(0, DESKTOP_PREVIEW_COUNT))}</div>
          {notifications.length > 0 && viewAllLink}
        </div>
      )}
    </div>
  );
}
