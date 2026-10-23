import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../lib/db";
import { runMigrations } from "../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../lib/auth/seed";
import { createSession, getSessionUser } from "../../../../lib/auth/session";
import { POST } from "./route";

const email = `logout-route-test-${Date.now()}@example.com`;
let userId: number;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  userId = (await seedSuperAdmin(pool, { email, name: "Logout Test", password: "1234" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
});

describe("POST /api/auth/logout", () => {
  it("revokes the session named by the cookie", async () => {
    const { token } = await createSession(userId);
    const req = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${process.env.SESSION_COOKIE_NAME}=${token}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await getSessionUser(token)).toBeNull();
  });
});
