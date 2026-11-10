"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import RefreshButton from "@/components/ui/RefreshButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  LEAD_SOURCES,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  type LeadSource,
  type LeadPriority,
  type LeadStatus,
} from "@/lib/leads/types";
import type { LeadRow } from "@/lib/leads/types";
import type { LeadSortColumn } from "@/lib/leads/list";
import type { Role } from "@/lib/auth/roles";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_BADGE_CLASSES,
  LEAD_STATUS_ICONS,
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_BADGE_CLASSES,
  LEAD_PRIORITY_ICONS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_ICONS,
} from "@/app/(dashboard)/leadDisplay";
import Pagination from "@/components/ui/Pagination";
import Badge from "@/components/ui/Badge";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import FilterDropdown from "@/components/ui/FilterDropdown";
import FilterBottomSheet from "@/components/ui/FilterBottomSheet";
import PageHeading from "@/components/ui/PageHeading";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";

type SimpleUser = { id: number; name: string };

// listLeads/listLeadsPage join in the lead's most recent sale (if any) — id
// plus its budget/paid totals — so the table can flag a lead as "Converted
// to sale" and show paid/remaining without a separate request per row. They
// also join in the owner names directly, for the same no-extra-request reason.
type LeadWithSale = LeadRow & {
  latest_sale_id?: number | null;
  latest_sale_budget_amount?: string | null;
  latest_sale_paid_amount?: string | null;
  pre_sales_owner_name?: string | null;
  salesperson_owner_name?: string | null;
};

const LEAD_ERROR_STATUS_MESSAGES = {
  403: "You are not allowed to do that.",
  404: "That lead no longer exists.",
};

function formatDateDisplay(value: string): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function LeadsView({
  initialLeads,
  initialTotal,
  initialTotalPages,
  viewerRole,
  viewerId,
}: {
  initialLeads: LeadWithSale[];
  initialTotal: number;
  initialTotalPages: number;
  viewerRole: Role;
  viewerId?: number;
}) {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadWithSale[]>(initialLeads);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "">("");
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<LeadSortColumn>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [listError, setListError] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const activeFilterCount = [
    statusFilter,
    sourceFilter,
    priorityFilter,
    dateFrom || dateTo,
  ].filter(Boolean).length;

  const canCreate =
    viewerRole === "PRE_SALES" ||
    viewerRole === "MARKETING_HEAD" ||
    viewerRole === "SALESPERSON";
  const canEditLead = (lead: LeadWithSale) =>
    viewerRole === "MARKETING_HEAD" ||
    (viewerRole === "PRE_SALES" &&
      (lead.pre_sales_owner_id === viewerId || lead.created_by === viewerId));

  function toggleSort(column: LeadSortColumn) {
    if (sortBy === column) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
    void refetch(
      1,
      column,
      sortBy === column ? (sortDir === "asc" ? "desc" : "asc") : "asc",
    );
  }

  async function refetch(
    targetPage: number,
    overrideSortBy?: LeadSortColumn,
    overrideSortDir?: "asc" | "desc",
  ) {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (search.trim()) params.set("q", search.trim());
    params.set("sortBy", overrideSortBy ?? sortBy);
    params.set("sortDir", overrideSortDir ?? sortDir);
    params.set("page", String(targetPage));

    setListError(null);
    try {
      const response = await fetch(`/api/leads?${params.toString()}`);
      if (!response.ok) {
        setListError(
          await parseErrorMessage(
            response,
            "Could not load the leads list.",
            LEAD_ERROR_STATUS_MESSAGES,
          ),
        );
        return;
      }
      const body = await response.json();
      const newLeads: LeadWithSale[] = body.leads ?? [];
      setLeads(newLeads);
      setTotal(body.total ?? 0);
      setTotalPages(body.totalPages ?? 1);
      setPage(targetPage);
      const newLeadIds = new Set(newLeads.map((l) => l.id));
      setSelectedLeadIds(
        (current) =>
          new Set(Array.from(current).filter((id) => newLeadIds.has(id))),
      );
    } catch {
      setListError("Could not load the leads list.");
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refetch(1);
  }

  // Re-searches automatically once typing pauses, instead of making the
  // user click Apply filters — the initial mount's "pause" is skipped so
  // it doesn't immediately re-fetch the page the server already rendered.
  const debouncedSearch = useDebouncedValue(search, 350);
  const skippedFirstSearch = useRef(false);
  useEffect(() => {
    if (!skippedFirstSearch.current) {
      skippedFirstSearch.current = true;
      return;
    }
    void refetch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // The manual Refresh button covers "I want it now"; this covers "I left
  // the tab open" — one background re-fetch every 5 minutes, same page and
  // filters, instead of polling continuously.
  useAutoRefresh(() => {
    void refetch(page);
  });

  // Bulk transfer
  const canBulkTransfer = viewerRole === "MARKETING_HEAD";
  // Selection is also used for export, so every role that can see this list
  // gets the checkbox column, not just roles that can bulk-transfer.
  const canSelectLeads = true;
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(
    new Set(),
  );
  const [preSalesOptions, setPreSalesOptions] = useState<SimpleUser[]>([]);
  const [salespersonOptions, setSalespersonOptions] = useState<SimpleUser[]>(
    [],
  );
  const [bulkTransferOpen, setBulkTransferOpen] = useState(false);
  const [bulkTransferPreSales, setBulkTransferPreSales] = useState("");
  const [bulkTransferSalesperson, setBulkTransferSalesperson] = useState("");
  const [bulkTransferReason, setBulkTransferReason] = useState("");
  const [bulkTransferError, setBulkTransferError] = useState<string | null>(
    null,
  );
  const [bulkTransferConfirming, setBulkTransferConfirming] = useState(false);
  const [bulkTransferSubmitting, setBulkTransferSubmitting] = useState(false);

  // Only the Transfer modal needs this roster — fetching it on mount for
  // every visitor (most of whom never open that modal) was two wasted
  // requests per page load. Loaded once, the first time it's opened.
  const transferRosterLoaded = useRef(false);
  function loadTransferRoster() {
    if (transferRosterLoaded.current || !canBulkTransfer) return;
    transferRosterLoaded.current = true;
    fetch("/api/users?role=PRE_SALES&status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body) => setPreSalesOptions(body.users ?? []))
      .catch(() => {});
    fetch("/api/users?role=SALESPERSON&status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body) => setSalespersonOptions(body.users ?? []))
      .catch(() => {});
  }

  function toggleLeadSelected(id: number) {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedLeadIds((current) =>
      current.size === leads.length
        ? new Set()
        : new Set(leads.map((l) => l.id)),
    );
  }

  function exportLeads(format: "csv" | "xlsx") {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (search.trim()) params.set("q", search.trim());
    if (selectedLeadIds.size > 0)
      params.set("ids", Array.from(selectedLeadIds).join(","));
    params.set("format", format);
    // An anchor click (not `location.assign`) so the browser treats this as
    // a file download via the response's Content-Disposition header, rather
    // than a page navigation.
    const link = document.createElement("a");
    link.href = `/api/leads/export?${params.toString()}`;
    link.click();
  }

  function openBulkTransfer() {
    loadTransferRoster();
    setBulkTransferPreSales("");
    setBulkTransferSalesperson("");
    setBulkTransferReason("");
    setBulkTransferError(null);
    setBulkTransferOpen(true);
  }

  // Per-row "…" menu. It's rendered through a portal at a fixed position
  // computed from the trigger button, rather than absolutely inside the
  // table cell — the table's horizontal-scroll wrapper clips any
  // vertical overflow too (an `overflow-x` other than `visible` forces the
  // other axis out of `visible` as well), which clipped the dropdown
  // before it could show at all.
  const [openMenu, setOpenMenu] = useState<{
    leadId: number;
    top: number;
    left: number;
  } | null>(null);

  function toggleMenu(leadId: number, event: MouseEvent<HTMLButtonElement>) {
    if (openMenu?.leadId === leadId) {
      setOpenMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setOpenMenu({ leadId, top: rect.bottom + 4, left: rect.right - 160 });
  }

  function openTransferForLead(leadId: number) {
    setOpenMenu(null);
    setSelectedLeadIds(new Set([leadId]));
    openBulkTransfer();
  }

  // Archiving is one-way (no "unarchive") — see lib/leads/update.ts — so
  // this confirms before calling it, the same precaution Team's
  // activate/deactivate confirmation uses for its own account-status change.
  const [archiveTarget, setArchiveTarget] = useState<LeadWithSale | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  function openArchiveConfirm(lead: LeadWithSale) {
    setArchiveError(null);
    setArchiveTarget(lead);
    setOpenMenu(null);
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const response = await fetch(`/api/leads/${archiveTarget.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(
          response,
          "Could not archive the lead.",
          LEAD_ERROR_STATUS_MESSAGES,
        );
        setArchiveError(message);
        toast.error("Could not archive lead", message);
        setArchiving(false);
        return;
      }
      setLeads((current) => current.filter((l) => l.id !== archiveTarget.id));
      setTotal((current) => Math.max(0, current - 1));
      toast.success("Lead archived", archiveTarget.company_name);
      setArchiveTarget(null);
    } catch {
      setArchiveError("Could not archive the lead.");
      toast.error("Could not archive lead");
    } finally {
      setArchiving(false);
    }
  }

  function reviewBulkTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bulkTransferReason.trim()) {
      setBulkTransferError("A reason is required to transfer a lead");
      return;
    }
    if (!bulkTransferPreSales && !bulkTransferSalesperson) {
      setBulkTransferError("Choose a new Pre-sales owner or Salesperson.");
      return;
    }
    setBulkTransferError(null);
    setBulkTransferOpen(false);
    setBulkTransferConfirming(true);
  }

  async function confirmBulkTransfer() {
    setBulkTransferSubmitting(true);
    setBulkTransferError(null);
    try {
      const response = await fetch("/api/leads/transfer-bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadIds: Array.from(selectedLeadIds),
          newPreSalesOwnerId: bulkTransferPreSales
            ? Number(bulkTransferPreSales)
            : undefined,
          newSalespersonOwnerId: bulkTransferSalesperson
            ? Number(bulkTransferSalesperson)
            : undefined,
          reason: bulkTransferReason.trim(),
        }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(
          response,
          "Could not transfer the selected leads.",
          LEAD_ERROR_STATUS_MESSAGES,
        );
        setBulkTransferError(message);
        toast.error("Could not transfer leads", message);
        setBulkTransferSubmitting(false);
        return;
      }
      toast.success(
        `${selectedLeadIds.size} lead${selectedLeadIds.size === 1 ? "" : "s"} transferred`,
      );
      await refetch(page);
      setSelectedLeadIds(new Set());
      setBulkTransferSubmitting(false);
      setBulkTransferConfirming(false);
    } catch {
      setBulkTransferError("Could not transfer the selected leads.");
      toast.error("Could not transfer leads");
      setBulkTransferSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Leads"
        count={total}
        crumbs={[{ label: "Leads" }]}
        actions={
          <>
            <RefreshButton onRefresh={() => refetch(page)} />
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen((value) => !value)}
                title={
                  selectedLeadIds.size > 0
                    ? `Export ${selectedLeadIds.size} selected lead(s)`
                    : "Export all matching leads"
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-4 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <i className="ri-download-2-line" aria-hidden="true" />
                Export
                {selectedLeadIds.size > 0 ? ` (${selectedLeadIds.size})` : ""}
                <i className="ri-arrow-down-s-line" aria-hidden="true" />
              </button>
              {exportMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close export menu"
                    onClick={() => setExportMenuOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        exportLeads("csv");
                        setExportMenuOpen(false);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        exportLeads("xlsx");
                        setExportMenuOpen(false);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      Excel
                    </button>
                  </div>
                </>
              )}
            </div>
            {canBulkTransfer && selectedLeadIds.size > 0 && (
              <button
                type="button"
                onClick={openBulkTransfer}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-brand-300 px-4 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                Transfer selected ({selectedLeadIds.size})
              </button>
            )}
            {canCreate && (
              <Link
                href="/leads/new"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-1 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
              >
                <i className="ri-add-line text-base" aria-hidden="true" />
                New Lead
              </Link>
            )}
          </>
        }
      />
      {/* Desktop: filter bar + table + pagination share one bordered card. */}
      <div className="hidden rounded-lg border border-zinc-200 bg-white sm:block">
        <div className="flex flex-col gap-4 border-b border-zinc-200 p-4">
          <form
            onSubmit={handleFilterSubmit}
            className="flex flex-wrap items-center gap-2.5"
          >
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <i
                className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                id="search"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by company, phone, or email…"
                aria-label="Search leads"
                className="w-full rounded-md border border-zinc-300 py-2 pl-9 pr-3 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <FilterDropdown
              icon="ri-checkbox-circle-line"
              ariaLabel="Filter by status"
              value={statusFilter}
              options={[
                { value: "", label: "All statuses" },
                ...LEAD_STATUSES.map((status) => ({
                  value: status,
                  label: LEAD_STATUS_LABELS[status],
                })),
              ]}
              onChange={setStatusFilter}
            />

            <FilterDropdown
              icon="ri-global-line"
              ariaLabel="Filter by source"
              value={sourceFilter}
              options={[
                { value: "", label: "All sources" },
                ...LEAD_SOURCES.map((source) => ({
                  value: source,
                  label: LEAD_SOURCE_LABELS[source],
                })),
              ]}
              onChange={setSourceFilter}
            />

            <FilterDropdown
              icon="ri-flashlight-line"
              ariaLabel="Filter by priority"
              value={priorityFilter}
              options={[
                { value: "", label: "All priorities" },
                ...LEAD_PRIORITIES.map((p) => ({
                  value: p,
                  label: LEAD_PRIORITY_LABELS[p],
                })),
              ]}
              onChange={setPriorityFilter}
            />

            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => {
                setDateFrom(f);
                setDateTo(t);
              }}
            />

            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              Apply filters
            </button>
          </form>
        </div>

        {listError && (
          <p role="alert" className="px-4 pt-4 text-sm text-red-600">
            {listError}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="table-responsive min-w-full divide-y divide-zinc-200 text-sm">
            <thead>
              <tr className="border-b border-zinc-200">
                {canSelectLeads && (
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all leads"
                      checked={
                        leads.length > 0 &&
                        selectedLeadIds.size === leads.length
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-zinc-500"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("company_name")}
                    className="inline-flex items-center gap-1 hover:text-zinc-700"
                  >
                    Company
                    <i
                      className={
                        sortBy === "company_name"
                          ? sortDir === "asc"
                            ? "ri-arrow-up-line"
                            : "ri-arrow-down-line"
                          : "ri-expand-up-down-line text-zinc-300"
                      }
                      aria-hidden="true"
                    />
                  </button>
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-zinc-500"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-zinc-500"
                >
                  Outcome
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-zinc-500"
                >
                  Priority
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-zinc-500"
                >
                  Owner
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-zinc-500"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("created_at")}
                    className="inline-flex items-center gap-1 hover:text-zinc-700"
                  >
                    Created at
                    <i
                      className={
                        sortBy === "created_at"
                          ? sortDir === "asc"
                            ? "ri-arrow-up-line"
                            : "ri-arrow-down-line"
                          : "ri-expand-up-down-line text-zinc-300"
                      }
                      aria-hidden="true"
                    />
                  </button>
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold text-zinc-500"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {leads.length === 0 && (
                <tr>
                  <td
                    colSpan={canSelectLeads ? 8 : 7}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No leads found.
                  </td>
                </tr>
              )}
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="transition-colors hover:bg-zinc-50/80"
                >
                  {canSelectLeads && (
                    <td data-label="" className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${lead.company_name}`}
                        checked={selectedLeadIds.has(lead.id)}
                        onChange={() => toggleLeadSelected(lead.id)}
                      />
                    </td>
                  )}
                  <td data-label="Company" className="px-4 py-3">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {lead.company_name}
                    </Link>
                    <p className="flex items-center gap-1 text-xs text-zinc-500">
                      <i className="ri-phone-line" aria-hidden="true" />
                      {lead.phone}
                    </p>
                  </td>
                  <td data-label="Status" className="px-4 py-3">
                    <Badge
                      icon={LEAD_STATUS_ICONS[lead.status]}
                      className={LEAD_STATUS_BADGE_CLASSES[lead.status]}
                    >
                      {LEAD_STATUS_LABELS[lead.status]}
                    </Badge>
                  </td>
                  <td data-label="Outcome" className="px-4 py-3 text-xs">
                    {lead.latest_sale_id != null ? (
                      <>
                        <p className="font-medium text-emerald-700">
                          Converted to sale
                        </p>
                        <p className="text-zinc-500">
                          ₹
                          {Number(
                            lead.latest_sale_paid_amount ?? 0,
                          ).toLocaleString("en-IN")}{" "}
                          / ₹
                          {Number(
                            lead.latest_sale_budget_amount ?? 0,
                          ).toLocaleString("en-IN")}{" "}
                          paid
                        </p>
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td data-label="Priority" className="px-4 py-3">
                    <Badge
                      icon={LEAD_PRIORITY_ICONS[lead.priority]}
                      className={LEAD_PRIORITY_BADGE_CLASSES[lead.priority]}
                    >
                      {LEAD_PRIORITY_LABELS[lead.priority]}
                    </Badge>
                  </td>
                  <td data-label="Owner" className="px-4 py-3 text-xs">
                    {lead.salesperson_owner_name ||
                    lead.pre_sales_owner_name ? (
                      <span className="inline-flex items-center gap-1.5 text-zinc-700">
                        <i
                          className="ri-user-line text-sm text-zinc-400"
                          aria-hidden="true"
                        />
                        {lead.salesperson_owner_name ||
                          lead.pre_sales_owner_name}
                      </span>
                    ) : (
                      <span className="text-zinc-400">Unassigned</span>
                    )}
                  </td>
                  <td
                    data-label="Created at"
                    className="px-4 py-3 text-xs text-zinc-600"
                  >
                    <p>
                      {new Date(lead.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-zinc-400">
                      {new Date(lead.created_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </td>
                  <td data-label="" className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Actions for ${lead.company_name}`}
                      onClick={(event) => toggleMenu(lead.id, event)}
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <i className="ri-more-2-line" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onChange={(nextPage) => refetch(nextPage)}
        />
      </div>

      {/* Mobile: the filter bar is its own card, separate from the list
          below (not one shared outer box) — and the filters themselves
          collapse into a single "Filter" button that opens
          FilterBottomSheet, instead of cramming 3 dropdowns + a date range
          into a wrapping row on a phone-width screen. */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 sm:hidden">
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <i
              className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by company, phone, or email…"
              aria-label="Search leads"
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

      {listError && (
        <p role="alert" className="text-sm text-red-600 sm:hidden">
          {listError}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:hidden">
        {leads.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500">
            No leads found.
          </p>
        )}
        {leads.map((lead) => (
          <div
            key={lead.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/leads/${lead.id}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter") router.push(`/leads/${lead.id}`);
            }}
            className="cursor-pointer rounded-lg bg-white px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900">{lead.company_name}</p>
              {canSelectLeads && (
                <input
                  type="checkbox"
                  aria-label={`Select ${lead.company_name}`}
                  checked={selectedLeadIds.has(lead.id)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggleLeadSelected(lead.id)}
                  className="mt-0.5 shrink-0"
                />
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span className="flex items-center gap-1 text-zinc-900/80">
                <i className="ri-phone-line" aria-hidden="true" />
                {lead.phone}
              </span>
              <span
                className={`flex items-center gap-1 text-[10px] font-medium ${LEAD_STATUS_BADGE_CLASSES[
                  lead.status
                ]
                  .split(" ")
                  .filter((c) => c.startsWith("text-"))
                  .join(" ")}`}
              >
                <i
                  className={LEAD_STATUS_ICONS[lead.status]}
                  aria-hidden="true"
                />
                {LEAD_STATUS_LABELS[lead.status]}
              </span>
              <span className="flex items-center gap-1 font-medium text-zinc-900">
                <i className="ri-user-line text-zinc-400" aria-hidden="true" />
                {lead.salesperson_owner_name ||
                  lead.pre_sales_owner_name ||
                  "Unassigned"}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3">
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <i className="ri-calendar-line" aria-hidden="true" />
                  {new Date(lead.created_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span aria-hidden="true">•</span>
                <span className="flex items-center gap-1">
                  <i className="ri-time-line" aria-hidden="true" />
                  {new Date(lead.created_at).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${LEAD_PRIORITY_BADGE_CLASSES[lead.priority]}`}
                >
                  <i
                    className={LEAD_PRIORITY_ICONS[lead.priority]}
                    aria-hidden="true"
                  />
                  {LEAD_PRIORITY_LABELS[lead.priority]}
                </span>
                <button
                  type="button"
                  aria-label={`Actions for ${lead.company_name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleMenu(lead.id, event);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <i className="ri-more-2-line" aria-hidden="true" />
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="rounded-lg border border-zinc-200 bg-white sm:hidden">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onChange={(nextPage) => refetch(nextPage)}
          />
        </div>
      )}

      <FilterBottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        onApply={() => {
          setFilterSheetOpen(false);
          void refetch(1);
        }}
      >
        <FilterDropdown
          fullWidth
          icon="ri-checkbox-circle-line"
          ariaLabel="Filter by status"
          value={statusFilter}
          options={[
            { value: "", label: "All statuses" },
            ...LEAD_STATUSES.map((status) => ({
              value: status,
              label: LEAD_STATUS_LABELS[status],
            })),
          ]}
          optionIcons={LEAD_STATUS_ICONS}
          onChange={setStatusFilter}
        />
        <FilterDropdown
          fullWidth
          searchable
          icon="ri-global-line"
          ariaLabel="Filter by source"
          value={sourceFilter}
          options={[
            { value: "", label: "All sources" },
            ...LEAD_SOURCES.map((source) => ({
              value: source,
              label: LEAD_SOURCE_LABELS[source],
            })),
          ]}
          optionIcons={LEAD_SOURCE_ICONS}
          onChange={setSourceFilter}
        />
        <FilterDropdown
          fullWidth
          icon="ri-flashlight-line"
          ariaLabel="Filter by priority"
          value={priorityFilter}
          options={[
            { value: "", label: "All priorities" },
            ...LEAD_PRIORITIES.map((p) => ({
              value: p,
              label: LEAD_PRIORITY_LABELS[p],
            })),
          ]}
          optionIcons={LEAD_PRIORITY_ICONS}
          onChange={setPriorityFilter}
        />
        <div>
          <button
            type="button"
            onClick={() => setDateRangeOpen((value) => !value)}
            aria-expanded={dateRangeOpen}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            <span className="flex items-center gap-2 truncate">
              <i
                className="ri-calendar-line text-brand-600"
                aria-hidden="true"
              />
              {formatDateDisplay(dateFrom) || formatDateDisplay(dateTo) ? (
                <span className="truncate">
                  {formatDateDisplay(dateFrom) ?? "…"} –{" "}
                  {formatDateDisplay(dateTo) ?? "…"}
                </span>
              ) : (
                <span className="text-zinc-500">Date range</span>
              )}
            </span>
            <i
              className={`ri-arrow-down-s-line shrink-0 text-zinc-400 transition-transform ${dateRangeOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          {dateRangeOpen && (
            <div className="animate-fade-slide-in mt-2">
              <DateRangeFilter
                inline
                from={dateFrom}
                to={dateTo}
                onChange={(f, t) => {
                  setDateFrom(f);
                  setDateTo(t);
                }}
              />
            </div>
          )}
        </div>
      </FilterBottomSheet>

      {openMenu &&
        (() => {
          const menuLead = leads.find((l) => l.id === openMenu.leadId);
          if (!menuLead) return null;
          const editable = canEditLead(menuLead);
          return createPortal(
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpenMenu(null)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                style={{ top: openMenu.top, left: openMenu.left }}
                className="fixed z-50 w-40 rounded-md border border-zinc-200 bg-white py-1 text-left shadow-lg"
              >
                <Link
                  href={`/leads/${menuLead.id}`}
                  onClick={() => setOpenMenu(null)}
                  className="block px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  View details
                </Link>
                {editable && (
                  <Link
                    href={`/leads/${menuLead.id}/edit`}
                    onClick={() => setOpenMenu(null)}
                    className="block px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Edit
                  </Link>
                )}
                {canBulkTransfer && (
                  <button
                    type="button"
                    onClick={() => openTransferForLead(menuLead.id)}
                    className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Transfer
                  </button>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => openArchiveConfirm(menuLead)}
                    className="block w-full px-3 py-1.5 text-left text-sm text-rose-700 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </>,
            document.body,
          );
        })()}

      {archiveTarget && (
        <ConfirmDialog
          title={`Delete ${archiveTarget.company_name}?`}
          description="This moves the lead to the Archive. It can't be undone from here."
          error={archiveError}
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          pending={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setArchiveTarget(null)}
        />
      )}

      {bulkTransferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">
              Transfer {selectedLeadIds.size} lead
              {selectedLeadIds.size === 1 ? "" : "s"}
            </h2>
            <form
              onSubmit={reviewBulkTransfer}
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="bulkTransferPreSales"
                  className="text-sm font-medium text-zinc-700"
                >
                  New Pre-sales owner
                </label>
                <select
                  id="bulkTransferPreSales"
                  value={bulkTransferPreSales}
                  onChange={(event) =>
                    setBulkTransferPreSales(event.target.value)
                  }
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  <option value="">Unchanged</option>
                  {preSalesOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="bulkTransferSalesperson"
                  className="text-sm font-medium text-zinc-700"
                >
                  New Salesperson
                </label>
                <select
                  id="bulkTransferSalesperson"
                  value={bulkTransferSalesperson}
                  onChange={(event) =>
                    setBulkTransferSalesperson(event.target.value)
                  }
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  <option value="">Unchanged</option>
                  {salespersonOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="bulkTransferReason"
                  className="text-sm font-medium text-zinc-700"
                >
                  Reason
                </label>
                <textarea
                  id="bulkTransferReason"
                  value={bulkTransferReason}
                  onChange={(event) =>
                    setBulkTransferReason(event.target.value)
                  }
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              {bulkTransferError && (
                <p role="alert" className="text-sm text-red-600">
                  {bulkTransferError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setBulkTransferOpen(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
                >
                  Review transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkTransferConfirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-zinc-900">
              Confirm bulk transfer
            </h2>
            <p className="mb-4 text-sm text-zinc-600">
              Are you sure you want to transfer {selectedLeadIds.size} lead
              {selectedLeadIds.size === 1 ? "" : "s"}?
            </p>
            {bulkTransferError && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {bulkTransferError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBulkTransferConfirming(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkTransfer}
                disabled={bulkTransferSubmitting}
                className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Yes, transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
