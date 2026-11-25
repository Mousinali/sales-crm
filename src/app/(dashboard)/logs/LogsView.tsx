"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import RefreshButton from "@/components/ui/RefreshButton";
import Pagination from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";
import { ROLE_LABELS } from "@/app/(dashboard)/roleDisplay";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import { useViewportPageSize } from "@/lib/useViewportPageSize";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { AUDIT_CATEGORIES, type AuditCategoryKey, type AuditPeriod } from "@/lib/audit/categories";

type AuditLogEntry = {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_user_id: number | null;
  actor_name: string | null;
};

const AUDIT_ACTION_META: Record<string, { label: string; icon: string; accent: string }> = {
  "user.created": { label: "created an account", icon: "ri-user-add-line", accent: "bg-emerald-50 text-emerald-600" },
  "user.updated": { label: "updated an account", icon: "ri-edit-line", accent: "bg-sky-50 text-sky-600" },
  "user.activated": { label: "activated an account", icon: "ri-checkbox-circle-line", accent: "bg-emerald-50 text-emerald-600" },
  "user.deactivated": { label: "deactivated an account", icon: "ri-forbid-line", accent: "bg-rose-50 text-rose-600" },
  "user.access_reset": { label: "reset an account's access", icon: "ri-key-line", accent: "bg-amber-50 text-amber-600" },
  "user.password_changed": { label: "changed their password", icon: "ri-lock-password-line", accent: "bg-sky-50 text-sky-600" },
  "user.login": { label: "logged in", icon: "ri-login-box-line", accent: "bg-emerald-50 text-emerald-600" },
  "user.logout": { label: "logged out", icon: "ri-logout-box-r-line", accent: "bg-zinc-100 text-zinc-500" },
  "lead.created": { label: "added a lead", icon: "ri-user-add-line", accent: "bg-emerald-50 text-emerald-600" },
  "lead.bulk_imported": { label: "imported leads from a file", icon: "ri-file-upload-line", accent: "bg-emerald-50 text-emerald-600" },
  "lead.assigned": { label: "assigned a lead", icon: "ri-user-shared-line", accent: "bg-sky-50 text-sky-600" },
  "lead.transferred": { label: "transferred a lead", icon: "ri-arrow-left-right-line", accent: "bg-sky-50 text-sky-600" },
  "lead.status_changed": { label: "changed a lead's status", icon: "ri-flag-line", accent: "bg-amber-50 text-amber-600" },
  "lead.shared": { label: "shared a lead", icon: "ri-share-line", accent: "bg-sky-50 text-sky-600" },
  "lead.unshared": { label: "stopped sharing a lead", icon: "ri-share-line", accent: "bg-zinc-100 text-zinc-500" },
  "lead.activity_added": { label: "added a lead activity", icon: "ri-chat-history-line", accent: "bg-sky-50 text-sky-600" },
  "sale.created": { label: "added a sale", icon: "ri-shopping-bag-3-line", accent: "bg-emerald-50 text-emerald-600" },
  "payment.recorded": { label: "recorded a payment", icon: "ri-money-rupee-circle-line", accent: "bg-emerald-50 text-emerald-600" },
  "sale.update": { label: "edited a sale", icon: "ri-shopping-bag-3-line", accent: "bg-sky-50 text-sky-600" },
  "sale_payment.update": { label: "edited a payment", icon: "ri-money-rupee-circle-line", accent: "bg-sky-50 text-sky-600" },
  "lead.archived": { label: "deleted a lead", icon: "ri-delete-bin-line", accent: "bg-rose-50 text-rose-600" },
  "lead.restored": { label: "restored a lead", icon: "ri-arrow-go-back-line", accent: "bg-emerald-50 text-emerald-600" },
  "user.archived": { label: "deleted an account", icon: "ri-user-unfollow-line", accent: "bg-rose-50 text-rose-600" },
  "user.restored": { label: "restored an account", icon: "ri-user-follow-line", accent: "bg-emerald-50 text-emerald-600" },
  "payment.updated": { label: "edited a payment", icon: "ri-money-rupee-circle-line", accent: "bg-sky-50 text-sky-600" },
  "calendar.created": { label: "added a calendar event", icon: "ri-calendar-event-line", accent: "bg-emerald-50 text-emerald-600" },
  "calendar.updated": { label: "updated a calendar event", icon: "ri-calendar-event-line", accent: "bg-sky-50 text-sky-600" },
  "calendar.deleted": { label: "deleted a calendar event", icon: "ri-calendar-event-line", accent: "bg-rose-50 text-rose-600" },
  "calendar.responded": { label: "responded to a calendar invite", icon: "ri-calendar-check-line", accent: "bg-sky-50 text-sky-600" },
  "task.created": { label: "added a task", icon: "ri-task-line", accent: "bg-emerald-50 text-emerald-600" },
  "task.updated": { label: "updated a task", icon: "ri-task-line", accent: "bg-sky-50 text-sky-600" },
  "team.created": { label: "created a team chat", icon: "ri-team-line", accent: "bg-emerald-50 text-emerald-600" },
  "team.members_added": { label: "added members to a team chat", icon: "ri-user-add-line", accent: "bg-sky-50 text-sky-600" },
  "team.left": { label: "left a team chat", icon: "ri-team-line", accent: "bg-zinc-100 text-zinc-500" },
  "visit.scheduled": { label: "scheduled a client visit", icon: "ri-map-pin-line", accent: "bg-emerald-50 text-emerald-600" },
  "visit.reschedule": { label: "rescheduled a client visit", icon: "ri-map-pin-line", accent: "bg-sky-50 text-sky-600" },
  "visit.cancel": { label: "cancelled a client visit", icon: "ri-map-pin-line", accent: "bg-rose-50 text-rose-600" },
  "visit.record_outcome": { label: "recorded a visit outcome", icon: "ri-map-pin-line", accent: "bg-sky-50 text-sky-600" },
  "email.announcement_sent": { label: "sent an email announcement", icon: "ri-mail-send-line", accent: "bg-sky-50 text-sky-600" },
  "company.updated": { label: "edited a company", icon: "ri-building-2-line", accent: "bg-sky-50 text-sky-600" },
  "company.archived": { label: "deleted a company", icon: "ri-building-2-line", accent: "bg-rose-50 text-rose-600" },
  "company.restored": { label: "restored a company", icon: "ri-building-2-line", accent: "bg-emerald-50 text-emerald-600" },
  "service.created": { label: "created a service", icon: "ri-price-tag-3-line", accent: "bg-emerald-50 text-emerald-600" },
  "service.updated": { label: "updated a service", icon: "ri-price-tag-3-line", accent: "bg-sky-50 text-sky-600" },
};

function auditActionMeta(action: string) {
  return (
    AUDIT_ACTION_META[action] ?? {
      label: action.replace(/[._]/g, " "),
      icon: "ri-history-line",
      accent: "bg-zinc-100 text-zinc-500",
    }
  );
}

type Chip = { icon?: string; text: string };

const DEVICE_ICONS: Record<string, string> = { Mobile: "ri-smartphone-line", Tablet: "ri-tablet-line", Desktop: "ri-computer-line" };

// Best-effort context, not a strict schema — not every action logs the
// same fields, so this surfaces whichever of these a given action recorded.
function auditChips(details: Record<string, unknown> | null): Chip[] {
  if (!details) return [];
  const str = (key: string) => (typeof details[key] === "string" ? (details[key] as string) : null);
  const chips: Chip[] = [];
  const email = str("email");
  if (email) chips.push({ icon: "ri-mail-line", text: email });
  const role = str("role");
  if (role) chips.push({ text: ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role });
  const status = str("status");
  if (status) chips.push({ text: status.replace(/_/g, " ").toLowerCase() });
  if (typeof details.amount === "number" || typeof details.amount === "string") chips.push({ icon: "ri-money-rupee-circle-line", text: `₹${details.amount}` });
  // Sale and payment edits log [old, new] pairs.
  if (Array.isArray(details.amount) && details.amount[0] !== details.amount[1]) chips.push({ icon: "ri-money-rupee-circle-line", text: `₹${details.amount[0]} to ₹${details.amount[1]}` });
  if (Array.isArray(details.date) && details.date[0] !== details.date[1]) chips.push({ icon: "ri-calendar-line", text: `${details.date[0]} to ${details.date[1]}` });
  if (typeof details.count === "number") chips.push({ text: `${details.count} item${details.count === 1 ? "" : "s"}` });
  const renamedFrom = str("renamedFrom");
  if (renamedFrom) chips.push({ icon: "ri-edit-line", text: `was ${renamedFrom}` });
  if (Array.isArray(details.fields) && details.fields.length > 0) chips.push({ text: `changed ${details.fields.map((f) => String(f).replace(/([A-Z])/g, " $1").toLowerCase()).join(", ")}` });
  const device = str("device");
  if (device) chips.push({ icon: DEVICE_ICONS[device], text: `${device} · ${[str("browser"), str("os")].filter(Boolean).join(" on ")}` });
  return chips;
}

const PERIODS: { key: AuditPeriod | "all"; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

function dayHeading(iso: string): string {
  const day = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(day)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(day.getFullYear() !== new Date().getFullYear() && { year: "numeric" }) });
}

function groupByDay(logs: AuditLogEntry[]): { heading: string; entries: AuditLogEntry[] }[] {
  const groups: { heading: string; entries: AuditLogEntry[] }[] = [];
  for (const log of logs) {
    const heading = dayHeading(log.created_at);
    const last = groups[groups.length - 1];
    if (last?.heading === heading) last.entries.push(log);
    else groups.push({ heading, entries: [log] });
  }
  return groups;
}

export default function LogsView({
  initialLogs,
  initialTotal,
  initialTotalPages,
  userId,
  initialCategoryCounts,
}: {
  initialLogs: AuditLogEntry[];
  initialTotal: number;
  initialTotalPages: number;
  /** Set on a user's own timeline page: only that user's activity is listed. */
  userId?: number;
  /** Per-group totals for the selected period, shown on the filter chips of a user's timeline. */
  initialCategoryCounts?: Record<AuditCategoryKey, number>;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [categoryCounts, setCategoryCounts] = useState(initialCategoryCounts);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AuditCategoryKey | null>(null);
  const [period, setPeriod] = useState<AuditPeriod | "all">("today"); // matches the server-rendered first page
  const [listError, setListError] = useState<string | null>(null);

  const pageSizeRef = useViewportPageSize(61, 352);

  async function refetch(overrides?: { search?: string; page?: number; category?: AuditCategoryKey | null; period?: AuditPeriod | "all" }) {
    const effectiveSearch = overrides?.search ?? search;
    const targetPage = overrides?.page ?? page;
    const effectiveCategory = overrides && "category" in overrides ? overrides.category : category;
    const effectivePeriod = overrides?.period ?? period;

    const params = new URLSearchParams();
    if (effectiveSearch.trim()) params.set("q", effectiveSearch.trim());
    if (userId) params.set("userId", String(userId));
    if (effectiveCategory) params.set("category", effectiveCategory);
    if (effectivePeriod !== "all") params.set("period", effectivePeriod);
    params.set("page", String(targetPage));
    params.set("pageSize", String(pageSizeRef.current));

    setListError(null);
    try {
      const response = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!response.ok) {
        setListError(await parseErrorMessage(response, "Could not load the activity log."));
        return;
      }
      const body = await response.json();
      setLogs(body.logs ?? []);
      setTotal(body.total ?? 0);
      setCategoryCounts(body.categoryCounts);
      setTotalPages(body.totalPages ?? 1);
      setPage(targetPage);
    } catch {
      setListError("Could not load the activity log.");
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refetch({ page: 1 });
  }

  function pickCategory(next: AuditCategoryKey | null) {
    setCategory(next);
    void refetch({ category: next, page: 1 });
  }

  function pickPeriod(next: AuditPeriod | "all") {
    setPeriod(next);
    void refetch({ period: next, page: 1 });
  }

  function clearFilters() {
    setCategory(null);
    setPeriod("today");
    setSearch("");
    void refetch({ category: null, period: "today", search: "", page: 1 });
  }

  // The hook above has already set the viewport-fitted size; refetch once if it differs.
  useEffect(() => {
    if (pageSizeRef.current !== DEFAULT_PAGE_SIZE) void refetch({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-searches automatically once typing pauses, instead of making the
  // user hit Enter — the initial mount's "pause" is skipped so it doesn't
  // immediately re-fetch the page the server already rendered.
  const debouncedSearch = useDebouncedValue(search, 350);
  const lastSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (lastSearch.current === debouncedSearch) return;
    lastSearch.current = debouncedSearch;
    void refetch({ search: debouncedSearch, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useAutoRefresh(() => {
    void refetch();
  });

  const filtered = category !== null || period !== "today" || search.trim() !== "";
  const chipClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 ${
      active ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
    }`;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {!userId && (
            <form onSubmit={handleSearchSubmit} className="min-w-48 flex-1">
              <div className="relative max-w-xs">
                <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by user…"
                  aria-label="Search by user"
                  className="w-full rounded-md border border-zinc-300 py-2 pr-3 pl-9 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
            </form>
          )}
          <div role="group" aria-label="Time range" className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 text-sm">
            {PERIODS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={period === option.key}
                onClick={() => pickPeriod(option.key)}
                className={`rounded px-3 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 ${
                  period === option.key ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className={userId ? "ml-auto" : ""}>
            <RefreshButton onRefresh={() => refetch()} />
          </div>
        </div>

        <div role="group" aria-label="Activity type" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={category === null} onClick={() => pickCategory(null)} className={chipClass(category === null)}>
            All activity
          </button>
          {AUDIT_CATEGORIES.map((c) => (
            <button key={c.key} type="button" aria-pressed={category === c.key} onClick={() => pickCategory(c.key)} className={chipClass(category === c.key)}>
              {c.label}
              {categoryCounts && <span className={category === c.key ? "text-white/80" : "text-zinc-400"}>{categoryCounts[c.key]}</span>}
            </button>
          ))}
        </div>
      </div>

      {listError && (
        <p role="alert" className="px-4 pt-4 text-sm text-red-600">
          {listError}
        </p>
      )}

      {logs.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-zinc-500">
          <p>{filtered ? "No activity matches these filters." : "No activity today yet."}</p>
          {filtered && (
            <button type="button" onClick={clearFilters} className="mt-2 font-medium text-brand-700 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 pb-2 pt-4">
          {groupByDay(logs).map((group) => (
            <section key={group.heading} aria-label={group.heading} className="mb-4">
              <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-zinc-900">
                {group.heading}
                <span className="text-xs font-normal text-zinc-400">{group.entries.length}</span>
              </h2>
              <ol className="relative ml-4 border-l border-zinc-200">
                {group.entries.map((log) => {
                  const meta = auditActionMeta(log.action);
                  const chips = auditChips(log.details);
                  const name = log.details && typeof log.details.name === "string" ? log.details.name : null;
                  return (
                    <li key={log.id} className="relative py-2 pl-7 pr-1">
                      <span className={`absolute -left-4 top-2 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white ${meta.accent}`}>
                        <i className={`${meta.icon} text-base`} aria-hidden="true" />
                      </span>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-zinc-700">
                            {userId ? (
                              <span className="font-medium text-zinc-900">{meta.label.charAt(0).toUpperCase() + meta.label.slice(1)}</span>
                            ) : (
                              <>
                                {log.actor_user_id ? (
                                  <Link href={`/logs/${log.actor_user_id}`} className="font-medium text-zinc-900 hover:text-brand-700 hover:underline">
                                    {log.actor_name ?? "Someone"}
                                  </Link>
                                ) : (
                                  <span className="font-medium text-zinc-900">{log.actor_name ?? "Someone"}</span>
                                )}{" "}
                                {meta.label}
                              </>
                            )}
                            {name && <span className="font-medium text-zinc-900"> · {name}</span>}
                          </p>
                          {chips.length > 0 && (
                            <p className="mt-1 flex flex-wrap gap-1.5">
                              {chips.map((chip) => (
                                <span key={chip.text} className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                                  {chip.icon && <i className={chip.icon} aria-hidden="true" />}
                                  {chip.text}
                                </span>
                              ))}
                            </p>
                          )}
                        </div>
                        <time dateTime={log.created_at} className="shrink-0 pt-0.5 text-xs tabular-nums text-zinc-400">
                          {new Date(log.created_at).toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} total={total} onChange={(nextPage) => refetch({ page: nextPage })} />
    </div>
  );
}
