import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { assignLead } from "./assign";
import { LeadActionNotAllowedError } from "./errors";
import { listNotifications } from "@/lib/notifications/record";

const adminEmail = `assign-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhId: number;
let preSalesId: number;
let salespersonId: number;
let otherSalespersonId: number;
let inactiveSalespersonId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];

let inactivePreSalesId: number;

let qualifiedLead: { id: number };
let pendingLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  superAdminId = adminId;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `assign-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `assign-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `assign-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `assign-sp-${Date.now()}@example.com` });
  const otherSp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Other SP", email: `assign-osp-${Date.now()}@example.com` });
  const inactiveSp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Inactive SP", email: `assign-isp-${Date.now()}@example.com` });
  const inactivePs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Inactive PS", email: `assign-ips-${Date.now()}@example.com` });
  await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = ANY($1)", [[inactiveSp.id, inactivePs.id]]);

  mhId = mh.id;
  preSalesId = ps.id;
  salespersonId = sp.id;
  otherSalespersonId = otherSp.id;
  inactiveSalespersonId = inactiveSp.id;
  inactivePreSalesId = inactivePs.id;
  createdEmails.push(hr.email, mh.email, ps.email, sp.email, otherSp.email, inactiveSp.email, inactivePs.email);

  qualifiedLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Assign Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  await pool.query("UPDATE leads SET status = 'QUALIFIED' WHERE id = $1", [qualifiedLead.id]);
  pendingLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Pending Assign Co", phone: "9", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(qualifiedLead.id, pendingLead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM notifications WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_assignments WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("assignLead", () => {
  it("assigns a qualified lead to an active Salesperson and records history", async () => {
    const updated = await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId });
    expect(updated.salesperson_owner_id).toBe(salespersonId);
    const { rows } = await pool.query("SELECT * FROM lead_assignments WHERE lead_id = $1 ORDER BY changed_at", [qualifiedLead.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ salesperson_owner_id: salespersonId, changed_by: mhId });
  });

  it("accumulates a second history row on reassignment rather than overwriting the first", async () => {
    await pool.query("DELETE FROM lead_assignments WHERE lead_id = $1", [qualifiedLead.id]);
    await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId });
    await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId: otherSalespersonId });
    const { rows } = await pool.query("SELECT * FROM lead_assignments WHERE lead_id = $1 ORDER BY changed_at", [qualifiedLead.id]);
    expect(rows).toHaveLength(2);
  });

  it("rejects assigning to an inactive Salesperson", async () => {
    await expect(
      assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId: inactiveSalespersonId }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects assigning a user who isn't a Salesperson", async () => {
    await expect(
      assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId: preSalesId }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects a Pre-sales user calling assign", async () => {
    await expect(
      assignLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: qualifiedLead.id, salespersonId }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects HR calling assign", async () => {
    await expect(
      assignLead(pool, { actorId: superAdminId, actorRole: "HR", leadId: qualifiedLead.id, salespersonId }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects Super Admin calling assign", async () => {
    await expect(
      assignLead(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", leadId: qualifiedLead.id, salespersonId }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects assigning a lead that hasn't been qualified yet", async () => {
    await expect(
      assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, salespersonId }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("lets a Marketing Head change the Pre-sales owner on a lead that isn't qualified yet", async () => {
    const updated = await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, preSalesOwnerId: preSalesId });
    expect(updated.pre_sales_owner_id).toBe(preSalesId);
  });

  it("rejects assigning an inactive Pre-sales owner", async () => {
    await expect(
      assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, preSalesOwnerId: inactivePreSalesId }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects assigning a user who isn't a Pre-sales owner", async () => {
    await expect(
      assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, preSalesOwnerId: salespersonId }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects a Salesperson calling assign", async () => {
    await expect(
      assignLead(pool, { actorId: salespersonId, actorRole: "SALESPERSON", leadId: qualifiedLead.id, salespersonId: otherSalespersonId }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("notifies the newly assigned Salesperson", async () => {
    await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId });
    const notifications = await listNotifications(pool, salespersonId);
    expect(notifications.some((n) => n.type === "LEAD_ASSIGNED" && n.lead_id === qualifiedLead.id)).toBe(true);
  });
});
