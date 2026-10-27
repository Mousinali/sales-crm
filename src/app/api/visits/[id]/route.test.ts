import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { scheduleVisit } from "@/lib/visits/schedule";
import { PATCH } from "./route";

const adminEmail = `visit-id-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhCookie: string;
let preSalesCookie: string;
let salespersonCookie: string;
let mhId: number;
let salespersonId: number;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

let lead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `visit-id-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `visit-id-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `visit-id-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `visit-id-route-sp-${Date.now()}@example.com` });

  createdEmails.push(hr.email, mh.email, ps.email, sp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id);
  mhId = mh.id;
  salespersonId = sp.id;

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[mh.id, ps.id, sp.id]]);
  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;
  salespersonCookie = `${SESSION_COOKIE_NAME}=${(await createSession(sp.id)).token}`;

  lead = await createLead(pool, { creatorId: ps.id, creatorRole: "PRE_SALES", companyName: "Visit Id Route Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
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

function patchVisit(id: number, body: unknown, cookie?: string) {
  return PATCH(
    new Request(`http://localhost/api/visits/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("PATCH /api/visits/[id]", () => {
  it("reschedules a visit", async () => {
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-12", startTime: "09:00", objective: "x" });
    const res = await patchVisit(visit.id, { action: "RESCHEDULE", visitDate: "2026-11-13", startTime: "10:00" }, mhCookie);
    expect(res.status).toBe(200);
  });

  it("returns 409 when rescheduling into a conflicting slot, 200 once confirmed", async () => {
    await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-18", startTime: "10:00", objective: "Occupied" });
    const toMove = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-19", startTime: "09:00", objective: "To move" });
    const conflicting = await patchVisit(toMove.id, { action: "RESCHEDULE", visitDate: "2026-11-18", startTime: "10:00" }, mhCookie);
    expect(conflicting.status).toBe(409);
    const confirmed = await patchVisit(toMove.id, { action: "RESCHEDULE", visitDate: "2026-11-18", startTime: "10:00", confirmConflict: true }, mhCookie);
    expect(confirmed.status).toBe(200);
  });

  it("returns 400 (not 500) for an empty visitDate or startTime when rescheduling", async () => {
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-28", startTime: "09:00", objective: "x" });
    const emptyDate = await patchVisit(visit.id, { action: "RESCHEDULE", visitDate: "", startTime: "10:00" }, mhCookie);
    expect(emptyDate.status).toBe(400);
    const emptyTime = await patchVisit(visit.id, { action: "RESCHEDULE", visitDate: "2026-11-29", startTime: "" }, mhCookie);
    expect(emptyTime.status).toBe(400);
  });

  it("returns 400 (not 500) for a malformed visitDate or startTime when rescheduling", async () => {
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-30", startTime: "09:00", objective: "x" });
    const badDate = await patchVisit(visit.id, { action: "RESCHEDULE", visitDate: "not-a-date", startTime: "10:00" }, mhCookie);
    expect(badDate.status).toBe(400);
    const badTime = await patchVisit(visit.id, { action: "RESCHEDULE", visitDate: "2026-12-02", startTime: "9am" }, mhCookie);
    expect(badTime.status).toBe(400);
  });

  it("cancels a visit", async () => {
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-14", startTime: "09:00", objective: "x" });
    const res = await patchVisit(visit.id, { action: "CANCEL" }, mhCookie);
    expect(res.status).toBe(200);
  });

  it("rejects a Pre-sales user with 403", async () => {
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-15", startTime: "09:00", objective: "x" });
    const res = await patchVisit(visit.id, { action: "CANCEL" }, preSalesCookie);
    expect(res.status).toBe(403);
  });

  it("lets the assigned Salesperson record an outcome", async () => {
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-16", startTime: "09:00", objective: "x" });
    const res = await patchVisit(visit.id, { action: "RECORD_OUTCOME", outcome: "COMPLETED", outcomeNotes: "Went well" }, salespersonCookie);
    expect(res.status).toBe(200);
  });

  it("rejects a Marketing Head recording an outcome directly with 403", async () => {
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-17", startTime: "09:00", objective: "x" });
    const res = await patchVisit(visit.id, { action: "RECORD_OUTCOME", outcome: "COMPLETED" }, mhCookie);
    expect(res.status).toBe(403);
  });
});
