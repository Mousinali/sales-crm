import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { createUser } from "../users/create";
import { createLead } from "./create";
import { reviewLead } from "./review";
import { listLeadActivities } from "./activities";
import { LeadActionNotAllowedError, InvalidLeadReasonError } from "./errors";

const adminEmail = `review-admin-${Date.now()}@example.com`;
let mhId: number;
let preSalesId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];

let pendingLead: { id: number };
let alreadyQualifiedLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `review-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `review-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `review-ps-${Date.now()}@example.com` });

  mhId = mh.id;
  preSalesId = ps.id;
  createdEmails.push(hr.email, mh.email, ps.email);

  pendingLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Review Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  alreadyQualifiedLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Qualified Co", phone: "2", serviceRequirements: "x", leadSource: "OTHER" });
  await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = $1", [alreadyQualifiedLead.id]);
  leadIds.push(pendingLead.id, alreadyQualifiedLead.id);
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

describe("reviewLead", () => {
  it("lets Marketing Head qualify a Pending Review lead", async () => {
    const updated = await reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "QUALIFY" });
    expect(updated.status).toBe("QUALIFIED");
  });

  it("requires a reason to reject, and records it", async () => {
    await pool.query("UPDATE leads SET status = 'PENDING_REVIEW' WHERE id = $1", [pendingLead.id]);
    await expect(
      reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "REJECT" }),
    ).rejects.toThrow(InvalidLeadReasonError);
    const updated = await reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "REJECT", reason: "Out of budget" });
    expect(updated).toMatchObject({ status: "REJECTED", status_reason: "Out of budget" });
  });

  it("requires a reason to return for more information", async () => {
    await pool.query("UPDATE leads SET status = 'PENDING_REVIEW' WHERE id = $1", [pendingLead.id]);
    await expect(
      reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "RETURN" }),
    ).rejects.toThrow(InvalidLeadReasonError);
  });

  it("rejects a Pre-sales user calling review at all", async () => {
    await expect(
      reviewLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: pendingLead.id, action: "QUALIFY" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects reviewing a lead that isn't Pending Review or More Info Required", async () => {
    await expect(
      reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: alreadyQualifiedLead.id, action: "QUALIFY" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("records a STATUS_CHANGE activity for every review action", async () => {
    await pool.query("UPDATE leads SET status = 'PENDING_REVIEW' WHERE id = $1", [pendingLead.id]);
    await reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "QUALIFY" });
    const rows = await listLeadActivities(pool, { id: mhId, role: "MARKETING_HEAD" }, pendingLead.id);
    expect(rows[0].type).toBe("STATUS_CHANGE");
  });
});
