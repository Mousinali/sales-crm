"use client";

import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import RefreshButton from "@/app/(dashboard)/RefreshButton";
import { ROLES, type Role } from "@/lib/auth/roles";
import type { UserRow } from "@/lib/users/types";
import { ROLE_BADGE_CLASSES, ROLE_LABELS, initialsOf } from "@/app/(dashboard)/roleDisplay";
import Pagination from "@/app/(dashboard)/Pagination";

type StatusFilter = "ACTIVE" | "INACTIVE" | "";

type ConfirmAction = { type: "activate" | "deactivate"; user: UserRow };

type TempPasswordReveal = { email: string; tempPassword: string };

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") {
      if (response.status === 403) return "You are not allowed to do that.";
      if (response.status === 404) return "That user no longer exists.";
      if (response.status === 409) return body.error;
      return body.error;
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}

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

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createRole, setCreateRole] = useState<Role | "">(creatableRoles[0] ?? "");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
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
        setListError(await parseErrorMessage(response, "Could not load the team list."));
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

  function openCreateModal() {
    setCreateRole(creatableRoles[0] ?? "");
    setCreateName("");
    setCreateEmail("");
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
        body: JSON.stringify({ role: createRole, name: createName.trim(), email: createEmail.trim() }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not create the user.");
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
        body: JSON.stringify({ name: editName.trim(), email: editEmail.trim() }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not save changes.");
        setEditError(message);
        toast.error("Could not save changes", message);
        setSaving(false);
        return;
      }

      setUsers((current) =>
        current.map((u) =>
          u.id === editingUser.id ? { ...u, name: editName.trim(), email: editEmail.trim() } : u,
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

  function askConfirm(type: "activate" | "deactivate", user: UserRow) {
    setConfirmError(null);
    setConfirmAction({ type, user });
  }

  function cancelConfirm() {
    setConfirmAction(null);
    setConfirmError(null);
  }

  async function handleConfirm() {
    if (!confirmAction) return;
    const nextStatus = confirmAction.type === "deactivate" ? "INACTIVE" : "ACTIVE";

    setConfirmSubmitting(true);
    setConfirmError(null);

    try {
      const response = await fetch(`/api/users/${confirmAction.user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not update the user's status.");
        setConfirmError(message);
        toast.error("Could not update user", message);
        setConfirmSubmitting(false);
        return;
      }

      setUsers((current) =>
        current.map((u) => (u.id === confirmAction.user.id ? { ...u, status: nextStatus } : u)),
      );
      toast.success(nextStatus === "ACTIVE" ? "User activated" : "User deactivated", confirmAction.user.name);
      setConfirmSubmitting(false);
      setConfirmAction(null);
    } catch {
      setConfirmError("Could not update the user's status.");
      toast.error("Could not update user");
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
        const message = await parseErrorMessage(response, "Could not reset access.");
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
                placeholder="Name or email"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="roleFilter" className="text-sm font-medium text-zinc-700">
                Role
              </label>
              <select
                id="roleFilter"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as Role | "")}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">All roles</option>
                {visibleRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="statusFilter" className="text-sm font-medium text-zinc-700">
                Status
              </label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Apply filters
            </button>
          </form>

          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={() => refetch()} />
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
            >
              <i className="ri-user-add-line text-base" aria-hidden="true" />
              New User
            </button>
          </div>
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
                  Name
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
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
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                        {initialsOf(user.name)}
                      </span>
                      <div>
                        <p className="font-medium text-zinc-900">{user.name}</p>
                        <p className="text-xs text-zinc-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(user)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                      className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      Reset Access
                    </button>
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
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">New User</h2>
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="createRole" className="text-sm font-medium text-zinc-700">
                  Role
                </label>
                <select
                  id="createRole"
                  value={createRole}
                  onChange={(event) => setCreateRole(event.target.value as Role)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {creatableRoles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
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
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
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

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">Edit {editingUser.name}</h2>
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editName" className="text-sm font-medium text-zinc-700">
                  Name
                </label>
                <input
                  id="editName"
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
                  onClick={closeEditModal}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-zinc-900">
              {confirmAction.type === "deactivate" ? "Deactivate user" : "Activate user"}
            </h2>
            <p className="mb-4 text-sm text-zinc-600">
              Are you sure you want to {confirmAction.type} {confirmAction.user.name}?
            </p>
            {confirmError && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {confirmError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelConfirm}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirmSubmitting}
                className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                  confirmAction.type === "deactivate"
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-400"
                    : "bg-green-600 hover:bg-green-700 focus:ring-green-400"
                }`}
              >
                Yes, {confirmAction.type}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-zinc-900">Reset access</h2>
            <p className="mb-4 text-sm text-zinc-600">
              Are you sure you want to reset access for {resetUser.name}? Their current password will stop working.
            </p>
            {resetError && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {resetError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelResetAccess}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetAccess}
                disabled={resetSubmitting}
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Yes, reset access
              </button>
            </div>
          </div>
        </div>
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
                className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {copyLabel}
              </button>
            </div>
            <p className="mb-4 text-sm font-medium text-red-600">This password will not be shown again.</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setTempPasswordReveal(null)}
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
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
