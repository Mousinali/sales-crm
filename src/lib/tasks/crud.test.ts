import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createTask, updateTask, listTasks } from "./crud";
import { TaskNotAccessibleError } from "./errors";

const adminEmail = `tasks-admin-${Date.now()}@example.com`;
let mhId: number;
let salespersonId: number;
let otherSalespersonId: number;
const createdEmails: string[] = [];
const taskIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `tasks-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `tasks-mh-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `tasks-sp-${Date.now()}@example.com` });
  const otherSp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Other SP", email: `tasks-osp-${Date.now()}@example.com` });

  mhId = mh.id;
  salespersonId = sp.id;
  otherSalespersonId = otherSp.id;
  createdEmails.push(hr.email, mh.email, sp.email, otherSp.email);
});

afterAll(async () => {
  await pool.query("DELETE FROM tasks WHERE id = ANY($1)", [taskIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("createTask / listTasks", () => {
  it("creates a task assigned to a user, and lets only that user or a Marketing Head see it in listTasks", async () => {
    const task = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "Follow up", dueAt: new Date("2026-11-05T10:00:00Z") });
    taskIds.push(task.id);
    expect(await listTasks(pool, { id: salespersonId, role: "SALESPERSON" }, {})).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: task.id })]),
    );
    expect(await listTasks(pool, { id: otherSalespersonId, role: "SALESPERSON" }, {})).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: task.id })]),
    );
    expect(await listTasks(pool, { id: mhId, role: "MARKETING_HEAD" }, {})).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: task.id })]),
    );
  });

  it("buckets tasks into OVERDUE/TODAY/UPCOMING by due_at against the current time", async () => {
    const overdue = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "Past due", dueAt: new Date(Date.now() - 86_400_000) });
    const upcoming = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "Later", dueAt: new Date(Date.now() + 7 * 86_400_000) });
    taskIds.push(overdue.id, upcoming.id);

    const overdueList = await listTasks(pool, { id: salespersonId, role: "SALESPERSON" }, { dueWithin: "OVERDUE" });
    expect(overdueList.some((t) => t.id === overdue.id)).toBe(true);
    expect(overdueList.some((t) => t.id === upcoming.id)).toBe(false);

    const upcomingList = await listTasks(pool, { id: salespersonId, role: "SALESPERSON" }, { dueWithin: "UPCOMING" });
    expect(upcomingList.some((t) => t.id === upcoming.id)).toBe(true);
    expect(upcomingList.some((t) => t.id === overdue.id)).toBe(false);
  });

  it("buckets a task due later today as TODAY, not OVERDUE or UPCOMING", async () => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 0, 0);
    const dueToday = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "Due today", dueAt: endOfToday });
    taskIds.push(dueToday.id);

    const todayList = await listTasks(pool, { id: salespersonId, role: "SALESPERSON" }, { dueWithin: "TODAY" });
    expect(todayList.some((t) => t.id === dueToday.id)).toBe(true);
    const overdueList = await listTasks(pool, { id: salespersonId, role: "SALESPERSON" }, { dueWithin: "OVERDUE" });
    expect(overdueList.some((t) => t.id === dueToday.id)).toBe(false);
  });
});

describe("updateTask", () => {
  it("lets the assigned user update status, setting completed_at when COMPLETED", async () => {
    const task = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "X", dueAt: new Date() });
    taskIds.push(task.id);
    const updated = await updateTask(pool, { actorId: salespersonId, taskId: task.id, status: "COMPLETED" });
    expect(updated.completed_at).not.toBeNull();
  });

  it("rejects a user updating someone else's task", async () => {
    const task = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "X", dueAt: new Date() });
    taskIds.push(task.id);
    await expect(updateTask(pool, { actorId: otherSalespersonId, taskId: task.id, status: "COMPLETED" })).rejects.toThrow(
      TaskNotAccessibleError,
    );
  });
});
