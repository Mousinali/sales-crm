"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import RefreshButton from "@/components/ui/RefreshButton";
import Pagination from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";
import { ROLE_LABELS } from "@/app/(dashboard)/roleDisplay";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

type AuditLogEntry = {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
};

const AUDIT_ACTION_META: Record<string, { label: string; icon: string; accent: string }> = {
  "user.created": { label: "created an account", icon: "ri-user-add-line", accent: "bg-emerald-50 text-emerald-600" },
  "user.updated": { label: "updated an account", icon: "ri-edit-line", accent: "bg-sky-50 text-sky-600" },
  "user.activated": { label: "activated an account", icon: "ri-checkbox-circle-line", accent: "bg-emerald-50 text-emerald-600" },
  "user.deactivated": { label: "deactivated an account", icon: "ri-forbid-line", accent: "bg-rose-50 text-rose-600" },
  "user.access_reset": { label: "reset an account's access", icon: "ri-key-line", accent: "bg-amber-50 text-amber-600" },
  "user.password_changed": { label: "changed their password", icon: "ri-lock-password-line", accent: "bg-sky-50 text-sky-600" },
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

// Best-effort context, not a strict schema — not every action logs the
// same fields (a status change logs none at all), so this just surfaces
// whichever of these a given action happened to record.
function auditDetailLine(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const name = typeof details.name === "string" ? details.name : null;
  const email = typeof details.email === "string" ? details.email : null;
  const role = typeof details.role === "string" ? (ROLE_LABELS[details.role as keyof typeof ROLE_LABELS] ?? details.role) : null;
  const parts = [name, email, role].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function LogsView({
  initialLogs,
  initialTotal,
  initialTotalPages,
}: {
  initialLogs: AuditLogEntry[];
  initialTotal: number;
  initialTotalPages: number;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [listError, setListError] = useState<string | null>(null);

  async function refetch(overrides?: { search?: string; page?: number }) {
    const effectiveSearch = overrides?.search ?? search;
    const targetPage = overrides?.page ?? page;

    const params = new URLSearchParams();
    if (effectiveSearch.trim()) params.set("q", effectiveSearch.trim());
    params.set("page", String(targetPage));

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

  // Re-searches automatically once typing pauses, instead of making the
  // user hit Enter — the initial mount's "pause" is skipped so it doesn't
  // immediately re-fetch the page the server already rendered.
  const debouncedSearch = useDebouncedValue(search, 350);
  const skippedFirstSearch = useRef(false);
  useEffect(() => {
    if (!skippedFirstSearch.current) {
      skippedFirstSearch.current = true;
      return;
    }
    void refetch({ search: debouncedSearch, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useAutoRefresh(() => {
    void refetch();
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <form onSubmit={handleSearchSubmit} className="flex-1">
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
          <RefreshButton onRefresh={() => refetch()} />
        </div>

        {listError && (
          <p role="alert" className="px-4 pt-4 text-sm text-red-600">
            {listError}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="table-responsive min-w-full divide-y divide-zinc-200 text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                <th scope="col" className="px-4 py-3 text-left">
                  Activity
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  When
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-zinc-500">
                    No activity found.
                  </td>
                </tr>
              )}
              {logs.map((log) => {
                const meta = auditActionMeta(log.action);
                const detail = auditDetailLine(log.details);
                return (
                  <tr key={log.id} className="transition-colors hover:bg-zinc-50/80">
                    <td data-label="Activity" className="px-4 py-3">
                      <div className={`flex gap-3 ${detail ? "items-start" : "items-center"}`}>
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.accent}`}>
                          <i className={`${meta.icon} text-base`} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-zinc-900">
                            <span className="font-medium">{log.actor_name ?? "Someone"}</span> {meta.label}
                          </p>
                          {detail && <p className="truncate text-xs text-zinc-500">{detail}</p>}
                        </div>
                      </div>
                    </td>
                    <td data-label="When" className="px-4 py-3 whitespace-nowrap text-zinc-500">
                      {new Date(log.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} onChange={(nextPage) => refetch({ page: nextPage })} />
      </div>
    </div>
  );
}
