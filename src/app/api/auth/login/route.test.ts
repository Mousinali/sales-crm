import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../lib/db";
import { runMigrations } from "../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../lib/auth/seed";
import { POST } from "./route";

const email = `login-route-test-${Date.now()}@example.com`;
let userId: number;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  const seeded = await seedSuperAdmin(pool, { email, name: "Route Test", password: "1234" });
  userId = seeded.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
});

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("accepts a non-email identifier like the seeded admin login and sets a session cookie", async () => {
    const res = await POST(loginRequest({ email, password: "1234" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(process.env.SESSION_COOKIE_NAME!);
  });

  it("rejects an incorrect password without setting a cookie", async () => {
    const res = await POST(loginRequest({ email, password: "wrong" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a deactivated user even with the correct password", async () => {
    await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [userId]);
    const res = await POST(loginRequest({ email, password: "1234" }));
    expect(res.status).toBe(401);
    await pool.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [userId]);
  });
});
