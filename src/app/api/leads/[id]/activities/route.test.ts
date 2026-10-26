import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../../lib/db";
import { runMigrations } from "../../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../../lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "../../../../../lib/auth/session";
import { createUser } from "../../../../../lib/users/create";
import { createLead } from "../../../../../lib/leads/create";
import { GET, POST } from "./route";

const adminEmail = `activities-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let salespersonCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

let assignedLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `activities-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `activities-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `activities-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `activities-route-sp-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email, ps.email, sp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id);

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[sp.id]]);
  salespersonCookie = `${SESSION_COOKIE_NAME}=${(await createSession(sp.id)).token}`;

  assignedLead = await createLead(pool, { creatorId: ps.id, creatorRole: "PRE_SALES", companyName: "Activities Route Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  await pool.query("UPDATE leads SET salesperson_owner_id = $1 WHERE id = $2", [sp.id, assignedLead.id]);
  leadIds.push(assignedLead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function postActivity(id: number, body: unknown, cookie?: string) {
  return POST(
    new Request(`http://localhost/api/leads/${id}/activities`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

function getActivities(id: number, cookie?: string) {
  return GET(new Request(`http://localhost/api/leads/${id}/activities`, { headers: cookie ? { cookie } : {} }), {
    params: Promise.resolve({ id: String(id) }),
  });
}

describe("POST /api/leads/[id]/activities", () => {
  it("lets an assigned Salesperson record a call activity", async () => {
    const res = await postActivity(assignedLead.id, { type: "CALL", notes: "Discussed pricing" }, salespersonCookie);
    expect(res.status).toBe(201);
  });
});

describe("GET /api/leads/[id]/activities", () => {
  it("lists the activity just recorded", async () => {
    const res = await getActivities(assignedLead.id, salespersonCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activities.some((a: { type: string }) => a.type === "CALL")).toBe(true);
  });
});
