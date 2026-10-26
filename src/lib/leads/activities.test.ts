import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { recordLeadActivity, listLeadActivities } from "./activities";
import { LeadNotAccessibleError } from "./errors";

const adminEmail = `activities-admin-${Date.now()}@example.com`;
let preSalesId: number;
let otherPreSalesId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];

let myLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `activities-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `activities-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `activities-ps-${Date.now()}@example.com` });
  const otherPs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Other PS", email: `activities-ops-${Date.now()}@example.com` });

  preSalesId = ps.id;
  otherPreSalesId = otherPs.id;
  createdEmails.push(hr.email, mh.email, ps.email, otherPs.email);

  myLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Activities Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(myLead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("lead activities", () => {
  it("records and lists activities for a visible lead, newest first", async () => {
    await recordLeadActivity(pool, { leadId: myLead.id, actorId: preSalesId, type: "CALL", notes: "Left voicemail" });
    const rows = await listLeadActivities(pool, { id: preSalesId, role: "PRE_SALES" }, myLead.id);
    expect(rows[0]).toMatchObject({ type: "CALL", notes: "Left voicemail" });
  });

  it("rejects listing activities for a lead the viewer can't see", async () => {
    await expect(listLeadActivities(pool, { id: otherPreSalesId, role: "PRE_SALES" }, myLead.id)).rejects.toThrow(LeadNotAccessibleError);
  });
});
