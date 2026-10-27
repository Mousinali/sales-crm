import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { POST } from "./route";

const adminEmail = `assign-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhCookie: string;
let preSalesCookie: string;
let salespersonId: number;
let inactiveSalespersonId: number;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

let qualifiedLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `assign-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `assign-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `assign-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `assign-route-sp-${Date.now()}@example.com` });
  const inactiveSp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Inactive SP", email: `assign-route-isp-${Date.now()}@example.com` });
  await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [inactiveSp.id]);

  createdEmails.push(hr.email, mh.email, ps.email, sp.email, inactiveSp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id, inactiveSp.id);
  salespersonId = sp.id;
  inactiveSalespersonId = inactiveSp.id;

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[mh.id, ps.id]]);
  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;

  qualifiedLead = await createLead(pool, { creatorId: ps.id, creatorRole: "PRE_SALES", companyName: "Assign Route Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = $1", [qualifiedLead.id]);
  leadIds.push(qualifiedLead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM notifications WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_assignments WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function postAssign(id: number, body: unknown, cookie?: string) {
  return POST(
    new Request(`http://localhost/api/leads/${id}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("POST /api/leads/[id]/assign", () => {
  it("rejects assigning an inactive salesperson with 403", async () => {
    const res = await postAssign(qualifiedLead.id, { salespersonId: inactiveSalespersonId }, mhCookie);
    expect(res.status).toBe(403);
  });

  it("assigns an active salesperson", async () => {
    const res = await postAssign(qualifiedLead.id, { salespersonId }, mhCookie);
    expect(res.status).toBe(200);
  });

  it("rejects a Pre-sales user calling assign", async () => {
    const res = await postAssign(qualifiedLead.id, { salespersonId }, preSalesCookie);
    expect(res.status).toBe(403);
  });
});
