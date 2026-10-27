import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { GET, POST } from "./route";

const adminEmail = `visit-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhCookie: string;
let preSalesCookie: string;
let salespersonId: number;
let mustChangePasswordCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

let lead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `visit-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `visit-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `visit-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `visit-route-sp-${Date.now()}@example.com` });

  createdEmails.push(hr.email, mh.email, ps.email, sp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id);
  salespersonId = sp.id;

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[mh.id, ps.id]]);
  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;
  mustChangePasswordCookie = `${SESSION_COOKIE_NAME}=${(await createSession(sp.id)).token}`;

  lead = await createLead(pool, { creatorId: ps.id, creatorRole: "PRE_SALES", companyName: "Visit Route Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(lead.id);
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

function postVisit(id: number, body: unknown, cookie?: string) {
  return POST(
    new Request(`http://localhost/api/leads/${id}/visits`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

function getVisits(id: number, cookie?: string) {
  return GET(
    new Request(`http://localhost/api/leads/${id}/visits`, {
      headers: cookie ? { cookie } : {},
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("POST /api/leads/[id]/visits", () => {
  it("rejects a Pre-sales user scheduling a visit with 403", async () => {
    const res = await postVisit(lead.id, { salespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "x" }, preSalesCookie);
    expect(res.status).toBe(403);
  });

  it("schedules a visit for an active Salesperson", async () => {
    const res = await postVisit(lead.id, { salespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "Demo" }, mhCookie);
    expect(res.status).toBe(200);
  });

  it("returns 409 on a conflicting slot, and 200 once confirmed", async () => {
    const conflicting = await postVisit(lead.id, { salespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "Second" }, mhCookie);
    expect(conflicting.status).toBe(409);
    const confirmed = await postVisit(lead.id, { salespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "Second", confirmConflict: true }, mhCookie);
    expect(confirmed.status).toBe(200);
  });

  it("returns 400 (not 500) for an empty visitDate, startTime, or objective", async () => {
    const emptyDate = await postVisit(lead.id, { salespersonId, visitDate: "", startTime: "14:00", objective: "x" }, mhCookie);
    expect(emptyDate.status).toBe(400);
    const emptyTime = await postVisit(lead.id, { salespersonId, visitDate: "2026-11-02", startTime: "", objective: "x" }, mhCookie);
    expect(emptyTime.status).toBe(400);
    const emptyObjective = await postVisit(lead.id, { salespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "" }, mhCookie);
    expect(emptyObjective.status).toBe(400);
  });

  it("returns 400 (not 500) for a malformed visitDate or startTime", async () => {
    const badDate = await postVisit(lead.id, { salespersonId, visitDate: "not-a-date", startTime: "14:00", objective: "x" }, mhCookie);
    expect(badDate.status).toBe(400);
    const badTime = await postVisit(lead.id, { salespersonId, visitDate: "2026-11-02", startTime: "9am", objective: "x" }, mhCookie);
    expect(badTime.status).toBe(400);
  });
});

describe("GET /api/leads/[id]/visits", () => {
  it("lists the lead's visits for a viewer who can see the lead", async () => {
    const res = await getVisits(lead.id, mhCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visits.length).toBeGreaterThan(0);
  });

  it("rejects a user who must change their password with 403", async () => {
    const res = await getVisits(lead.id, mustChangePasswordCookie);
    expect(res.status).toBe(403);
  });
});
