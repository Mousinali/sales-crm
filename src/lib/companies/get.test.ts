import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { createSale } from "@/lib/sales/create";
import { getCompany } from "./get";
import { CompanyNotFoundError } from "./errors";

const adminEmail = `companies-get-admin-${Date.now()}@example.com`;
let preSalesId: number;
const leadIds: number[] = [];
const saleIds: number[] = [];
const companyName = `Get Co ${Date.now()}`;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mh = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "MH", email: `companies-get-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `companies-get-ps-${Date.now()}@example.com` });
  preSalesId = ps.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
});

describe("getCompany", () => {
  it("throws for an unknown company", async () => {
    await expect(getCompany(pool, "nosuchcompanyatall")).rejects.toThrow(CompanyNotFoundError);
  });

  it("returns the company's leads and the sales recorded against them", async () => {
    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName, phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
    leadIds.push(lead.id);
    const sale = await createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", leadId: lead.id, budgetAmount: 1000, budgetType: "ONE_TIME" });
    saleIds.push(sale.id);

    const company = await getCompany(pool, lead.company_name_normalized);
    expect(company.profile.company_name).toBe(companyName);
    expect(company.leads.map((l) => l.id)).toEqual([lead.id]);
    expect(company.sales.map((s) => s.id)).toEqual([sale.id]);
  });
});
