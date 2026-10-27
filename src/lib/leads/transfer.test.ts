import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { assignLead } from "./assign";
import { transferLead, bulkTransferLeads } from "./transfer";
import { InvalidLeadReasonError, LeadActionNotAllowedError } from "./errors";
import { listNotifications } from "@/lib/notifications/record";
import { scheduleVisit, recordVisitOutcome } from "@/lib/visits/schedule";

const adminEmail = `transfer-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhId: number;
let preSalesId: number;
let originalSalespersonId: number;
let otherSalespersonId: number;
let inactiveSalespersonId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];

let assignedLead: { id: number };
let leadA: { id: number };
let leadB: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  superAdminId = adminId;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `transfer-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `transfer-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `transfer-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `transfer-sp-${Date.now()}@example.com` });
  const otherSp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Other SP", email: `transfer-osp-${Date.now()}@example.com` });
  const inactiveSp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Inactive SP", email: `transfer-isp-${Date.now()}@example.com` });
  await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [inactiveSp.id]);

  mhId = mh.id;
  preSalesId = ps.id;
  originalSalespersonId = sp.id;
  otherSalespersonId = otherSp.id;
  inactiveSalespersonId = inactiveSp.id;
  createdEmails.push(hr.email, mh.email, ps.email, sp.email, otherSp.email, inactiveSp.email);

  assignedLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Transfer Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = $1", [assignedLead.id]);
  await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: assignedLead.id, salespersonId: originalSalespersonId });

  leadA = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Bulk Co A", phone: "2", serviceRequirements: "x", leadSource: "OTHER" });
  leadB = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Bulk Co B", phone: "3", serviceRequirements: "x", leadSource: "OTHER" });
  await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = ANY($1)", [[leadA.id, leadB.id]]);
  leadIds.push(assignedLead.id, leadA.id, leadB.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM lead_transfer_history WHERE lead_id = ANY($1)", [leadIds]);
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

describe("transferLead", () => {
  it("transfers a lead's Salesperson owner, recording the previous and new owner plus the reason", async () => {
    const updated = await transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: assignedLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "Territory realignment" });
    expect(updated.salesperson_owner_id).toBe(otherSalespersonId);
    const { rows } = await pool.query("SELECT * FROM lead_transfer_history WHERE lead_id = $1", [assignedLead.id]);
    expect(rows[0]).toMatchObject({ previous_salesperson_owner_id: originalSalespersonId, new_salesperson_owner_id: otherSalespersonId, reason: "Territory realignment" });
    expect((await listNotifications(pool, originalSalespersonId)).some((n) => n.type === "LEAD_TRANSFERRED" && n.lead_id === assignedLead.id)).toBe(true);
    expect((await listNotifications(pool, otherSalespersonId)).some((n) => n.type === "LEAD_TRANSFERRED" && n.lead_id === assignedLead.id)).toBe(true);
  });

  it("rejects a transfer with no reason", async () => {
    await expect(
      transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: assignedLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "" }),
    ).rejects.toThrow(InvalidLeadReasonError);
  });

  it("rejects transferring to an inactive user", async () => {
    await expect(
      transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: assignedLead.id, newSalespersonOwnerId: inactiveSalespersonId, reason: "x" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects a Pre-sales user calling transfer", async () => {
    await expect(
      transferLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: assignedLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "x" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects HR calling transfer", async () => {
    await expect(
      transferLead(pool, { actorId: superAdminId, actorRole: "HR", leadId: assignedLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "x" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects transferring a Salesperson owner onto a lead that hasn't been qualified yet", async () => {
    const pendingLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Pending Transfer Co", phone: "9", serviceRequirements: "x", leadSource: "OTHER" });
    leadIds.push(pendingLead.id);
    await expect(
      transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "x" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("reassigns the lead's upcoming visits to the new Salesperson, leaving completed visits alone", async () => {
    const visitLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Visit Transfer Co", phone: "8", serviceRequirements: "x", leadSource: "OTHER" });
    await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = $1", [visitLead.id]);
    leadIds.push(visitLead.id);
    const upcoming = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: visitLead.id, salespersonId: originalSalespersonId, visitDate: "2026-12-05", startTime: "09:00", objective: "x" });
    const past = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: visitLead.id, salespersonId: originalSalespersonId, visitDate: "2026-12-06", startTime: "09:00", objective: "x" });
    await recordVisitOutcome(pool, { actorId: originalSalespersonId, actorRole: "SALESPERSON", visitId: past.id, outcome: "COMPLETED" });

    await transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: visitLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "Reassign" });

    const { rows } = await pool.query("SELECT id, salesperson_id FROM client_visits WHERE id = ANY($1) ORDER BY id", [[upcoming.id, past.id]]);
    expect(rows[0]).toMatchObject({ id: upcoming.id, salesperson_id: otherSalespersonId });
    expect(rows[1]).toMatchObject({ id: past.id, salesperson_id: originalSalespersonId });
  });

  it("bulk-transfers several leads in one call, writing one history row per lead", async () => {
    const updated = await bulkTransferLeads(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadIds: [leadA.id, leadB.id], newSalespersonOwnerId: otherSalespersonId, reason: "Bulk realignment" });
    expect(updated).toHaveLength(2);
    const { rows } = await pool.query("SELECT lead_id FROM lead_transfer_history WHERE lead_id = ANY($1)", [[leadA.id, leadB.id]]);
    expect(rows).toHaveLength(2);
  });

  it("rejects HR calling bulk-transfer", async () => {
    await expect(
      bulkTransferLeads(pool, { actorId: superAdminId, actorRole: "HR", leadIds: [leadA.id, leadB.id], newSalespersonOwnerId: otherSalespersonId, reason: "x" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("leaves exactly one consistent owner and one history row per race when two transfers race on the same lead", async () => {
    const raceLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Transfer Race Co", phone: "98", serviceRequirements: "x", leadSource: "OTHER" });
    await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = $1", [raceLead.id]);
    leadIds.push(raceLead.id);

    await Promise.allSettled([
      transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: raceLead.id, newSalespersonOwnerId: originalSalespersonId, reason: "A" }),
      transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: raceLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "B" }),
    ]);

    const { rows } = await pool.query("SELECT salesperson_owner_id FROM leads WHERE id = $1", [raceLead.id]);
    expect([originalSalespersonId, otherSalespersonId]).toContain(rows[0].salesperson_owner_id);
    const { rows: history } = await pool.query("SELECT count(*) FROM lead_transfer_history WHERE lead_id = $1", [raceLead.id]);
    expect(Number(history[0].count)).toBe(2);
  });
});
