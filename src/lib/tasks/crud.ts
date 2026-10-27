import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "@/lib/leads/guard";
import { TaskNotFoundError, TaskNotAccessibleError, TaskActionNotAllowedError } from "./errors";
import type { TaskRow, TaskStatus, TaskPriority } from "./types";

export async function createTask(
  pool: Pool,
  input: {
    creatorId: number;
    actorRole: Role;
    assignedUserId: number;
    title: string;
    description?: string;
    dueAt: Date;
    priority?: TaskPriority;
    leadId?: number;
  },
): Promise<TaskRow> {
  // §3.6: "Do not rely only on hiding UI controls" — TasksView only shows
  // the assignee picker to MH/SA and only offers active Pre-sales/Salespeople,
  // so the server enforces that exact rule rather than trusting the caller.
  if (input.assignedUserId !== input.creatorId) {
    if (input.actorRole !== "MARKETING_HEAD" && input.actorRole !== "SUPER_ADMIN") {
      throw new TaskActionNotAllowedError(`${input.actorRole} cannot assign a task to another user`);
    }
    const { rows } = await pool.query<{ id: number }>(
      "SELECT id FROM users WHERE id = $1 AND status = 'ACTIVE' AND role IN ('PRE_SALES', 'SALESPERSON')",
      [input.assignedUserId],
    );
    if (rows.length === 0) {
      throw new TaskActionNotAllowedError(`User ${input.assignedUserId} is not an active Pre-sales/Salesperson`);
    }
  }

  if (input.leadId !== undefined) {
    await assertLeadVisible(pool, { id: input.creatorId, role: input.actorRole }, input.leadId);
  }

  const { rows } = await pool.query<TaskRow>(
    `INSERT INTO tasks (lead_id, assigned_user_id, title, description, due_at, priority, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.leadId ?? null,
      input.assignedUserId,
      input.title,
      input.description ?? null,
      input.dueAt,
      input.priority ?? "MEDIUM",
      input.creatorId,
    ],
  );
  return rows[0];
}

export async function listTasks(
  pool: Pool,
  viewer: { id: number; role: Role },
  filters: { status?: TaskStatus; dueWithin?: "TODAY" | "OVERDUE" | "UPCOMING" },
): Promise<TaskRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Everyone else only sees their own assigned tasks; a Marketing Head or
  // Super Admin sees the team's, mirroring the lead-visibility split but
  // simpler — no "or creator" clause (req.md §10/§11 name no such rule).
  if (viewer.role !== "SUPER_ADMIN" && viewer.role !== "MARKETING_HEAD") {
    params.push(viewer.id);
    conditions.push(`assigned_user_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.dueWithin === "OVERDUE") conditions.push(`due_at < now()`);
  if (filters.dueWithin === "TODAY") conditions.push(`due_at::date = current_date`);
  if (filters.dueWithin === "UPCOMING") conditions.push(`due_at > now() AND due_at::date != current_date`);
  // A finished task has no more "overdue/today/upcoming" to report — without
  // this, every completed/cancelled task would sit on these lists forever.
  if (filters.dueWithin !== undefined) conditions.push(`status IN ('PENDING', 'IN_PROGRESS')`);

  const { rows } = await pool.query<TaskRow>(
    `SELECT * FROM tasks ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY due_at`,
    params,
  );
  return rows;
}

export async function updateTask(
  pool: Pool,
  input: {
    actorId: number;
    taskId: number;
    status?: TaskStatus;
    title?: string;
    description?: string;
    dueAt?: Date;
    priority?: TaskPriority;
  },
): Promise<TaskRow> {
  const { rows: existingRows } = await pool.query<TaskRow>("SELECT * FROM tasks WHERE id = $1", [input.taskId]);
  const existing = existingRows[0];
  if (!existing) {
    throw new TaskNotFoundError(`No task with id ${input.taskId}`);
  }
  if (existing.assigned_user_id !== input.actorId) {
    throw new TaskNotAccessibleError(`User ${input.actorId} cannot access task ${input.taskId}`);
  }

  const columns: string[] = [];
  const params: unknown[] = [];
  function set(column: string, value: unknown) {
    params.push(value);
    columns.push(`${column} = $${params.length}`);
  }

  if (input.status !== undefined) {
    set("status", input.status);
    set("completed_at", input.status === "COMPLETED" ? new Date() : existing.completed_at);
  }
  if (input.title !== undefined) set("title", input.title);
  if (input.description !== undefined) set("description", input.description);
  if (input.dueAt !== undefined) set("due_at", input.dueAt);
  if (input.priority !== undefined) set("priority", input.priority);

  if (columns.length === 0) return existing;

  params.push(input.taskId);
  const { rows } = await pool.query<TaskRow>(
    `UPDATE tasks SET ${columns.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0];
}
