"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import RefreshButton from "@/components/ui/RefreshButton";
import FilterDropdown from "@/components/ui/FilterDropdown";
import FilterBottomSheet from "@/components/ui/FilterBottomSheet";
import { ROLES, type Role } from "@/lib/auth/roles";
import type { UserRow } from "@/lib/users/types";
import { ROLE_BADGE_CLASSES, ROLE_LABELS } from "@/app/(dashboard)/roleDisplay";
import Avatar from "@/components/ui/Avatar";
import Pagination from "@/components/ui/Pagination";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";

type StatusFilter = "ACTIVE" | "INACTIVE" | "";

type ConfirmAction = { type: "activate" | "deactivate" | "delete"; user: UserRow };

type TempPasswordReveal = { email: string; tempPassword: string };

const USER_ERROR_STATUS_MESSAGES = { 403: "You are not allowed to do that.", 404: "That user no longer exists." };

export default function TeamView({
  initialUsers,
  initialTotal,
  initialTotalPages,
  viewerRole,
  creatableRoles,
}: {
  initialUsers: UserRow[];
  initialTotal: number;
  initialTotalPages: number;
  viewerRole: Role;
  creatableRoles: Role[];
}) {
  // Mirrors the server's VISIBLE_ROLES in src/lib/users/list.ts, purely to
  // scope the filter dropdown's options to roles the viewer can actually
  // see. This is a UX nicety, not a security boundary — `listUsers` on the
  // server enforces visibility regardless of what this component sends.
  const visibleRoleOptions: Role[] = viewerRole === "SUPER_ADMIN" ? [...ROLES] : creatableRoles;

  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [listError, setListError] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const activeFilterCount = [roleFilter, statusFilter].filter(Boolean).length;

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createRole, setCreateRole] = useState<Role | "">(creatableRoles[0] ?? "");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createEmployeeId, setCreateEmployeeId] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createWhatsapp, setCreateWhatsapp] = useState("");
  const [createDesignation, setCreateDesignation] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editEmployeeId, setEditEmployeeId] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [tempPasswordReveal, setTempPasswordReveal] = useState<TempPasswordReveal | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");

  async function refetch(overrides?: { search?: string; roleFilter?: Role | ""; statusFilter?: StatusFilter; page?: number }) {
    const effectiveSearch = overrides?.search ?? search;
    const effectiveRole = overrides?.roleFilter ?? roleFilter;
    const effectiveStatus = overrides?.statusFilter ?? statusFilter;
    const targetPage = overrides?.page ?? page;

    const params = new URLSearchParams();
    if (effectiveRole) params.set("role", effectiveRole);
    if (effectiveStatus) params.set("status", effectiveStatus);
    if (effectiveSearch.trim()) params.set("q", effectiveSearch.trim());
    params.set("page", String(targetPage));

    setListError(null);
    try {
      const response = await fetch(`/api/users?${params.toString()}`);
      if (!response.ok) {
        setListError(await parseErrorMessage(response, "Could not load the team list.", USER_ERROR_STATUS_MESSAGES));
        return;
      }
      const body = await response.json();
      setUsers(body.users ?? []);
      setTotal(body.total ?? 0);
      setTotalPages(body.totalPages ?? 1);
      setPage(targetPage);
    } catch {
      setListError("Could not load the team list.");
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refetch({ page: 1 });
  }

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

  function openCreateModal() {
    setCreateRole(creatableRoles[0] ?? "");
    setCreateName("");
    setCreateEmail("");
    setCreateEmployeeId("");
    setCreatePhone("");
    setCreateWhatsapp("");
    setCreateDesignation("");
    setCreateError(null);
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!createRole) {
      setCreateError("Choose a role.");
      return;
    }
    if (!createName.trim()) {
      setCreateError("Enter a name.");
      return;
    }
    if (!createEmail.trim()) {
      setCreateError("Enter an email.");
      return;
    }

    setCreateError(null);
    setCreating(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: createRole,
          name: createName.trim(),
          email: createEmail.trim(),
          employeeId: createEmployeeId.trim() || undefined,
          phone: createPhone.trim() || undefined,
          whatsappNumber: createWhatsapp.trim() || undefined,
          designation: createDesignation.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not create the user.", USER_ERROR_STATUS_MESSAGES);
        setCreateError(message);
        toast.error("Could not create user", message);
        setCreating(false);
        return;
      }

      const created = await response.json();
      setCreateModalOpen(false);
      setCreating(false);
      setCopyLabel("Copy");
      setTempPasswordReveal({ email: created.email, tempPassword: created.tempPassword });
      void refetch({ page: 1 });
    } catch {
      setCreateError("Could not create the user.");
      setCreating(false);
    }
  }

  function openEditModal(user: UserRow) {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditEmployeeId(user.employee_id ?? "");
    setEditPhone(user.phone ?? "");
    setEditWhatsapp(user.whatsapp_number ?? "");
    setEditDesignation(user.designation ?? "");
    setEditError(null);
  }

  function closeEditModal() {
    setEditingUser(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;

    if (!editName.trim()) {
      setEditError("Enter a name.");
      return;
    }
    if (!editEmail.trim()) {
      setEditError("Enter an email.");
      return;
    }

    setEditError(null);
    setSaving(true);

    try {
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          employeeId: editEmployeeId.trim(),
          phone: editPhone.trim(),
          whatsappNumber: editWhatsapp.trim(),
          designation: editDesignation.trim(),
        }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not save changes.", USER_ERROR_STATUS_MESSAGES);
        setEditError(message);
        toast.error("Could not save changes", message);
        setSaving(false);
        return;
      }

      setUsers((current) =>
        current.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                name: editName.trim(),
                email: editEmail.trim(),
                employee_id: editEmployeeId.trim() || null,
                phone: editPhone.trim() || null,
                whatsapp_number: editWhatsapp.trim() || null,
                designation: editDesignation.trim() || null,
              }
            : u,
        ),
      );
      toast.success("User updated", editName.trim());
      setSaving(false);
      setEditingUser(null);
    } catch {
      setEditError("Could not save changes.");
      toast.error("Could not save changes");
      setSaving(false);
    }
  }

  function askConfirm(type: "activate" | "deactivate" | "delete", user: UserRow) {
    setConfirmError(null);
    setConfirmAction({ type, user });
  }

  function cancelConfirm() {
    setConfirmAction(null);
    setConfirmError(null);
  }

  async function handleConfirm() {
    if (!confirmAction) return;

    setConfirmSubmitting(true);
    setConfirmError(null);

    try {
      // Deleting moves the account to the Archive (a soft, one-way
      // archive — see lib/users/update.ts's archiveUser) rather than
      // changing its status, so it's its own request method.
      const response =
        confirmAction.type === "delete"
          ? await fetch(`/api/users/${confirmAction.user.id}`, { method: "DELETE" })
          : await fetch(`/api/users/${confirmAction.user.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ status: confirmAction.type === "deactivate" ? "INACTIVE" : "ACTIVE" }),
            });

      if (!response.ok) {
        const fallback = confirmAction.type === "delete" ? "Could not delete the user." : "Could not update the user's status.";
        const message = await parseErrorMessage(response, fallback, USER_ERROR_STATUS_MESSAGES);
        setConfirmError(message);
        toast.error(confirmAction.type === "delete" ? "Could not delete user" : "Could not update user", message);
        setConfirmSubmitting(false);
        return;
      }

      if (confirmAction.type === "delete") {
        setUsers((current) => current.filter((u) => u.id !== confirmAction.user.id));
        setTotal((current) => Math.max(0, current - 1));
        toast.success("User deleted", confirmAction.user.name);
      } else {
        const nextStatus = confirmAction.type === "deactivate" ? "INACTIVE" : "ACTIVE";
        setUsers((current) =>
          current.map((u) => (u.id === confirmAction.user.id ? { ...u, status: nextStatus } : u)),
        );
        toast.success(nextStatus === "ACTIVE" ? "User activated" : "User deactivated", confirmAction.user.name);
      }
      setConfirmSubmitting(false);
      setConfirmAction(null);
    } catch {
      setConfirmError(confirmAction.type === "delete" ? "Could not delete the user." : "Could not update the user's status.");
      toast.error(confirmAction.type === "delete" ? "Could not delete user" : "Could not update user");
      setConfirmSubmitting(false);
    }
  }

  function askResetAccess(user: UserRow) {
    setResetError(null);
    setResetUser(user);
  }

  function cancelResetAccess() {
    setResetUser(null);
    setResetError(null);
  }

  async function handleResetAccess() {
    if (!resetUser) return;

    setResetSubmitting(true);
    setResetError(null);

    try {
      const response = await fetch(`/api/users/${resetUser.id}/reset-access`, { method: "POST" });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not reset access.", USER_ERROR_STATUS_MESSAGES);
        setResetError(message);
        toast.error("Could not reset access", message);
        setResetSubmitting(false);
        return;
      }

      const body = await response.json();
      setResetSubmitting(false);
      setResetUser(null);
      setCopyLabel("Copy");
      setTempPasswordReveal({ email: resetUser.email, tempPassword: body.tempPassword });
    } catch {
      setResetError("Could not reset access.");
      toast.error("Could not reset access");
      setResetSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!tempPasswordReveal) return;
    try {
      await navigator.clipboard.writeText(tempPasswordReveal.tempPassword);
      setCopyLabel("Copied");
    } catch {
      setCopyLabel("Copy failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-zinc-200 p-4 sm:flex-row sm:items-end sm:justify-between">
          <form onSubmit={handleFilterSubmit} className="hidden flex-wrap items-center gap-3 sm:flex">
            <input
              id="search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or email"
              aria-label="Search"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />

            <FilterDropdown
              icon="ri-user-line"
              ariaLabel="Filter by role"
              value={roleFilter}
              options={[{ value: "", label: "All roles" }, ...visibleRoleOptions.map((role) => ({ value: role, label: ROLE_LABELS[role] }))]}
              onChange={setRoleFilter}
            />

            <FilterDropdown
              icon="ri-checkbox-circle-line"
              ariaLabel="Filter by status"
              value={statusFilter}
              options={[
                { value: "", label: "All statuses" },
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
              ]}
              onChange={setStatusFilter}
            />

            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              Apply filters
            </button>
          </form>

          <div className="flex items-center gap-2.5 sm:hidden">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or email"
              aria-label="Search"
              className="min-w-[200px] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
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

          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={() => refetch()} />
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-1 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
            >
              <i className="ri-user-add-line text-base" aria-hidden="true" />
              New User
            </button>
          </div>
        </div>

        <FilterBottomSheet
          open={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          onApply={() => {
            setFilterSheetOpen(false);
            void refetch({ page: 1 });
          }}
        >
          <FilterDropdown
            fullWidth
            icon="ri-user-line"
            ariaLabel="Filter by role"
            value={roleFilter}
            options={[{ value: "", label: "All roles" }, ...visibleRoleOptions.map((role) => ({ value: role, label: ROLE_LABELS[role] }))]}
            onChange={setRoleFilter}
          />
          <FilterDropdown
            fullWidth
            icon="ri-checkbox-circle-line"
            ariaLabel="Filter by status"
            value={statusFilter}
            options={[
              { value: "", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ]}
            onChange={setStatusFilter}
          />
        </FilterBottomSheet>

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
                  Name
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                    No team members found.
                  </td>
                </tr>
              )}
              {users.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-zinc-50/80">
                  <td data-label="Name" className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.name} imageUrl={user.avatar_url} size="md" />
                      <div>
                        <p className="font-medium text-zinc-900">{user.name}</p>
                        {user.designation && <p className="text-xs text-zinc-500">{user.designation}</p>}
                        <p className="text-xs text-zinc-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Role" className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td data-label="Status" className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${user.status === "ACTIVE" ? "bg-emerald-500" : "bg-zinc-400"}`}
                        aria-hidden="true"
                      />
                      {user.status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td data-label="Actions" data-stack="true" className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(user)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      Edit
                    </button>
                    {user.status === "ACTIVE" ? (
                      <button
                        type="button"
                        onClick={() => askConfirm("deactivate", user)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => askConfirm("activate", user)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-400"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => askResetAccess(user)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      Reset Access
                    </button>
                    {user.status === "INACTIVE" && (
                      <button
                        type="button"
                        onClick={() => askConfirm("delete", user)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} onChange={(nextPage) => refetch({ page: nextPage })} />
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">New User</h2>
            <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="createRole" className="text-sm font-medium text-zinc-700">
                  Role
                </label>
                <select
                  id="createRole"
                  value={createRole}
                  onChange={(event) => setCreateRole(event.target.value as Role)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  {creatableRoles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="createDesignation" className="text-sm font-medium text-zinc-700">
                  Designation
                </label>
                <input
                  id="createDesignation"
                  type="text"
                  value={createDesignation}
                  onChange={(event) => setCreateDesignation(event.target.value)}
                  placeholder="e.g. Business Development Lead"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="createName" className="text-sm font-medium text-zinc-700">
                  Name
                </label>
                <input
                  id="createName"
                  type="text"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="createEmail" className="text-sm font-medium text-zinc-700">
                  Email
                </label>
                <input
                  id="createEmail"
                  type="text"
                  value={createEmail}
                  onChange={(event) => setCreateEmail(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="createEmployeeId" className="text-sm font-medium text-zinc-700">
                  Employee ID
                </label>
                <input
                  id="createEmployeeId"
                  type="text"
                  value={createEmployeeId}
                  onChange={(event) => setCreateEmployeeId(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="createPhone" className="text-sm font-medium text-zinc-700">
                  Contact number
                </label>
                <input
                  id="createPhone"
                  type="text"
                  value={createPhone}
                  onChange={(event) => setCreatePhone(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="createWhatsapp" className="text-sm font-medium text-zinc-700">
                  WhatsApp number
                </label>
                <input
                  id="createWhatsapp"
                  type="text"
                  value={createWhatsapp}
                  onChange={(event) => setCreateWhatsapp(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              {createError && (
                <p role="alert" className="text-sm text-red-600 sm:col-span-2">
                  {createError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3 sm:col-span-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
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

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">Edit {editingUser.name}</h2>
            <form onSubmit={handleEditSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editName" className="text-sm font-medium text-zinc-700">
                  Name
                </label>
                <input
                  id="editName"
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="editDesignation" className="text-sm font-medium text-zinc-700">
                  Designation
                </label>
                <input
                  id="editDesignation"
                  type="text"
                  value={editDesignation}
                  onChange={(event) => setEditDesignation(event.target.value)}
                  placeholder="e.g. Business Development Lead"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="editEmail" className="text-sm font-medium text-zinc-700">
                  Email
                </label>
                <input
                  id="editEmail"
                  type="text"
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="editEmployeeId" className="text-sm font-medium text-zinc-700">
                  Employee ID
                </label>
                <input
                  id="editEmployeeId"
                  type="text"
                  value={editEmployeeId}
                  onChange={(event) => setEditEmployeeId(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="editPhone" className="text-sm font-medium text-zinc-700">
                  Contact number
                </label>
                <input
                  id="editPhone"
                  type="text"
                  value={editPhone}
                  onChange={(event) => setEditPhone(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="editWhatsapp" className="text-sm font-medium text-zinc-700">
                  WhatsApp number
                </label>
                <input
                  id="editWhatsapp"
                  type="text"
                  value={editWhatsapp}
                  onChange={(event) => setEditWhatsapp(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              {editError && (
                <p role="alert" className="text-sm text-red-600 sm:col-span-2">
                  {editError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3 sm:col-span-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.type === "deactivate" ? "Deactivate user" : confirmAction.type === "activate" ? "Activate user" : "Delete user"}
          description={
            confirmAction.type === "delete"
              ? `This moves ${confirmAction.user.name} to the Archive. It can't be undone from here.`
              : `Are you sure you want to ${confirmAction.type} ${confirmAction.user.name}?`
          }
          error={confirmError}
          confirmLabel={confirmAction.type === "delete" ? "Yes, delete" : `Yes, ${confirmAction.type}`}
          pendingLabel="Working…"
          pending={confirmSubmitting}
          tone={confirmAction.type === "activate" ? "success" : "danger"}
          onConfirm={handleConfirm}
          onCancel={cancelConfirm}
        />
      )}

      {resetUser && (
        <ConfirmDialog
          title="Reset access"
          description={`Are you sure you want to reset access for ${resetUser.name}? Their current password will stop working.`}
          error={resetError}
          confirmLabel="Yes, reset access"
          pending={resetSubmitting}
          tone="brand"
          onConfirm={handleResetAccess}
          onCancel={cancelResetAccess}
        />
      )}

      {tempPasswordReveal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-zinc-900">Temporary password</h2>
            <p className="mb-3 text-sm text-zinc-600">
              Share this temporary password with <span className="font-medium">{tempPasswordReveal.email}</span>.
            </p>
            <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
              <code className="font-mono text-sm text-zinc-900">{tempPasswordReveal.tempPassword}</code>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {copyLabel}
              </button>
            </div>
            <p className="mb-4 text-sm font-medium text-red-600">This password will not be shown again.</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setTempPasswordReveal(null)}
                className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
