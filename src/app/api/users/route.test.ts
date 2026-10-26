import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { POST, GET } from "./route";

const superAdminEmail = `route-create-admin-${Date.now()}@example.com`;
let superAdminId: number;
let superAdminToken: string;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
  superAdminToken = (await createSession(superAdminId)).token;
});

afterAll(async () => {
  // Route-created audit log rows reference superAdminId as actor_user_id
  // (FK, no cascade), so they must go before the users themselves.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

function postUsers(body: unknown, cookie?: string) {
  return POST(
    new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/users", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await postUsers({ role: "MARKETING_HEAD", name: "X", email: "x@example.com" });
    expect(res.status).toBe(401);
  });

  it("lets an authenticated SUPER_ADMIN create a MARKETING_HEAD", async () => {
    const email = `route-mh-${Date.now()}@example.com`;
    createdEmails.push(email);

    const res = await postUsers(
      { role: "MARKETING_HEAD", name: "Route MH", email },
      `${SESSION_COOKIE_NAME}=${superAdminToken}`,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe(email);
    expect(typeof body.tempPassword).toBe("string");
  });

  it("returns 403 (not 500) when the role can't be created by this actor", async () => {
    const res = await postUsers(
      { role: "PRE_SALES", name: "Should Fail", email: `route-fail-${Date.now()}@example.com` },
      `${SESSION_COOKIE_NAME}=${superAdminToken}`,
    );
    expect(res.status).toBe(403);
  });
});

function getUsers(query: string, cookie?: string) {
  return GET(
    new Request(`http://localhost/api/users${query}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
}

describe("GET /api/users", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await getUsers("")).status).toBe(401);
  });

  it("returns the role-scoped list for an authenticated SUPER_ADMIN", async () => {
    const res = await getUsers("", `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
  });
});
