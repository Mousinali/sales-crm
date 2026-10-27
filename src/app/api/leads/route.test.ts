import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { POST, GET } from "./route";

const adminEmail = `leads-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let preSalesCookie: string;
let salespersonCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `leads-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `leads-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `leads-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `leads-route-sp-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email, ps.email, sp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id);

  // createUser forces a password change on first login; these route tests
  // sign in via a session directly, bypassing that flow, so clear the flag
  // the way src/lib/auth/changePassword.test.ts's fixtures do in reverse.
  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[ps.id, sp.id]]);

  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;
  salespersonCookie = `${SESSION_COOKIE_NAME}=${(await createSession(sp.id)).token}`;
});

afterAll(async () => {
  await pool.query("DELETE FROM leads WHERE created_by = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function postLeads(body: unknown, cookie?: string) {
  return POST(
    new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/leads", () => {
  it("lets an authenticated Pre-sales user create a lead", async () => {
    const res = await postLeads({ companyName: "Route Co", phone: "123", serviceRequirements: "Needs CRM", leadSource: "REFERRAL" }, preSalesCookie);
    expect(res.status).toBe(201);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await postLeads({ companyName: "X", phone: "1", serviceRequirements: "y", leadSource: "OTHER" });
    expect(res.status).toBe(401);
  });

  it("rejects a Salesperson", async () => {
    const res = await postLeads({ companyName: "X", phone: "1", serviceRequirements: "y", leadSource: "OTHER" }, salespersonCookie);
    expect(res.status).toBe(403);
  });

  it("accepts the extended contact-detail fields and defaults country to India", async () => {
    const res = await postLeads(
      { companyName: "Contact Route Co", phone: "321", serviceRequirements: "Needs CRM", leadSource: "REFERRAL", businessType: "Retail", address: "1 Main St", state: "Goa", pincode: "403001", whatsappNumber: "9123456780", remarks: "Prefers calls after 5pm" },
      preSalesCookie,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      business_type: "Retail",
      address: "1 Main St",
      state: "Goa",
      pincode: "403001",
      country: "India",
      whatsapp_number: "9123456780",
      remarks: "Prefers calls after 5pm",
    });
  });
});

function getLeads(cookie?: string) {
  return GET(new Request("http://localhost/api/leads", { headers: cookie ? { cookie } : {} }));
}

describe("GET /api/leads", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await getLeads()).status).toBe(401);
  });

  it("scopes the list to the caller's visible leads", async () => {
    await postLeads({ companyName: "Scope Co", phone: "9", serviceRequirements: "y", leadSource: "OTHER" }, preSalesCookie);
    const res = await getLeads(preSalesCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(
      body.leads.every(
        (l: { pre_sales_owner_id: number | null; created_by: number }) =>
          l.created_by === sessionUserIds[2] || l.pre_sales_owner_id === sessionUserIds[2],
      ),
    ).toBe(true);
  });
});
