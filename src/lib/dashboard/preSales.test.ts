import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { createService } from "@/lib/services/create";
import { getPreSalesDashboard } from "./preSales";

const adminEmail = `dash-presales-admin-${Date.now()}@example.com`;
let preSalesId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];
const serviceIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `dash-presales-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `dash-presales-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `dash-presales-ps-${Date.now()}@example.com` });
  preSalesId = ps.id;
  createdEmails.push(hr.email, mh.email, ps.email);

  const svc = await createService(pool, { actorId: adminId, actorRole: "SUPER_ADMIN", name: `Dash PreSales Svc ${Date.now()}` });
  serviceIds.push(svc.id);

  const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Dash Co", phone: "1", leadSource: "OTHER", serviceIds: [svc.id] });
  leadIds.push(lead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM lead_services WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM services WHERE id = ANY($1)", [serviceIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("getPreSalesDashboard", () => {
  it("returns the user's own created/awaiting-review/recently-updated leads and task buckets", async () => {
    const dashboard = await getPreSalesDashboard(pool, preSalesId);
    expect(dashboard.leadsCreated.some((l) => l.id === leadIds[0])).toBe(true);
    expect(dashboard.leadsAwaitingReview.some((l) => l.id === leadIds[0])).toBe(true);
    expect(dashboard.recentlyUpdatedLeads.some((l) => l.id === leadIds[0])).toBe(true);
    expect(Array.isArray(dashboard.followUpsDueToday)).toBe(true);
    expect(Array.isArray(dashboard.upcomingTasks)).toBe(true);
  });
});
