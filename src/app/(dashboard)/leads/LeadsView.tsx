"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { LEAD_SOURCES, LEAD_PRIORITIES, LEAD_STATUSES, type LeadSource, type LeadPriority, type LeadStatus } from "../../../lib/leads/types";
import type { LeadRow } from "../../../lib/leads/types";
import type { Role } from "../../../lib/auth/roles";
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE_CLASSES, LEAD_PRIORITY_LABELS, LEAD_PRIORITY_BADGE_CLASSES } from "../leadDisplay";

type DuplicateMatch = { id: number; companyName: string; status: LeadStatus };

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") {
      if (response.status === 403) return "You are not allowed to do that.";
      if (response.status === 404) return "That lead no longer exists.";
      return body.error;
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}

export default function LeadsView({
  initialLeads,
  viewerRole,
}: {
  initialLeads: LeadRow[];
  viewerRole: Role;
}) {
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "">("");
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [listError, setListError] = useState<string | null>(null);

  const canCreate = viewerRole === "PRE_SALES" || viewerRole === "MARKETING_HEAD";

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [serviceRequirements, setServiceRequirements] = useState("");
  const [leadSource, setLeadSource] = useState<LeadSource>(LEAD_SOURCES[0]);
  const [priority, setPriority] = useState<LeadPriority>("MEDIUM");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);

  async function refetch() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (search.trim()) params.set("q", search.trim());

    setListError(null);
    try {
      const response = await fetch(`/api/leads${params.toString() ? `?${params.toString()}` : ""}`);
      if (!response.ok) {
        setListError(await parseErrorMessage(response, "Could not load the leads list."));
        return;
      }
      const body = await response.json();
      setLeads(body.leads ?? []);
    } catch {
      setListError("Could not load the leads list.");
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refetch();
  }

  function openCreateModal() {
    setCompanyName("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setWebsite("");
    setServiceRequirements("");
    setLeadSource(LEAD_SOURCES[0]);
    setPriority("MEDIUM");
    setCreateError(null);
    setDuplicates([]);
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
  }

  async function checkDuplicates() {
    if (!companyName.trim()) return;
    // The duplicates endpoint requires both companyName and phone, but the
    // check is advisory: fire it as soon as the company name is filled in
    // (the usual case is company name first, phone second), and let a 400
    // from an incomplete query resolve to "no warning yet" rather than
    // waiting for every field before checking at all.
    const params = new URLSearchParams({ companyName: companyName.trim(), phone: phone.trim() });
    if (email.trim()) params.set("email", email.trim());
    if (website.trim()) params.set("website", website.trim());
    try {
      const response = await fetch(`/api/leads/duplicates?${params.toString()}`);
      if (!response.ok) return;
      const body = await response.json();
      setDuplicates(body.duplicates ?? []);
    } catch {
      // Duplicate-check is advisory; a failed check just means no warning shown.
    }
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyName.trim()) {
      setCreateError("Enter a company name.");
      return;
    }
    if (!phone.trim()) {
      setCreateError("Enter a phone number.");
      return;
    }
    if (!serviceRequirements.trim()) {
      setCreateError("Enter the service requirements.");
      return;
    }

    setCreateError(null);
    setCreating(true);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          contactPerson: contactPerson.trim() || undefined,
          phone: phone.trim(),
          email: email.trim() || undefined,
          website: website.trim() || undefined,
          serviceRequirements: serviceRequirements.trim(),
          leadSource,
          priority,
        }),
      });

      if (!response.ok) {
        setCreateError(await parseErrorMessage(response, "Could not create the lead."));
        setCreating(false);
        return;
      }

      const created = await response.json();
      setLeads((current) => [created, ...current]);
      setCreateModalOpen(false);
      setCreating(false);
    } catch {
      setCreateError("Could not create the lead.");
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-zinc-200 p-4 sm:flex-row sm:items-end sm:justify-between">
          <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="search" className="text-sm font-medium text-zinc-700">
                Search
              </label>
              <input
                id="search"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Company, phone, or email"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="statusFilter" className="text-sm font-medium text-zinc-700">
                Status
              </label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as LeadStatus | "")}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">All statuses</option>
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="sourceFilter" className="text-sm font-medium text-zinc-700">
                Source
              </label>
              <select
                id="sourceFilter"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as LeadSource | "")}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">All sources</option>
                {LEAD_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="priorityFilter" className="text-sm font-medium text-zinc-700">
                Priority
              </label>
              <select
                id="priorityFilter"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as LeadPriority | "")}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">All priorities</option>
                {LEAD_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {LEAD_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="dateFrom" className="text-sm font-medium text-zinc-700">
                From
              </label>
              <input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="dateTo" className="text-sm font-medium text-zinc-700">
                To
              </label>
              <input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Apply filters
            </button>
          </form>

          {canCreate && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
            >
              <i className="ri-add-line text-base" aria-hidden="true" />
              New Lead
            </button>
          )}
        </div>

        {listError && (
          <p role="alert" className="px-4 pt-4 text-sm text-red-600">
            {listError}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Company
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Priority
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Owner
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {leads.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                    No leads found.
                  </td>
                </tr>
              )}
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-indigo-700 hover:underline">
                      {lead.company_name}
                    </Link>
                    <p className="text-xs text-zinc-500">{lead.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_STATUS_BADGE_CLASSES[lead.status]}`}
                    >
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_PRIORITY_BADGE_CLASSES[lead.priority]}`}
                    >
                      {LEAD_PRIORITY_LABELS[lead.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {lead.salesperson_owner_id ? (
                      <span className="inline-flex items-center gap-1.5 text-zinc-700">
                        <i className="ri-user-line text-sm" aria-hidden="true" />
                        Assigned
                      </span>
                    ) : (
                      <span className="text-zinc-400">Unassigned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">New Lead</h2>
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="companyName" className="text-sm font-medium text-zinc-700">
                  Company
                </label>
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  onBlur={checkDuplicates}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {duplicates.length > 0 && (
                <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <p className="font-medium">This looks like it might already be a similar lead:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {duplicates.map((d) => (
                      <li key={d.id}>{d.companyName}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="contactPerson" className="text-sm font-medium text-zinc-700">
                  Contact person
                </label>
                <input
                  id="contactPerson"
                  type="text"
                  value={contactPerson}
                  onChange={(event) => setContactPerson(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone" className="text-sm font-medium text-zinc-700">
                  Phone
                </label>
                <input
                  id="phone"
                  type="text"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  onBlur={checkDuplicates}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm font-medium text-zinc-700">
                  Email
                </label>
                <input
                  id="email"
                  type="text"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="website" className="text-sm font-medium text-zinc-700">
                  Website
                </label>
                <input
                  id="website"
                  type="text"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="serviceRequirements" className="text-sm font-medium text-zinc-700">
                  Service requirements
                </label>
                <textarea
                  id="serviceRequirements"
                  value={serviceRequirements}
                  onChange={(event) => setServiceRequirements(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="leadSource" className="text-sm font-medium text-zinc-700">
                  Lead source
                </label>
                <select
                  id="leadSource"
                  value={leadSource}
                  onChange={(event) => setLeadSource(event.target.value as LeadSource)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {LEAD_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="priority" className="text-sm font-medium text-zinc-700">
                  Priority
                </label>
                <select
                  id="priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as LeadPriority)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {LEAD_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {LEAD_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <p role="alert" className="text-sm text-red-600">
                  {createError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
