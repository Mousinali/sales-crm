import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { assertLeadVisible } from "./guard";
import { LeadNotFoundError, LeadNotAccessibleError } from "./errors";

const adminEmail = `guard-admin-${Date.now()}@example.com`;
let mhId: number;
let preSalesId: number;
let otherPreSalesId: number;
let salespersonId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];

let myLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `guard-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `guard-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `guard-ps-${Date.now()}@example.com` });
  const otherPs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Other PS", email: `guard-ops-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `guard-sp-${Date.now()}@example.com` });

  mhId = mh.id;
  preSalesId = ps.id;
  otherPreSalesId = otherPs.id;
  salespersonId = sp.id;
  createdEmails.push(hr.email, mh.email, ps.email, otherPs.email, sp.email);

  myLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Guard Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(myLead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("assertLeadVisible", () => {
  it("returns the lead for its owner/creator, Marketing Head, or Super Admin", async () => {
    await expect(assertLeadVisible(pool, { id: preSalesId, role: "PRE_SALES" }, myLead.id)).resolves.toMatchObject({ id: myLead.id });
    await expect(assertLeadVisible(pool, { id: mhId, role: "MARKETING_HEAD" }, myLead.id)).resolves.toMatchObject({ id: myLead.id });
  });

  it("rejects a Pre-sales user who neither created nor owns the lead", async () => {
    await expect(assertLeadVisible(pool, { id: otherPreSalesId, role: "PRE_SALES" }, myLead.id)).rejects.toThrow(LeadNotAccessibleError);
  });

  it("rejects a Salesperson the lead isn't assigned to", async () => {
    await expect(assertLeadVisible(pool, { id: salespersonId, role: "SALESPERSON" }, myLead.id)).rejects.toThrow(LeadNotAccessibleError);
  });

  it("throws LeadNotFoundError for a non-existent id", async () => {
    await expect(assertLeadVisible(pool, { id: mhId, role: "MARKETING_HEAD" }, 999999999)).rejects.toThrow(LeadNotFoundError);
  });
});
