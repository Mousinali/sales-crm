import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { GET, DELETE, PATCH } from "./route";

const adminEmail = `company-name-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let preSalesId: number;
let superAdminCookie: string;
let preSalesCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mh = await createUser(pool, {
    creatorId: superAdminId,
    creatorRole: "SUPER_ADMIN",
    role: "MARKETING_HEAD",
    name: "MH",
    email: `company-name-route-mh-${Date.now()}@example.com`,
  });
  const ps = await createUser(pool, {
    creatorId: mh.id,
    creatorRole: "MARKETING_HEAD",
    role: "PRE_SALES",
    name: "PS",
    email: `company-name-route-ps-${Date.now()}@example.com`,
  });
  createdEmails.push(mh.email, ps.email);
  sessionUserIds.push(superAdminId, mh.id, ps.id);
  preSalesId = ps.id;
  await pool.query("UPDATE users SET must_change_password = false WHERE id = $1", [ps.id]);

  superAdminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(superAdminId)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;
});

afterAll(async () => {
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_assignments WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

async function makeCompanyWithTwoLeads(companyName: string) {
  const a = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName, phone: `${Date.now()}1`, leadSource: "OTHER" });
  const b = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName, phone: `${Date.now()}2`, leadSource: "OTHER" });
  leadIds.push(a.id, b.id);
  return a.company_name_normalized;
}

function deleteCompany(name: string, cookie?: string) {
  return DELETE(
    new Request(`http://localhost/api/companies/${name}`, { method: "DELETE", headers: cookie ? { cookie } : {} }),
    { params: Promise.resolve({ name }) },
  );
}

function restoreCompanyRequest(name: string, cookie?: string) {
  return PATCH(
    new Request(`http://localhost/api/companies/${name}`, { method: "PATCH", headers: cookie ? { cookie } : {} }),
    { params: Promise.resolve({ name }) },
  );
}

describe("DELETE /api/companies/[name]", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await deleteCompany("nope")).status).toBe(401);
  });

  it("rejects a Pre-sales user", async () => {
    const name = await makeCompanyWithTwoLeads(`Delete Co PS ${Date.now()}`);
    expect((await deleteCompany(name, preSalesCookie)).status).toBe(403);
  });

  it("404s for a company with no leads at all", async () => {
    expect((await deleteCompany("no-such-company", superAdminCookie)).status).toBe(404);
  });

  it("archives every lead under the company in one call, and GET still shows them", async () => {
    const name = await makeCompanyWithTwoLeads(`Delete Co ${Date.now()}`);

    const response = await deleteCompany(name, superAdminCookie);
    expect(response.status).toBe(200);

    const { rows } = await pool.query<{ archived_at: Date | null }>(
      "SELECT archived_at FROM leads WHERE company_name_normalized = $1",
      [name],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.archived_at !== null)).toBe(true);

    // getCompany() doesn't filter archived leads out, so the company is
    // still reachable at its own detail URL after being archived.
    const getResponse = await GET(
      new Request(`http://localhost/api/companies/${name}`, { headers: { cookie: superAdminCookie } }),
      { params: Promise.resolve({ name }) },
    );
    expect(getResponse.status).toBe(200);
  });
});

describe("PATCH /api/companies/[name]", () => {
  it("restores every archived lead under the company, and logs it", async () => {
    const name = await makeCompanyWithTwoLeads(`Restore Co ${Date.now()}`);
    expect((await deleteCompany(name, superAdminCookie)).status).toBe(200);

    const response = await restoreCompanyRequest(name, superAdminCookie);
    expect(response.status).toBe(200);

    const { rows } = await pool.query<{ archived_at: Date | null }>(
      "SELECT archived_at FROM leads WHERE company_name_normalized = $1",
      [name],
    );
    expect(rows.every((r) => r.archived_at === null)).toBe(true);

    const { rows: auditRows } = await pool.query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE actor_user_id = $1 AND action = 'company.restored' ORDER BY created_at DESC LIMIT 1",
      [superAdminId],
    );
    expect(auditRows).toHaveLength(1);
  });

  it("rejects a Pre-sales user", async () => {
    const name = await makeCompanyWithTwoLeads(`Restore Co PS ${Date.now()}`);
    expect((await restoreCompanyRequest(name, preSalesCookie)).status).toBe(403);
  });
});
