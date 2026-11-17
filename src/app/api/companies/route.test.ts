import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { GET } from "./route";

const adminEmail = `companies-route-admin-${Date.now()}@example.com`;
let superAdminCookie: string;
let marketingHeadCookie: string;
let preSalesCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../migrations"));
  const superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mh = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "MH", email: `companies-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `companies-route-ps-${Date.now()}@example.com` });
  createdEmails.push(mh.email, ps.email);
  sessionUserIds.push(superAdminId, mh.id, ps.id);

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[mh.id, ps.id]]);

  superAdminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(superAdminId)).token}`;
  marketingHeadCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;
});

afterAll(async () => {
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function getCompanies(cookie?: string) {
  return GET(new Request("http://localhost/api/companies", { headers: cookie ? { cookie } : {} }));
}

describe("GET /api/companies", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await getCompanies()).status).toBe(401);
  });

  it("lets a Pre-sales user list companies (scoped to their own leads)", async () => {
    const res = await getCompanies(preSalesCookie);
    expect(res.status).toBe(200);
    expect((await res.json()).companies).toEqual([]);
  });

  it("lets a Marketing Head list companies, scoped to their own leads", async () => {
    const res = await getCompanies(marketingHeadCookie);
    expect(res.status).toBe(200);
    expect((await res.json()).companies).toEqual([]);
  });

  it("lets a Super Admin list companies", async () => {
    const res = await getCompanies(superAdminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).companies)).toBe(true);
  });
});
