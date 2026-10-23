import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../../lib/db";
import { runMigrations } from "../../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../../lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "../../../../../lib/auth/session";
import { createUser } from "../../../../../lib/users/create";
import { POST } from "./route";

const superAdminEmail = `route-reset-admin-${Date.now()}@example.com`;
let superAdminId: number;
let superAdminToken: string;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
  superAdminToken = (await createSession(superAdminId)).token;
});

afterAll(async () => {
  // createUser's and resetUserAccess's audit log rows reference superAdminId
  // as actor_user_id (FK, no cascade), so they must be deleted before the
  // users themselves or the DELETE below violates that foreign key — same
  // pattern as src/lib/users/create.test.ts.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

function resetAccess(id: number, cookie?: string) {
  return POST(
    new Request(`http://localhost/api/users/${id}/reset-access`, {
      method: "POST",
      headers: cookie ? { cookie } : {},
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("POST /api/users/[id]/reset-access", () => {
  it("rejects an unauthenticated request", async () => {
    const email = `route-reset-target-${Date.now()}@example.com`;
    createdEmails.push(email);
    const target = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "T", email });
    expect((await resetAccess(target.id)).status).toBe(401);
  });

  it("returns a fresh temp password for an authorized actor", async () => {
    const email = `route-reset-target2-${Date.now()}@example.com`;
    createdEmails.push(email);
    const target = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "T", email });

    const res = await resetAccess(target.id, `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.tempPassword).toBe("string");
  });
});
