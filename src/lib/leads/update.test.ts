import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { updateLead } from "./update";
import { listLeadServices } from "./services";
import { createService } from "@/lib/services/create";
import { LeadNotAccessibleError, LeadActionNotAllowedError } from "./errors";

const adminEmail = `update-admin-${Date.now()}@example.com`;
let preSalesId: number;
let otherPreSalesId: number;
let salespersonId: number;
let superAdminId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];
const serviceIds: number[] = [];

let myLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const adminId = superAdminId;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `update-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `update-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `update-ps-${Date.now()}@example.com` });
  const otherPs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Other PS", email: `update-ops-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `update-sp-${Date.now()}@example.com` });

  preSalesId = ps.id;
  otherPreSalesId = otherPs.id;
  salespersonId = sp.id;
  createdEmails.push(hr.email, mh.email, ps.email, otherPs.email, sp.email);

  myLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Update Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(myLead.id);
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

describe("updateLead", () => {
  it("lets the owning Pre-sales user update permitted fields", async () => {
    await updateLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: myLead.id, fields: { notes: "Called, interested" } });
    const { rows } = await pool.query("SELECT notes FROM leads WHERE id = $1", [myLead.id]);
    expect(rows[0].notes).toBe("Called, interested");
  });

  it("updates the extended contact-detail fields", async () => {
    await updateLead(pool, {
      actorId: preSalesId,
      actorRole: "PRE_SALES",
      leadId: myLead.id,
      fields: {
        businessType: "Wholesale",
        address: "221B Baker Street",
        state: "Delhi",
        pincode: "110001",
        country: "India",
        whatsappNumber: "9999999999",
        remarks: "Prefers WhatsApp contact",
      },
    });
    const { rows } = await pool.query(
      "SELECT business_type, address, state, pincode, country, whatsapp_number, remarks FROM leads WHERE id = $1",
      [myLead.id],
    );
    expect(rows[0]).toMatchObject({
      business_type: "Wholesale",
      address: "221B Baker Street",
      state: "Delhi",
      pincode: "110001",
      country: "India",
      whatsapp_number: "9999999999",
      remarks: "Prefers WhatsApp contact",
    });
  });

  it("replaces the lead's selected services", async () => {
    const svcA = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Update Test A ${Date.now()}` });
    const svcB = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Update Test B ${Date.now()}` });
    serviceIds.push(svcA.id, svcB.id);

    await updateLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: myLead.id, fields: { serviceIds: [svcA.id, svcB.id] } });
    expect((await listLeadServices(pool, myLead.id)).map((s) => s.id).sort()).toEqual([svcA.id, svcB.id].sort());

    await updateLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: myLead.id, fields: { serviceIds: [svcA.id] } });
    expect((await listLeadServices(pool, myLead.id)).map((s) => s.id)).toEqual([svcA.id]);
  });

  it("rejects a Pre-sales user updating a lead they don't own", async () => {
    await expect(
      updateLead(pool, { actorId: otherPreSalesId, actorRole: "PRE_SALES", leadId: myLead.id, fields: { notes: "x" } }),
    ).rejects.toThrow(LeadNotAccessibleError);
  });

  it("rejects a Salesperson editing any lead field", async () => {
    await expect(
      updateLead(pool, { actorId: salespersonId, actorRole: "SALESPERSON", leadId: myLead.id, fields: { notes: "x" } }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects HR editing any lead field", async () => {
    await expect(
      updateLead(pool, { actorId: superAdminId, actorRole: "HR", leadId: myLead.id, fields: { notes: "x" } }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("archives a lead by setting archived_at, and restores it by clearing it again", async () => {
    const toArchive = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Archive Me Co", phone: "9", serviceRequirements: "x", leadSource: "OTHER" });
    leadIds.push(toArchive.id);

    await updateLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: toArchive.id, fields: { archived: true } });
    const archived = await pool.query("SELECT archived_at FROM leads WHERE id = $1", [toArchive.id]);
    expect(archived.rows[0].archived_at).not.toBeNull();

    await updateLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: toArchive.id, fields: { archived: false } });
    const restored = await pool.query("SELECT archived_at FROM leads WHERE id = $1", [toArchive.id]);
    expect(restored.rows[0].archived_at).toBeNull();

    const { rows: auditRows } = await pool.query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE target_table = 'leads' AND target_id = $1 ORDER BY created_at",
      [toArchive.id],
    );
    expect(auditRows.map((r) => r.action)).toEqual(["lead.archived", "lead.restored"]);
  });
});
