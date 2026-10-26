import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { GET, PATCH } from "./route";

const adminEmail = `leads-id-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let preSalesId: number;
let mhCookie: string;
let preSalesCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

let myLead: { id: number };
let otherPreSalesLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `leads-id-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `leads-id-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `leads-id-route-ps-${Date.now()}@example.com` });
  const otherPs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Other PS", email: `leads-id-route-ops-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email, ps.email, otherPs.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, otherPs.id);
  preSalesId = ps.id;

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[mh.id, ps.id, otherPs.id]]);

  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;

  myLead = await createLead(pool, { creatorId: ps.id, creatorRole: "PRE_SALES", companyName: "Id Route Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  otherPreSalesLead = await createLead(pool, { creatorId: otherPs.id, creatorRole: "PRE_SALES", companyName: "Other Id Route Co", phone: "2", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(myLead.id, otherPreSalesLead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function getLead(id: number, cookie?: string) {
  return GET(new Request(`http://localhost/api/leads/${id}`, { headers: cookie ? { cookie } : {} }), {
    params: Promise.resolve({ id: String(id) }),
  });
}

function patchLead(id: number, body: unknown, cookie?: string) {
  return PATCH(
    new Request(`http://localhost/api/leads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("GET /api/leads/[id]", () => {
  it("404s a lead id that doesn't exist, and 404s one the viewer can't see", async () => {
    expect((await getLead(999999999, mhCookie)).status).toBe(404);
    expect((await getLead(otherPreSalesLead.id, preSalesCookie)).status).toBe(404);
  });

  it("returns the lead for its owning Pre-sales user", async () => {
    const res = await getLead(myLead.id, preSalesCookie);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/leads/[id]", () => {
  it("lets the owning Pre-sales user update notes", async () => {
    const res = await patchLead(myLead.id, { notes: "Updated via route" }, preSalesCookie);
    expect(res.status).toBe(200);
  });

  it("403s a Pre-sales user editing a lead they don't own", async () => {
    const res = await patchLead(otherPreSalesLead.id, { notes: "x" }, preSalesCookie);
    expect(res.status).toBe(403);
  });

  it("lets the owning Pre-sales user archive their lead", async () => {
    const res = await patchLead(myLead.id, { archived: true }, preSalesCookie);
    expect(res.status).toBe(200);
  });
});
