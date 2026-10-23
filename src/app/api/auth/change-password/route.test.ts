import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../lib/db";
import { runMigrations } from "../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../lib/auth/seed";
import { createSession, getSessionUser, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { verifyPassword } from "../../../../lib/auth/passwords";
import { POST } from "./route";

const forcedEmail = `route-change-password-forced-${Date.now()}@example.com`;
const regularEmail = `route-change-password-regular-${Date.now()}@example.com`;
const sessionsEmail = `route-change-password-sessions-${Date.now()}@example.com`;

let forcedUserId: number;
let forcedToken: string;

let regularUserId: number;
let regularToken: string;

let sessionsUserId: number;

const allUserIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));

  forcedUserId = (await seedSuperAdmin(pool, { email: forcedEmail, name: "Forced Route Test", password: "1234" })).id;
  await pool.query("UPDATE users SET must_change_password = true WHERE id = $1", [forcedUserId]);
  forcedToken = (await createSession(forcedUserId)).token;

  regularUserId = (await seedSuperAdmin(pool, { email: regularEmail, name: "Regular Route Test", password: "1234" })).id;
  regularToken = (await createSession(regularUserId)).token;

  sessionsUserId = (await seedSuperAdmin(pool, { email: sessionsEmail, name: "Sessions Route Test", password: "1234" })).id;

  allUserIds.push(forcedUserId, regularUserId, sessionsUserId);
});

afterAll(async () => {
  // changePassword's audit log row references the user as actor_user_id
  // (FK, no cascade), so it must be deleted before the user itself or the
  // DELETE below violates that foreign key — same pattern as
  // src/lib/users/create.test.ts / resetAccess.test.ts.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [allUserIds]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [allUserIds]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [allUserIds]);
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
    const res = await changePasswordRequest({ password: "short" }, `${SESSION_COOKIE_NAME}=${forcedToken}`);
    expect(res.status).toBe(400);
  });

  it("accepts a valid new password with no currentPassword while mustChangePassword is true", async () => {
    const res = await changePasswordRequest(
      { password: "a-new-strong-password" },
      `${SESSION_COOKIE_NAME}=${forcedToken}`,
    );
    expect(res.status).toBe(200);
  });

  it("rejects a password change with no currentPassword once mustChangePassword is false", async () => {
    const res = await changePasswordRequest(
      { password: "another-strong-password" },
      `${SESSION_COOKIE_NAME}=${regularToken}`,
    );
    expect(res.status).toBe(403);

    const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [regularUserId]);
    expect(await verifyPassword(rows[0].password_hash, "1234")).toBe(true);
  });

  it("rejects a password change with a wrong currentPassword once mustChangePassword is false", async () => {
    const res = await changePasswordRequest(
      { currentPassword: "not-the-right-password", password: "another-strong-password" },
      `${SESSION_COOKIE_NAME}=${regularToken}`,
    );
    expect(res.status).toBe(403);

    const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [regularUserId]);
    expect(await verifyPassword(rows[0].password_hash, "1234")).toBe(true);
  });

  it("accepts a password change with the correct currentPassword once mustChangePassword is false", async () => {
    const res = await changePasswordRequest(
      { currentPassword: "1234", password: "another-strong-password" },
      `${SESSION_COOKIE_NAME}=${regularToken}`,
    );
    expect(res.status).toBe(200);

    const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [regularUserId]);
    expect(await verifyPassword(rows[0].password_hash, "another-strong-password")).toBe(true);
  });

  it("revokes the user's other sessions but keeps the one making the request", async () => {
    const keptSession = await createSession(sessionsUserId);
    const otherSession = await createSession(sessionsUserId);

    const res = await changePasswordRequest(
      { currentPassword: "1234", password: "yet-another-strong-password" },
      `${SESSION_COOKIE_NAME}=${keptSession.token}`,
    );
    expect(res.status).toBe(200);

    expect(await getSessionUser(otherSession.token)).toBeNull();
    expect((await getSessionUser(keptSession.token))?.id).toBe(sessionsUserId);
  });
});
