import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { createUser } from "../users/create";
import { createLead } from "./create";
import { LeadActionNotAllowedError } from "./errors";

const adminEmail = `create-admin-${Date.now()}@example.com`;
let preSalesId: number;
let salespersonId: number;
const leadIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `create-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `create-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `create-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `create-sp-${Date.now()}@example.com` });
  preSalesId = ps.id;
  salespersonId = sp.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
});

describe("createLead", () => {
  it("rejects a Salesperson creating a lead", async () => {
    await expect(
      createLead(pool, { creatorId: salespersonId, creatorRole: "SALESPERSON", companyName: "X", phone: "1", serviceRequirements: "y", leadSource: "OTHER" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("defaults a Pre-sales-created lead's pre-sales owner to its creator, with PENDING_REVIEW status", async () => {
    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Y", phone: "2", serviceRequirements: "z", leadSource: "OTHER" });
    leadIds.push(lead.id);
    expect(lead.pre_sales_owner_id).toBe(preSalesId);
    expect(lead.status).toBe("PENDING_REVIEW");
  });
});
