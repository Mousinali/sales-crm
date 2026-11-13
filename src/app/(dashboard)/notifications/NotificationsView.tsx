"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import PageHeading from "@/components/ui/PageHeading";
import RefreshButton from "@/components/ui/RefreshButton";
import Pagination from "@/components/ui/Pagination";
import Badge from "@/components/ui/Badge";
import FilterDropdown from "@/components/ui/FilterDropdown";
import FilterBottomSheet from "@/components/ui/FilterBottomSheet";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";
import { toast } from "@/lib/toast";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/record";
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_ICONS, NOTIFICATION_TYPE_BADGE_CLASSES } from "@/app/(dashboard)/notificationDisplay";

type ReadFilter = "UNREAD" | "READ";
const READ_FILTER_OPTIONS: { value: ReadFilter | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "UNREAD", label: "Unread only" },
  { value: "READ", label: "Read only" },
];
const TYPE_FILTER_OPTIONS: { value: NotificationType | ""; label: string }[] = [
  { value: "", label: "All types" },
  ...NOTIFICATION_TYPES.map((type) => ({ value: type, label: NOTIFICATION_TYPE_LABELS[type] })),
];

type NotificationItem = {
  id: number;
  type: NotificationType;
  message: string;
  lead_id: number | null;
  related_user_id: number | null;
  read_at: string | Date | null;
  created_at: string | Date;
};

const LEAD_NOTIFICATION_TYPES = new Set<NotificationType>([
  "LEAD_ASSIGNED",
  "LEAD_TRANSFERRED",
  "VISIT_SCHEDULED",
  "VISIT_RESCHEDULED",
  "VISIT_CANCELLED",
]);

function formatTimestamp(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function NotificationsView({
  initialNotifications,
  initialTotal,
  initialTotalPages,
}: {
  initialNotifications: NotificationItem[];
  initialTotal: number;
  initialTotalPages: number;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "">("");
  const [readFilter, setReadFilter] = useState<ReadFilter | "">("");
  const [listError, setListError] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const activeFilterCount = [typeFilter, readFilter].filter(Boolean).length;
  const debouncedSearch = useDebouncedValue(search, 350);
  const lastSearch = useRef(debouncedSearch);

  async function refetch(targetPage: number) {
    const params = new URLSearchParams({ page: String(targetPage) });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (typeFilter) params.set("type", typeFilter);
    if (readFilter) params.set("read", readFilter);

    try {
      const response = await fetch(`/api/notifications?${params.toString()}`);
      if (!response.ok) throw new Error("Could not load notifications.");
      const body = await response.json();
      setNotifications(body.notifications ?? []);
      setTotal(body.total ?? 0);
      setTotalPages(body.totalPages ?? 1);
      setPage(body.page ?? targetPage);
      setListError(null);
    } catch {
      setListError("Could not load notifications.");
    }
  }

  useEffect(() => {
    if (lastSearch.current === debouncedSearch) return;
    lastSearch.current = debouncedSearch;
    void refetch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function handleFilterSubmit(event: FormEvent) {
    event.preventDefault();
    void refetch(1);
  }

  useAutoRefresh(() => void refetch(page));

  async function markRead(id: number) {
    setNotifications((current) => current.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {
      // Best-effort: a failed PATCH just means it reappears as unread on next load.
    }
  }

  function handleClick(notification: NotificationItem) {
    void markRead(notification.id);
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
      if (!response.ok) throw new Error();
    } catch {
      setNotifications(previous);
      toast.error("Could not delete notification");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Notifications" count={total} crumbs={[{ label: "Notifications" }]} actions={<RefreshButton onRefresh={() => refetch(page)} />} />

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 p-4">
          <form onSubmit={handleFilterSubmit} className="hidden flex-wrap items-center gap-2.5 sm:flex">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notifications…"
                aria-label="Search notifications"
                className="w-full rounded-md border border-zinc-300 py-2 pl-9 pr-3 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <FilterDropdown icon="ri-filter-3-line" ariaLabel="Filter by type" value={typeFilter} options={TYPE_FILTER_OPTIONS} onChange={setTypeFilter} />
            <FilterDropdown icon="ri-mail-open-line" ariaLabel="Filter by read status" value={readFilter} options={READ_FILTER_OPTIONS} onChange={setReadFilter} />

            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              Apply filters
            </button>
          </form>

          <div className="flex items-center gap-2.5 sm:hidden">
            <div className="relative min-w-[200px] flex-1">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notifications…"
                aria-label="Search notifications"
                className="w-full rounded-md border border-zinc-300 py-2 pl-9 pr-3 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <button
              type="button"
              onClick={() => setFilterSheetOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              <i className="ri-filter-3-line text-brand-600" aria-hidden="true" />
              Filter
              {activeFilterCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <FilterBottomSheet
          open={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          onApply={() => {
            setFilterSheetOpen(false);
            void refetch(1);
          }}
        >
          <FilterDropdown fullWidth icon="ri-filter-3-line" ariaLabel="Filter by type" value={typeFilter} options={TYPE_FILTER_OPTIONS} onChange={setTypeFilter} />
          <FilterDropdown fullWidth icon="ri-mail-open-line" ariaLabel="Filter by read status" value={readFilter} options={READ_FILTER_OPTIONS} onChange={setReadFilter} />
        </FilterBottomSheet>

        {listError && (
          <p role="alert" className="px-4 py-3 text-sm text-rose-600">
            {listError}
          </p>
        )}

        {notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">No notifications.</p>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className="group flex items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-0 hover:bg-zinc-50">
              <button type="button" onClick={() => handleClick(n)} className="flex flex-1 items-center gap-3 text-left">
                <Badge icon={NOTIFICATION_TYPE_ICONS[n.type]} className={NOTIFICATION_TYPE_BADGE_CLASSES[n.type]}>
                  {NOTIFICATION_TYPE_LABELS[n.type]}
                </Badge>
                {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" title="Unread" />}
                <p className={`flex-1 text-sm ${n.read_at ? "text-zinc-500" : "font-medium text-zinc-900"}`}>{n.message}</p>
                <time className="shrink-0 text-xs text-zinc-400">{formatTimestamp(n.created_at)}</time>
              </button>
              <button
                type="button"
                onClick={(event) => handleDelete(event, n.id)}
                aria-label="Delete notification"
                title="Delete"
                className="shrink-0 rounded p-1.5 text-zinc-300 opacity-0 hover:bg-zinc-200 hover:text-zinc-600 group-hover:opacity-100"
              >
                <i className="ri-delete-bin-line text-sm" aria-hidden="true" />
              </button>
            </div>
          ))
        )}

        <Pagination page={page} totalPages={totalPages} total={total} onChange={(nextPage) => refetch(nextPage)} />
      </div>
    </div>
  );
}
