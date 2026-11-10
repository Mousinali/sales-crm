import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { GET } from "./route";

const superAdminEmail = `audit-logs-admin-${Date.now()}@example.com`;
let superAdminId: number;
let superAdminToken: string;
let hrToken: string;
let hrId: number;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Log Admin", password: "1234" })).id;
  superAdminToken = (await createSession(superAdminId)).token;

  // createUser itself writes a "user.created" audit_logs row — exactly the
  // fixture this endpoint needs, with a real actor name to search for.
  const hrEmail = `audit-logs-hr-${Date.now()}@example.com`;
  createdEmails.push(hrEmail);
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: hrEmail });
  hrId = hr.id;
  hrToken = (await createSession(hrId)).token;
});

afterAll(async () => {
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, hrId]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [[superAdminId, hrId]]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

function getAuditLogs(query: string, cookie?: string) {
  return GET(
    new Request(`http://localhost/api/audit-logs${query}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
}

describe("GET /api/audit-logs", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await getAuditLogs("");
    expect(response.status).toBe(401);
  });

  it("rejects anyone who isn't SUPER_ADMIN", async () => {
    const response = await getAuditLogs("", `${SESSION_COOKIE_NAME}=${hrToken}`);
    expect(response.status).toBe(403);
  });

  it("paginates at 20 per page by default and finds the seeded entry by actor name", async () => {
    const response = await getAuditLogs("?q=Log%20Admin", `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pageSize).toBe(20);
    expect(body.logs.length).toBeGreaterThan(0);
    expect(body.logs.every((log: { actor_name: string }) => log.actor_name === "Log Admin")).toBe(true);
  });
});
