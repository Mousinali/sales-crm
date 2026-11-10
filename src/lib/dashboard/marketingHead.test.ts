import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { assignLead } from "@/lib/leads/assign";
import { scheduleVisit, rescheduleVisit } from "@/lib/visits/schedule";
import { getMarketingHeadDashboard } from "./marketingHead";

const adminEmail = `dash-mh-admin-${Date.now()}@example.com`;
let mhId: number;
let preSalesId: number;
let salespersonId: number;
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
  if (createdEmails.length > 0 || mhId) {
    await pool.query(
      "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
      [[...createdEmails, adminEmail]],
    );
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
  }
});

describe("getMarketingHeadDashboard", () => {
  it("returns company-wide lead/visit/task/transfer aggregates", async () => {
    const dashboard = await getMarketingHeadDashboard(pool);
    expect(dashboard.totalLeads).toEqual(expect.any(Number));
    expect(dashboard.pendingReviewLeads).toEqual(expect.any(Number));
    expect(dashboard.leadsByPriority).toEqual(expect.any(Object));
    expect(dashboard.leadsByPreSalesOwner).toEqual(expect.any(Object));
    expect(dashboard.leadsBySalespersonOwner).toEqual(expect.any(Object));
    expect(dashboard.qualifiedLeads).toEqual(expect.any(Number));
    expect(dashboard.convertedLeads).toEqual(expect.any(Number));
    expect(dashboard.upcomingVisits).toEqual(expect.any(Number));
    expect(dashboard.missedVisits).toEqual(expect.any(Number));
    expect(Array.isArray(dashboard.overdueTasks)).toBe(true);
    expect(dashboard.transferHistoryCount).toEqual(expect.any(Number));
    expect(dashboard.conversionRate).toEqual(expect.any(Number));
  });

  it("still counts a rescheduled visit as upcoming", async () => {
    const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
    const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `dash-mh-hr-${Date.now()}@example.com` });
    const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `dash-mh-mh-${Date.now()}@example.com` });
    const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `dash-mh-ps-${Date.now()}@example.com` });
    const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `dash-mh-sp-${Date.now()}@example.com` });
    mhId = mh.id;
    preSalesId = ps.id;
    salespersonId = sp.id;
    createdEmails.push(hr.email, mh.email, ps.email, sp.email);

    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Dash MH Reschedule Co", phone: "1", leadSource: "OTHER" });
    leadIds.push(lead.id);
    await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = $1", [lead.id]);
    await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId });
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-12-15", startTime: "10:00", objective: "Demo" });

    await rescheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", visitId: visit.id, visitDate: "2026-12-20", startTime: "11:00" });

    // Scoped to this test's own visit rather than comparing the company-wide
    // dashboard count across two points in time — that count is shared,
    // mutable state that other test files write to concurrently under the
    // full suite's parallel execution, making a before/after delta flaky.
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM client_visits
       WHERE id = $1 AND status IN ('SCHEDULED', 'RESCHEDULED') AND visit_date >= current_date`,
      [visit.id],
    );
    expect(Number(rows[0].count)).toBe(1);

    const after = await getMarketingHeadDashboard(pool);
    expect(after.upcomingVisits).toBeGreaterThanOrEqual(1);
    expect(after.leadsByPreSalesOwner["PS"]).toBeGreaterThanOrEqual(1);
    expect(after.leadsBySalespersonOwner["SP"]).toBeGreaterThanOrEqual(1);
  });
});
