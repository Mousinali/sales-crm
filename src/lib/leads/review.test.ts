import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { setLeadStatus } from "./review";
import { listLeadActivities } from "./activities";
import { LeadActionNotAllowedError, LeadNotAccessibleError, InvalidLeadReasonError } from "./errors";

const adminEmail = `review-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhId: number;
let preSalesId: number;
let salespersonId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];

let pendingLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  superAdminId = adminId;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `review-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `review-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `review-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `review-sp-${Date.now()}@example.com` });

  mhId = mh.id;
  preSalesId = ps.id;
  salespersonId = sp.id;
  createdEmails.push(hr.email, mh.email, ps.email, sp.email);

  pendingLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Review Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(pendingLead.id);
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

describe("setLeadStatus", () => {
  it("lets the Pre-sales owner qualify their own lead — no Marketing Head review step", async () => {
    const updated = await setLeadStatus(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: pendingLead.id, status: "QUALIFIED" });
    expect(updated.status).toBe("QUALIFIED");
  });

  it("requires a reason to mark a lead lost, and records it", async () => {
    await expect(
      setLeadStatus(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: pendingLead.id, status: "CLOSED_LOST" }),
    ).rejects.toThrow(InvalidLeadReasonError);
    const updated = await setLeadStatus(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: pendingLead.id, status: "CLOSED_LOST", reason: "Out of budget" });
    expect(updated).toMatchObject({ status: "CLOSED_LOST", status_reason: "Out of budget" });
  });

  it("records a STATUS_CHANGE activity", async () => {
    const activities = await listLeadActivities(pool, { id: preSalesId, role: "PRE_SALES" }, pendingLead.id);
    expect(activities.some((a) => a.type === "STATUS_CHANGE" && a.notes === "Out of budget")).toBe(true);
  });

  it("lets a Salesperson move a lead they own", async () => {
    await pool.query("UPDATE leads SET salesperson_owner_id = $1 WHERE id = $2", [salespersonId, pendingLead.id]);
    const updated = await setLeadStatus(pool, { actorId: salespersonId, actorRole: "SALESPERSON", leadId: pendingLead.id, status: "ON_HOLD" });
    expect(updated.status).toBe("ON_HOLD");
  });

  it("rejects a Marketing Head who doesn't own the lead", async () => {
    await expect(
      setLeadStatus(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, status: "QUALIFIED" }),
    ).rejects.toThrow(LeadNotAccessibleError);
  });

  it("lets a user the lead is shared with change its status", async () => {
    const other = await createUser(pool, { creatorId: mhId, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Other", email: `review-other-${Date.now()}@example.com` });
    createdEmails.push(other.email);
    await pool.query("INSERT INTO lead_shares (lead_id, user_id, shared_by) VALUES ($1, $2, $3)", [pendingLead.id, other.id, preSalesId]);
    const updated = await setLeadStatus(pool, { actorId: other.id, actorRole: "PRE_SALES", leadId: pendingLead.id, status: "QUALIFIED" });
    expect(updated.status).toBe("QUALIFIED");
    await pool.query("DELETE FROM lead_shares WHERE lead_id = $1", [pendingLead.id]);
  });

  it("rejects HR and Accountant", async () => {
    for (const role of ["HR", "ACCOUNTANT"] as const) {
      await expect(
        setLeadStatus(pool, { actorId: superAdminId, actorRole: role, leadId: pendingLead.id, status: "QUALIFIED" }),
      ).rejects.toThrow(LeadActionNotAllowedError);
    }
  });
});
