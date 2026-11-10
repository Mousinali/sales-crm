"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import type { CompanySummary } from "@/lib/companies/types";
import Pagination from "@/components/ui/Pagination";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";

export default function CompaniesView({
  initialCompanies,
  initialTotal,
  initialTotalPages,
}: {
  initialCompanies: CompanySummary[];
  initialTotal: number;
  initialTotalPages: number;
}) {
  const [companies, setCompanies] = useState<CompanySummary[]>(initialCompanies);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [listError, setListError] = useState<string | null>(null);

  async function refetch(targetPage: number) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    params.set("page", String(targetPage));

    setListError(null);
    try {
      const response = await fetch(`/api/companies?${params.toString()}`);
      if (!response.ok) {
        setListError("Could not load the companies list.");
        return;
      }
      const body = await response.json();
      setCompanies(body.companies ?? []);
      setTotal(body.total ?? 0);
      setTotalPages(body.totalPages ?? 1);
      setPage(targetPage);
    } catch {
      setListError("Could not load the companies list.");
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refetch(1);
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
    void refetch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useAutoRefresh(() => {
    void refetch(page);
  });

  // One-way, same precaution as archiving a lead (lib/leads/update.ts) —
  // deleting a company archives every lead under it, with no unarchive path.
  const [archiveTarget, setArchiveTarget] = useState<CompanySummary | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const response = await fetch(`/api/companies/${archiveTarget.company_name_normalized}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not archive the company.");
        setArchiveError(message);
        toast.error("Could not archive company", message);
        setArchiving(false);
        return;
      }
      setCompanies((current) => current.filter((c) => c.company_name_normalized !== archiveTarget.company_name_normalized));
      setTotal((current) => Math.max(0, current - 1));
      toast.success("Company archived", archiveTarget.company_name);
      setArchiveTarget(null);
    } catch {
      setArchiveError("Could not archive the company.");
      toast.error("Could not archive company");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <span className="text-sm text-zinc-500">{total} compan{total === 1 ? "y" : "ies"}</span>
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search companies…"
            aria-label="Search companies"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Search
          </button>
        </form>
      </div>

      {listError && (
        <p role="alert" className="px-4 py-3 text-sm text-red-600">
          {listError}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="table-responsive w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Leads</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                  No companies yet.
                </td>
              </tr>
            )}
            {companies.map((company) => (
              <tr key={company.company_name_normalized} className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/80">
                <td data-label="Company" className="px-4 py-3">
                  <Link href={`/companies/${company.company_name_normalized}`} className="font-medium text-brand-700 hover:underline">
                    {company.company_name}
                  </Link>
                </td>
                <td data-label="Industry" className="px-4 py-3 text-zinc-700">{company.industry ?? "—"}</td>
                <td data-label="Location" className="px-4 py-3 text-zinc-700">{[company.location, company.state].filter(Boolean).join(", ") || "—"}</td>
                <td data-label="Contact" className="px-4 py-3">
                  <p className="text-zinc-700">{company.phone ?? "—"}</p>
                  <p className="text-xs text-zinc-500">{company.email ?? "—"}</p>
                </td>
                <td data-label="Leads" className="px-4 py-3 text-zinc-700">{company.lead_count}</td>
                <td data-label="" className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setArchiveError(null);
                      setArchiveTarget(company);
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onChange={refetch} />

      {archiveTarget && (
        <ConfirmDialog
          title={`Delete ${archiveTarget.company_name}?`}
          description={`This moves all ${archiveTarget.lead_count} of its lead${archiveTarget.lead_count === 1 ? "" : "s"} to the Archive. It can't be undone from here.`}
          error={archiveError}
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          pending={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
    </div>
  );
}
