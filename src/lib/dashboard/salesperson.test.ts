import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { createService } from "@/lib/services/create";
import { assignLead } from "@/lib/leads/assign";
import { scheduleVisit } from "@/lib/visits/schedule";
import { getSalespersonDashboard } from "./salesperson";

const adminEmail = `dash-sp-admin-${Date.now()}@example.com`;
let mhId: number;
let preSalesId: number;
let salespersonId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];
const serviceIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `dash-sp-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `dash-sp-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `dash-sp-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `dash-sp-sp-${Date.now()}@example.com` });
  mhId = mh.id;
  preSalesId = ps.id;
  salespersonId = sp.id;
  createdEmails.push(hr.email, mh.email, ps.email, sp.email);

  const svc = await createService(pool, { actorId: adminId, actorRole: "SUPER_ADMIN", name: `Dash SP Svc ${Date.now()}` });
  serviceIds.push(svc.id);

  const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Dash SP Co", phone: "1", leadSource: "OTHER", serviceIds: [svc.id] });
  leadIds.push(lead.id);
  await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = $1", [lead.id]);
  await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId });
  await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-12-10", startTime: "10:00", objective: "Demo" });
});

afterAll(async () => {
  await pool.query("DELETE FROM notifications WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM client_visits WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_assignments WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_services WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM services WHERE id = ANY($1)", [serviceIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("getSalespersonDashboard", () => {
  it("returns the user's assigned leads, upcoming visits, task buckets, activities, and pipeline", async () => {
    const dashboard = await getSalespersonDashboard(pool, salespersonId);
    expect(dashboard.assignedLeads.some((l) => l.id === leadIds[0])).toBe(true);
    expect(dashboard.upcomingVisits.some((v) => v.lead_id === leadIds[0])).toBe(true);
    expect(dashboard.leadsByStatus).toMatchObject({ QUALIFIED: expect.any(Number) });
    expect(dashboard.wonCount).toEqual(expect.any(Number));
    expect(dashboard.lostCount).toEqual(expect.any(Number));
    expect(Array.isArray(dashboard.recentActivities)).toBe(true);
  });
});
