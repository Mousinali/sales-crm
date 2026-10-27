"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Role } from "@/lib/auth/roles";
import { TASK_STATUSES, type TaskStatus } from "@/lib/tasks/types";
import { LEAD_PRIORITIES, type LeadPriority } from "@/lib/leads/types";
import { LEAD_PRIORITY_LABELS, LEAD_PRIORITY_BADGE_CLASSES } from "@/app/(dashboard)/leadDisplay";

type Task = {
  id: number;
  title: string;
  description: string | null;
  due_at: string;
  priority: LeadPriority;
  status: TaskStatus;
  assigned_user_id: number;
};

const STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  PENDING: "bg-zinc-100 text-zinc-600",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-rose-50 text-rose-700",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    // fall through to fallback
  }
  return fallback;
}

export default function TasksView({ initialTasks, viewerId, viewerRole }: { initialTasks: Task[]; viewerId: number; viewerRole: Role }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [dueFilter, setDueFilter] = useState<"OVERDUE" | "TODAY" | "UPCOMING" | "">("");
  const [listError, setListError] = useState<string | null>(null);

  const canAssignOthers = viewerRole === "MARKETING_HEAD" || viewerRole === "SUPER_ADMIN";
  const [assignableUsers, setAssignableUsers] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!canAssignOthers) return;
    Promise.all([
      fetch("/api/users?role=PRE_SALES&status=ACTIVE").then((r) => (r.ok ? r.json() : { users: [] })),
      fetch("/api/users?role=SALESPERSON&status=ACTIVE").then((r) => (r.ok ? r.json() : { users: [] })),
    ])
      .then(([ps, sp]) => setAssignableUsers([...(ps.users ?? []), ...(sp.users ?? [])]))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAssignOthers]);

  async function refetch(status: TaskStatus | "", dueWithin: typeof dueFilter) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (dueWithin) params.set("dueWithin", dueWithin);
    setListError(null);
    try {
      const response = await fetch(`/api/tasks${params.toString() ? `?${params.toString()}` : ""}`);
      if (!response.ok) {
        setListError(await parseErrorMessage(response, "Could not load tasks."));
        return;
      }
      const body = await response.json();
      setTasks(body.tasks ?? []);
    } catch {
      setListError("Could not load tasks.");
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refetch(statusFilter, dueFilter);
  }

  async function setStatus(taskId: number, status: TaskStatus) {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) return;
    const updated: Task = await response.json();
    setTasks((current) => current.map((t) => (t.id === taskId ? updated : t)));
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<LeadPriority>("MEDIUM");
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function openCreate() {
    setTitle("");
    setDescription("");
    setDueAt("");
    setPriority("MEDIUM");
    setAssignedUserId("");
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !dueAt) {
      setCreateError("Enter a title and a due date.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignedUserId: assignedUserId ? Number(assignedUserId) : viewerId,
          title: title.trim(),
          description: description.trim() || undefined,
          dueAt: new Date(dueAt).toISOString(),
          priority,
        }),
      });
      if (!response.ok) {
        setCreateError(await parseErrorMessage(response, "Could not create the task."));
        setCreating(false);
        return;
      }
      const created: Task = await response.json();
      if (created.assigned_user_id === viewerId || canAssignOthers) {
        setTasks((current) => [...current, created]);
      }
      setCreating(false);
      setCreateOpen(false);
    } catch {
      setCreateError("Could not create the task.");
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-zinc-200 p-4 sm:flex-row sm:items-end sm:justify-between">
          <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="statusFilter" className="text-sm font-medium text-zinc-700">
                Status
              </label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "")}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">All statuses</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dueFilter" className="text-sm font-medium text-zinc-700">
                Due
              </label>
              <select
                id="dueFilter"
                value={dueFilter}
                onChange={(event) => setDueFilter(event.target.value as typeof dueFilter)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Any time</option>
                <option value="OVERDUE">Overdue</option>
                <option value="TODAY">Due today</option>
                <option value="UPCOMING">Upcoming</option>
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Apply filters
            </button>
          </form>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
          >
            <i className="ri-add-line text-base" aria-hidden="true" />
            New task
          </button>
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
                  Title
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Due
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Priority
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Status
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                    No tasks found.
                  </td>
                </tr>
              )}
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{task.title}</p>
                    {task.description && <p className="text-xs text-zinc-500">{task.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{new Date(task.due_at).toLocaleString("en-US")}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_PRIORITY_BADGE_CLASSES[task.priority]}`}
                    >
                      {LEAD_PRIORITY_LABELS[task.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[task.status]}`}
                    >
                      {STATUS_LABELS[task.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(task.status === "PENDING" || task.status === "IN_PROGRESS") && task.assigned_user_id === viewerId && (
                      <div className="flex justify-end gap-2">
                        {task.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() => setStatus(task.id, "IN_PROGRESS")}
                            className="rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
                          >
                            Start
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setStatus(task.id, "COMPLETED")}
                          className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(task.id, "CANCELLED")}
                          className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">New task</h2>
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="taskTitle" className="text-sm font-medium text-zinc-700">
                  Title
                </label>
                <input
                  id="taskTitle"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="taskDescription" className="text-sm font-medium text-zinc-700">
                  Description
                </label>
                <textarea
                  id="taskDescription"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="taskDueAt" className="text-sm font-medium text-zinc-700">
                  Due
                </label>
                <input
                  id="taskDueAt"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="taskPriority" className="text-sm font-medium text-zinc-700">
                  Priority
                </label>
                <select
                  id="taskPriority"
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
              {canAssignOthers && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="taskAssignedTo" className="text-sm font-medium text-zinc-700">
                    Assign to
                  </label>
                  <select
                    id="taskAssignedTo"
                    value={assignedUserId}
                    onChange={(event) => setAssignedUserId(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Myself</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {createError && (
                <p role="alert" className="text-sm text-red-600">
                  {createError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
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
