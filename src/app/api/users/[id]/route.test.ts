import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { PATCH, DELETE } from "./route";

const superAdminEmail = `patch-admin-${Date.now()}@example.com`;
let superAdminId: number;
let superAdminToken: string;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
  superAdminToken = (await createSession(superAdminId)).token;
});

afterAll(async () => {
  // PATCH's audit log rows reference superAdminId as actor_user_id (FK, no
  // cascade), so they must be deleted before the users themselves - same
  // pattern as ../route.test.ts.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

async function makeMarketingHead() {
  const email = `patch-target-${Date.now()}-${Math.random()}@example.com`;
  createdEmails.push(email);
  return createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "Target", email });
}

function patchUser(id: number, body: unknown, cookie?: string) {
  return PATCH(
    new Request(`http://localhost/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

function deleteUser(id: number, cookie?: string) {
  return DELETE(
    new Request(`http://localhost/api/users/${id}`, { method: "DELETE", headers: cookie ? { cookie } : {} }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("PATCH /api/users/[id]", () => {
  it("rejects an unauthenticated request", async () => {
    const target = await makeMarketingHead();
    expect((await patchUser(target.id, { status: "INACTIVE" })).status).toBe(401);
  });

  it("lets SUPER_ADMIN deactivate a MARKETING_HEAD", async () => {
    const target = await makeMarketingHead();
    const res = await patchUser(target.id, { status: "INACTIVE" }, `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(res.status).toBe(200);

    const { rows } = await pool.query("SELECT status FROM users WHERE id = $1", [target.id]);
    expect(rows[0].status).toBe("INACTIVE");
  });

  it("returns 404 for a nonexistent id", async () => {
    const res = await patchUser(999999999, { status: "INACTIVE" }, `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/users/[id]", () => {
  it("rejects an unauthenticated request", async () => {
    const target = await makeMarketingHead();
    expect((await deleteUser(target.id)).status).toBe(401);
  });

  it("refuses to delete a still-active account (409)", async () => {
    const target = await makeMarketingHead();
    expect((await deleteUser(target.id, `${SESSION_COOKIE_NAME}=${superAdminToken}`)).status).toBe(409);
  });

  it("deletes (archives) a deactivated account", async () => {
    const target = await makeMarketingHead();
    await patchUser(target.id, { status: "INACTIVE" }, `${SESSION_COOKIE_NAME}=${superAdminToken}`);

    const res = await deleteUser(target.id, `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(res.status).toBe(200);

    const { rows } = await pool.query<{ archived_at: Date | null }>("SELECT archived_at FROM users WHERE id = $1", [target.id]);
    expect(rows[0].archived_at).not.toBeNull();
  });
});
