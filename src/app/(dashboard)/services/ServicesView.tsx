"use client";

import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import RefreshButton from "@/components/ui/RefreshButton";
import Pagination from "@/components/ui/Pagination";
import RichTextField, { FormattedText } from "@/components/ui/RichTextField";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";
import type { ServiceRow, ServiceStatus } from "@/lib/services/types";
import { SERVICE_STATUSES } from "@/lib/services/types";

// Services is reference/catalog data (every service, not a page of them,
// since other forms need the full list for their "service interested"
// picker) — so unlike the other tables, pagination here is a client-side
// slice of the already-fetched array rather than a paginated query.
const PAGE_SIZE = 20;

const STATUS_BADGE_CLASSES: Record<ServiceStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  INACTIVE: "bg-zinc-100 text-zinc-600",
};

export default function ServicesView({ initialServices }: { initialServices: ServiceRow[] }) {
  const [services, setServices] = useState<ServiceRow[]>(initialServices);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const filteredServices = services.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredServices.length / PAGE_SIZE));
  const pageServices = filteredServices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function refetch() {
    const response = await fetch("/api/services");
    if (!response.ok) {
      toast.error("Could not refresh services");
      return;
    }
    const body = await response.json();
    setServices(body.services ?? []);
  }

  useAutoRefresh(() => {
    void refetch();
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function openCreate() {
    setCreateName("");
    setCreateDescription("");
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createName.trim()) {
      setCreateError("Enter a service name.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), description: createDescription.trim() || undefined }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not create the service.");
        setCreateError(message);
        toast.error("Could not create service", message);
        setCreating(false);
        return;
      }
      const created: ServiceRow = await response.json();
      setServices((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success("Service created", created.name);
      setCreating(false);
      setCreateOpen(false);
    } catch {
      setCreateError("Could not create the service.");
      toast.error("Could not create service");
      setCreating(false);
    }
  }

  const [editingService, setEditingService] = useState<ServiceRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<ServiceStatus>("ACTIVE");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  function openEdit(service: ServiceRow) {
    setEditingService(service);
    setEditName(service.name);
    setEditDescription(service.description ?? "");
    setEditStatus(service.status);
    setEditError(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingService) return;
    if (!editName.trim()) {
      setEditError("Enter a service name.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/services/${editingService.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() || undefined, status: editStatus }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not save changes.");
        setEditError(message);
        toast.error("Could not save changes", message);
        setEditSaving(false);
        return;
      }
      const updated: ServiceRow = await response.json();
      setServices((current) => current.map((s) => (s.id === updated.id ? updated : s)).sort((a, b) => a.name.localeCompare(b.name)));
      toast.success("Service updated", updated.name);
      setEditSaving(false);
      setEditingService(null);
    } catch {
      setEditError("Could not save changes.");
      toast.error("Could not save changes");
      setEditSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <p className="text-sm text-zinc-500">
            The services leads can select as &ldquo;Service interested&rdquo;. Deactivating one hides it from new
            selections without affecting leads that already have it.
          </p>
          <div className="relative w-full max-w-xs sm:w-auto">
            <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search services…"
              aria-label="Search services"
              className="w-full rounded-md border border-zinc-300 py-2 pr-3 pl-9 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RefreshButton onRefresh={refetch} />
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-1 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
            >
              <i className="ri-add-line text-base" aria-hidden="true" />
              New service
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-responsive min-w-full divide-y divide-zinc-200 text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                <th scope="col" className="px-4 py-3 text-left">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Description
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Status
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredServices.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                    {services.length === 0 ? "No services yet." : "No services match your search."}
                  </td>
                </tr>
              )}
              {pageServices.map((service) => (
                <tr key={service.id} className="transition-colors hover:bg-zinc-50/80">
                  <td data-label="Name" className="px-4 py-3 font-medium text-zinc-900">{service.name}</td>
                  <td data-label="Description" className="px-4 py-3 text-zinc-600">
                    {service.description ? <FormattedText text={service.description} /> : "—"}
                  </td>
                  <td data-label="Status" className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[service.status]}`}
                    >
                      {service.status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td data-label="" className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(service)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={filteredServices.length} onChange={setPage} />
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">New service</h2>
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="createServiceName" className="text-sm font-medium text-zinc-700">
                  Name
                </label>
                <input
                  id="createServiceName"
                  type="text"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="createServiceDescription" className="text-sm font-medium text-zinc-700">
                  Description
                </label>
                <RichTextField id="createServiceDescription" value={createDescription} onChange={setCreateDescription} />
              </div>
              {createError && (
                <p role="alert" className="text-sm text-red-600">
                  {createError}
                </p>
              )}
              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">Edit service</h2>
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editServiceName" className="text-sm font-medium text-zinc-700">
                  Name
                </label>
                <input
                  id="editServiceName"
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editServiceDescription" className="text-sm font-medium text-zinc-700">
                  Description
                </label>
                <RichTextField id="editServiceDescription" value={editDescription} onChange={setEditDescription} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editServiceStatus" className="text-sm font-medium text-zinc-700">
                  Status
                </label>
                <select
                  id="editServiceStatus"
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value as ServiceStatus)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  {SERVICE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status === "ACTIVE" ? "Active" : "Inactive"}
                    </option>
                  ))}
                </select>
              </div>
              {editError && (
                <p role="alert" className="text-sm text-red-600">
                  {editError}
                </p>
              )}
              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
