import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createTask } from "@/lib/tasks/crud";
import { PATCH } from "./route";

const adminEmail = `tasks-id-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhId: number;
let salespersonCookie: string;
let otherSalespersonCookie: string;
let salespersonId: number;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const taskIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `tasks-id-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `tasks-id-route-mh-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `tasks-id-route-sp-${Date.now()}@example.com` });
  const otherSp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Other SP", email: `tasks-id-route-osp-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email, sp.email, otherSp.email);
  sessionUserIds.push(hr.id, mh.id, sp.id, otherSp.id);
  mhId = mh.id;
  salespersonId = sp.id;

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[sp.id, otherSp.id]]);
  salespersonCookie = `${SESSION_COOKIE_NAME}=${(await createSession(sp.id)).token}`;
  otherSalespersonCookie = `${SESSION_COOKIE_NAME}=${(await createSession(otherSp.id)).token}`;
});

afterAll(async () => {
  await pool.query("DELETE FROM tasks WHERE id = ANY($1)", [taskIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function patchTask(id: number, body: unknown, cookie?: string) {
  return PATCH(
    new Request(`http://localhost/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("PATCH /api/tasks/[id]", () => {
  it("lets the assigned user complete their task", async () => {
    const task = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "X", dueAt: new Date() });
    taskIds.push(task.id);
    const res = await patchTask(task.id, { status: "COMPLETED" }, salespersonCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completed_at).not.toBeNull();
  });

  it("403s a user updating someone else's task", async () => {
    const task = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "X", dueAt: new Date() });
    taskIds.push(task.id);
    const res = await patchTask(task.id, { status: "COMPLETED" }, otherSalespersonCookie);
    expect(res.status).toBe(403);
  });

  it("404s a nonexistent task id", async () => {
    const res = await patchTask(999999999, { status: "COMPLETED" }, salespersonCookie);
    expect(res.status).toBe(404);
  });
});
