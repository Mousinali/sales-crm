"use client";

import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import RefreshButton from "@/components/ui/RefreshButton";
import Pagination from "@/components/ui/Pagination";
import RichTextField, { FormattedText } from "@/components/ui/RichTextField";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import type { ServiceRow, ServiceStatus } from "@/lib/services/types";
import { SERVICE_STATUSES } from "@/lib/services/types";
import CustomSelect from "@/components/ui/CustomSelect";

// Services is reference/catalog data (every service, not a page of them,
// since other forms need the full list for their "service interested"
// picker) — so unlike the other tables, pagination here is a client-side
// slice of the already-fetched array rather than a paginated query.
const PAGE_SIZE = 20;

export default function ServicesView({ initialServices }: { initialServices: ServiceRow[] }) {
  const [services, setServices] = useState<ServiceRow[]>(initialServices);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // The box stays instantly responsive while the filtering (and the re-render
  // of the whole table under it) waits for a pause in typing.
  const debouncedSearch = useDebouncedValue(search, 250);
  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(debouncedSearch.trim().toLowerCase()),
  );
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

  async function toggleStatus(service: ServiceRow) {
    const status: ServiceStatus = service.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const response = await fetch(`/api/services/${service.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        toast.error("Could not update status", await parseErrorMessage(response, "Could not update status."));
        return;
      }
      const updated: ServiceRow = await response.json();
      setServices((current) => current.map((s) => (s.id === updated.id ? updated : s)));
      toast.success(updated.status === "ACTIVE" ? "Service activated" : "Service deactivated", updated.name);
    } catch {
      toast.error("Could not update status");
    }
  }

  function StatusSwitch({ service }: { service: ServiceRow }) {
    const on = service.status === "ACTIVE";
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={on ? "Deactivate service" : "Activate service"}
        onClick={() => toggleStatus(service)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${on ? "bg-emerald-500" : "bg-zinc-300"}`}
      >
        <span aria-hidden="true" className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 p-4">
          {/* Count and search read as one group on the left; `ml-auto` on the
              actions pushes them right. justify-between across three children
              left the search stranded in the middle of the row. */}
          <span className="shrink-0 text-sm text-zinc-500">
            {filteredServices.length} service{filteredServices.length === 1 ? "" : "s"}
          </span>
          <div className="relative w-full sm:w-64">
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
          <div className="flex w-full shrink-0 items-center gap-2 sm:ml-auto sm:w-auto">
            <RefreshButton onRefresh={refetch} />
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-1 text-sm sm:flex-none font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
            >
              <i className="ri-add-line text-base" aria-hidden="true" />
              New service
            </button>
          </div>
        </div>

        <div className="hidden overflow-x-auto sm:block">
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
                  <td colSpan={4} className="px-4 py-10 text-center text-zinc-500">
                    {services.length === 0 ? (
                      <>
                        <i className="ri-price-tag-3-line mb-2 block text-2xl text-zinc-300" aria-hidden="true" />
                        <p className="font-medium text-zinc-700">No services yet</p>
                        <p className="mx-auto mt-1 max-w-md text-sm">
                          Services are what leads pick under &ldquo;Service interested&rdquo;. Deactivating one hides it
                          from new selections without affecting leads that already have it.
                        </p>
                      </>
                    ) : (
                      "No services match your search."
                    )}
                  </td>
                </tr>
              )}
              {pageServices.map((service) => (
                <tr key={service.id} className="transition-colors hover:bg-zinc-50/80">
                  <td data-label="Name" className="px-4 py-1.5 font-medium text-zinc-900">{service.name}</td>
                  <td data-label="Description" className="px-4 py-1.5 text-zinc-600">
                    {service.description ? <FormattedText text={service.description} /> : "—"}
                  </td>
                  <td data-label="Status" className="px-4 py-1.5">
                    {StatusSwitch({ service })}
                  </td>
                  <td data-label="" className="px-4 py-1.5 text-right">
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
        {/* Phone: compact cards instead of the label/value stacked table rows. */}
        <div className="flex flex-col gap-3 bg-zinc-50 p-3 sm:hidden">
          {filteredServices.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-zinc-500">
              {services.length === 0 ? "No services yet." : "No services match your search."}
            </p>
          )}
          {pageServices.map((service) => (
            <div key={service.id} className="rounded-lg bg-white px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-900">{service.name}</p>
                {StatusSwitch({ service })}
              </div>
              {service.description && (
                <div className="mt-1 line-clamp-3 text-xs text-zinc-600">
                  <FormattedText text={service.description} />
                </div>
              )}
              <div className="mt-3 flex justify-end border-t border-zinc-100 pt-3">
                <button
                  type="button"
                  onClick={() => openEdit(service)}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <i className="ri-pencil-line" aria-hidden="true" />
                  Edit
                </button>
              </div>
            </div>
          ))}
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
                <CustomSelect
                  id="editServiceStatus"
                  value={editStatus}
                  onChange={(value) => setEditStatus(value as ServiceStatus)}
                  options={SERVICE_STATUSES.map((status) => ({
                    value: status,
                    label: status === "ACTIVE" ? "Active" : "Inactive",
                  }))}
                />
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
