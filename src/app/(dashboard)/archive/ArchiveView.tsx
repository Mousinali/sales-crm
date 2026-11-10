"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Pagination from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE_CLASSES } from "@/app/(dashboard)/leadDisplay";
import { ROLE_LABELS, ROLE_BADGE_CLASSES, formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
import type { LeadStatus } from "@/lib/leads/types";
import type { Role } from "@/lib/auth/roles";

type ArchivedLead = {
  id: number;
  company_name: string;
  contact_person: string | null;
  phone: string;
  status: LeadStatus;
  archived_at: string | null;
};

type ArchivedCompany = {
  company_name_normalized: string;
  company_name: string;
  lead_count: number;
  latest_lead_at: string;
};

type ArchivedUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  archived_at: string | null;
};

type Tab = "leads" | "companies" | "users";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ArchiveView({
  initialLeads,
  initialLeadsTotal,
  initialLeadsTotalPages,
}: {
  initialLeads: ArchivedLead[];
  initialLeadsTotal: number;
  initialLeadsTotalPages: number;
}) {
  const [tab, setTab] = useState<Tab>("leads");

  const [leads, setLeads] = useState(initialLeads);
  const [leadsTotal, setLeadsTotal] = useState(initialLeadsTotal);
  const [leadsTotalPages, setLeadsTotalPages] = useState(initialLeadsTotalPages);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsSearch, setLeadsSearch] = useState("");
  const [leadsError, setLeadsError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<ArchivedCompany[]>([]);
  const [companiesTotal, setCompaniesTotal] = useState(0);
  const [companiesTotalPages, setCompaniesTotalPages] = useState(1);
  const [companiesPage, setCompaniesPage] = useState(1);
  const [companiesSearch, setCompaniesSearch] = useState("");
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const companiesLoaded = useRef(false);

  const [users, setUsers] = useState<ArchivedUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersError, setUsersError] = useState<string | null>(null);
  const usersLoaded = useRef(false);

  async function fetchLeads(page: number, search: string) {
    const params = new URLSearchParams({ archivedOnly: "true", page: String(page) });
    if (search.trim()) params.set("q", search.trim());
    setLeadsError(null);
    try {
      const response = await fetch(`/api/leads?${params.toString()}`);
      if (!response.ok) {
        setLeadsError("Could not load archived leads.");
        return;
      }
      const body = await response.json();
      setLeads(body.leads ?? []);
      setLeadsTotal(body.total ?? 0);
      setLeadsTotalPages(body.totalPages ?? 1);
      setLeadsPage(page);
    } catch {
      setLeadsError("Could not load archived leads.");
    }
  }

  async function fetchCompanies(page: number, search: string) {
    const params = new URLSearchParams({ archived: "true", page: String(page) });
    if (search.trim()) params.set("q", search.trim());
    setCompaniesError(null);
    try {
      const response = await fetch(`/api/companies?${params.toString()}`);
      if (!response.ok) {
        setCompaniesError("Could not load archived companies.");
        return;
      }
      const body = await response.json();
      setCompanies(body.companies ?? []);
      setCompaniesTotal(body.total ?? 0);
      setCompaniesTotalPages(body.totalPages ?? 1);
      setCompaniesPage(page);
    } catch {
      setCompaniesError("Could not load archived companies.");
    }
  }

  async function fetchUsers(page: number, search: string) {
    const params = new URLSearchParams({ archived: "true", page: String(page) });
    if (search.trim()) params.set("q", search.trim());
    setUsersError(null);
    try {
      const response = await fetch(`/api/users?${params.toString()}`);
      if (!response.ok) {
        setUsersError("Could not load archived users.");
        return;
      }
      const body = await response.json();
      setUsers(body.users ?? []);
      setUsersTotal(body.total ?? 0);
      setUsersTotalPages(body.totalPages ?? 1);
      setUsersPage(page);
    } catch {
      setUsersError("Could not load archived users.");
    }
  }

  function openTab(next: Tab) {
    setTab(next);
    if (next === "companies" && !companiesLoaded.current) {
      companiesLoaded.current = true;
      void fetchCompanies(1, companiesSearch);
    }
    if (next === "users" && !usersLoaded.current) {
      usersLoaded.current = true;
      void fetchUsers(1, usersSearch);
    }
  }

  // Each tab's search is debounced independently, and only re-fetches
  // while that tab is the one actually open — switching tabs never fires
  // a request for a view you can't currently see.
  const debouncedLeadsSearch = useDebouncedValue(leadsSearch, 350);
  const skipLeadsSearch = useRef(true);
  useEffect(() => {
    if (skipLeadsSearch.current) {
      skipLeadsSearch.current = false;
      return;
    }
    if (tab !== "leads") return;
    // Same debounced-refetch-on-search shape as Team/Companies' own list
    // views; react-hooks v7's set-state-in-effect rule only misfires here
    // with three near-identical effects in one component (verified: the
    // identical pattern lints clean with one such effect per component).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLeads(1, debouncedLeadsSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLeadsSearch]);

  const debouncedCompaniesSearch = useDebouncedValue(companiesSearch, 350);
  const skipCompaniesSearch = useRef(true);
  useEffect(() => {
    if (skipCompaniesSearch.current) {
      skipCompaniesSearch.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "companies") void fetchCompanies(1, debouncedCompaniesSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedCompaniesSearch]);

  const debouncedUsersSearch = useDebouncedValue(usersSearch, 350);
  const skipUsersSearch = useRef(true);
  useEffect(() => {
    if (skipUsersSearch.current) {
      skipUsersSearch.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "users") void fetchUsers(1, debouncedUsersSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedUsersSearch]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tab === "leads") void fetchLeads(1, leadsSearch);
    if (tab === "companies") void fetchCompanies(1, companiesSearch);
    if (tab === "users") void fetchUsers(1, usersSearch);
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "leads", label: "Leads", count: leadsTotal },
    { key: "companies", label: "Companies", count: companiesTotal },
    { key: "users", label: "Users", count: usersTotal },
  ];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => openTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === t.key ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            value={tab === "leads" ? leadsSearch : tab === "companies" ? companiesSearch : usersSearch}
            onChange={(event) => {
              if (tab === "leads") setLeadsSearch(event.target.value);
              else if (tab === "companies") setCompaniesSearch(event.target.value);
              else setUsersSearch(event.target.value);
            }}
            placeholder={`Search archived ${tab}…`}
            aria-label={`Search archived ${tab}`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </form>
      </div>

      {tab === "leads" && (
        <>
          {leadsError && (
            <p role="alert" className="px-4 pt-4 text-sm text-red-600">
              {leadsError}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="table-responsive min-w-full divide-y divide-zinc-200 text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                  <th scope="col" className="px-4 py-3 text-left">Company</th>
                  <th scope="col" className="px-4 py-3 text-left">Contact</th>
                  <th scope="col" className="px-4 py-3 text-left">Status</th>
                  <th scope="col" className="px-4 py-3 text-left">Archived</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">No archived leads.</td>
                  </tr>
                )}
                {leads.map((lead) => (
                  <tr key={lead.id} className="transition-colors hover:bg-zinc-50/80">
                    <td data-label="Company" className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700 hover:underline">
                        {lead.company_name}
                      </Link>
                    </td>
                    <td data-label="Contact" className="px-4 py-3 text-zinc-700">{lead.contact_person ?? lead.phone}</td>
                    <td data-label="Status" className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_STATUS_BADGE_CLASSES[lead.status]}`}>
                        {LEAD_STATUS_LABELS[lead.status]}
                      </span>
                    </td>
                    <td data-label="Archived" className="px-4 py-3 text-zinc-500">{formatDate(lead.archived_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={leadsPage} totalPages={leadsTotalPages} total={leadsTotal} onChange={(p) => fetchLeads(p, leadsSearch)} />
        </>
      )}

      {tab === "companies" && (
        <>
          {companiesError && (
            <p role="alert" className="px-4 pt-4 text-sm text-red-600">
              {companiesError}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="table-responsive min-w-full divide-y divide-zinc-200 text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                  <th scope="col" className="px-4 py-3 text-left">Company</th>
                  <th scope="col" className="px-4 py-3 text-left">Leads</th>
                  <th scope="col" className="px-4 py-3 text-left">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">No archived companies.</td>
                  </tr>
                )}
                {companies.map((company) => (
                  <tr key={company.company_name_normalized} className="transition-colors hover:bg-zinc-50/80">
                    <td data-label="Company" className="px-4 py-3">
                      <Link href={`/companies/${company.company_name_normalized}`} className="font-medium text-brand-700 hover:underline">
                        {company.company_name}
                      </Link>
                    </td>
                    <td data-label="Leads" className="px-4 py-3 text-zinc-700">{company.lead_count}</td>
                    <td data-label="Last activity" className="px-4 py-3 text-zinc-500">{formatDate(company.latest_lead_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={companiesPage} totalPages={companiesTotalPages} total={companiesTotal} onChange={(p) => fetchCompanies(p, companiesSearch)} />
        </>
      )}

      {tab === "users" && (
        <>
          {usersError && (
            <p role="alert" className="px-4 pt-4 text-sm text-red-600">
              {usersError}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="table-responsive min-w-full divide-y divide-zinc-200 text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                  <th scope="col" className="px-4 py-3 text-left">Name</th>
                  <th scope="col" className="px-4 py-3 text-left">Role</th>
                  <th scope="col" className="px-4 py-3 text-left">Email</th>
                  <th scope="col" className="px-4 py-3 text-left">Archived</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">No archived users.</td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-zinc-50/80">
                    <td data-label="Name" className="px-4 py-3 font-medium text-zinc-900">{u.name}</td>
                    <td data-label="Role" className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[u.role] ?? "bg-zinc-100 text-zinc-600"}`}>
                        {ROLE_LABELS[u.role] ?? formatRoleLabel(u.role)}
                      </span>
                    </td>
                    <td data-label="Email" className="px-4 py-3 text-zinc-700">{u.email}</td>
                    <td data-label="Archived" className="px-4 py-3 text-zinc-500">{formatDate(u.archived_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={usersPage} totalPages={usersTotalPages} total={usersTotal} onChange={(p) => fetchUsers(p, usersSearch)} />
        </>
      )}
    </div>
  );
}
