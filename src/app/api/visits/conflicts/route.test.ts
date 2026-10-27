import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { scheduleVisit } from "@/lib/visits/schedule";
import { GET } from "./route";

const adminEmail = `visit-conflict-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhCookie: string;
let preSalesCookie: string;
let mhId: number;
let salespersonId: number;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `visit-conflict-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `visit-conflict-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `visit-conflict-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `visit-conflict-route-sp-${Date.now()}@example.com` });

  createdEmails.push(hr.email, mh.email, ps.email, sp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id);
  mhId = mh.id;
  salespersonId = sp.id;

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[mh.id, ps.id]]);
  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;

  const lead = await createLead(pool, { creatorId: ps.id, creatorRole: "PRE_SALES", companyName: "Visit Conflict Route Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(lead.id);
  await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-12-01", startTime: "10:00", objective: "x" });
});

afterAll(async () => {
  await pool.query("DELETE FROM notifications WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM client_visits WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function getConflicts(query: string, cookie?: string) {
  return GET(new Request(`http://localhost/api/visits/conflicts?${query}`, { headers: cookie ? { cookie } : {} }));
}

describe("GET /api/visits/conflicts", () => {
  it("flags a same-salesperson, same-slot visit", async () => {
    const res = await getConflicts(`salespersonId=${salespersonId}&visitDate=2026-12-01&startTime=10:00`, mhCookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conflict: true });
  });

  it("does not flag a different slot", async () => {
    const res = await getConflicts(`salespersonId=${salespersonId}&visitDate=2026-12-01&startTime=11:00`, mhCookie);
    expect(await res.json()).toEqual({ conflict: false });
  });

  it("rejects a Pre-sales user with 403", async () => {
    const res = await getConflicts(`salespersonId=${salespersonId}&visitDate=2026-12-01&startTime=10:00`, preSalesCookie);
    expect(res.status).toBe(403);
  });
});
