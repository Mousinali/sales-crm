import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { assignLead } from "@/lib/leads/assign";
import { scheduleVisit, rescheduleVisit } from "@/lib/visits/schedule";
import { getSuperAdminDashboard } from "./superAdmin";

const adminEmail = `dash-sa-admin-${Date.now()}@example.com`;
const createdEmails: string[] = [];
const leadIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
});

afterAll(async () => {
  await pool.query("DELETE FROM notifications WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM client_visits WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_assignments WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("getSuperAdminDashboard", () => {
  it("returns active-user counts by role, lead counts by status, and email failure count", async () => {
    const dashboard = await getSuperAdminDashboard(pool);
    expect(dashboard.activeUsersByRole).toMatchObject({ SUPER_ADMIN: expect.any(Number) });
    expect(dashboard.leadsByStatus).toEqual(expect.any(Object));
    expect(dashboard.emailDeliveryFailures).toEqual(expect.any(Number));
    expect(dashboard.assignmentActivityCount30d).toEqual(expect.any(Number));
    expect(dashboard.transferActivityCount30d).toEqual(expect.any(Number));
    expect(dashboard.upcomingVisits).toEqual(expect.any(Number));
    expect(dashboard.completedVisits).toEqual(expect.any(Number));
    expect(Array.isArray(dashboard.recentAuditLogs)).toBe(true);
  });

  it("still counts a rescheduled visit as upcoming", async () => {
    const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
    const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `dash-sa-hr-${Date.now()}@example.com` });
    const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `dash-sa-mh-${Date.now()}@example.com` });
    const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `dash-sa-ps-${Date.now()}@example.com` });
    const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `dash-sa-sp-${Date.now()}@example.com` });
    const mhId = mh.id;
    const preSalesId = ps.id;
    const salespersonId = sp.id;
    createdEmails.push(hr.email, mh.email, ps.email, sp.email);

    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Dash SA Reschedule Co", phone: "1", leadSource: "OTHER" });
    leadIds.push(lead.id);
    await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = $1", [lead.id]);
    await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId });
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-12-15", startTime: "10:00", objective: "Demo" });

    const before = await getSuperAdminDashboard(pool);
    await rescheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", visitId: visit.id, visitDate: "2026-12-20", startTime: "11:00" });
    const after = await getSuperAdminDashboard(pool);

    expect(after.upcomingVisits).toBe(before.upcomingVisits);
  });
});
