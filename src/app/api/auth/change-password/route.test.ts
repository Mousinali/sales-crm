import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../lib/db";
import { runMigrations } from "../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { POST } from "./route";

const email = `route-change-password-${Date.now()}@example.com`;
let userId: number;
let token: string;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  userId = (await seedSuperAdmin(pool, { email, name: "Route Test", password: "1234" })).id;
  token = (await createSession(userId)).token;
});

afterAll(async () => {
  // changePassword's audit log row references userId as actor_user_id (FK,
  // no cascade), so it must be deleted before the user itself or the DELETE
  // below violates that foreign key — same pattern as
  // src/lib/users/create.test.ts / resetAccess.test.ts.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [userId]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
});

function changePasswordRequest(body: unknown, cookie?: string) {
  return POST(
    new Request("http://localhost/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/auth/change-password", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await changePasswordRequest({ password: "a-new-strong-password" })).status).toBe(401);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await changePasswordRequest({ password: "short" }, `${SESSION_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(400);
  });

  it("accepts a valid new password for the authenticated user", async () => {
    const res = await changePasswordRequest({ password: "a-new-strong-password" }, `${SESSION_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
  });
});
