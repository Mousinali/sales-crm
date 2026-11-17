import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { createSale } from "@/lib/sales/create";
import { recordSalePayment } from "@/lib/sales/payments";
import { recordLeadActivity } from "@/lib/leads/activities";
import { transferLead } from "@/lib/leads/transfer";
import { getCompany } from "./get";
import { CompanyNotFoundError } from "./errors";

const adminEmail = `companies-get-admin-${Date.now()}@example.com`;
let preSalesId: number;
let otherPreSalesId: number;
const leadIds: number[] = [];
const saleIds: number[] = [];
const companyName = `Get Co ${Date.now()}`;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mh = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "MH", email: `companies-get-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `companies-get-ps-${Date.now()}@example.com` });
  preSalesId = ps.id;
  otherPreSalesId = (await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS2", email: `companies-get-ps2-${Date.now()}@example.com` })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sale_payments WHERE sale_id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM lead_transfer_history WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM notifications WHERE lead_id = ANY($1)", [leadIds]);
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

  it("rolls up payments and a merged activity history, hiding lead activity from includeLeads: false", async () => {
    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: `${companyName} B`, phone: "2", serviceRequirements: "x", leadSource: "OTHER" });
    leadIds.push(lead.id);
    const sale = await createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", leadId: lead.id, budgetAmount: 1000, budgetType: "ONE_TIME" });
    saleIds.push(sale.id);
    await recordSalePayment(pool, { actorId: preSalesId, actorRole: "PRE_SALES", saleId: sale.id, amount: 400, paymentMethod: "UPI" });
    await recordLeadActivity(pool, { leadId: lead.id, actorId: preSalesId, type: "CALL", notes: "Called the client" });

    const company = await getCompany(pool, lead.company_name_normalized);
    expect(company.sales[0].paid_amount).toBe("400");
    expect(company.payments.map((p) => p.amount)).toEqual(["400"]);
    const kinds = company.activity.map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["SALE", "PAYMENT", "LEAD", "LEAD_ACTIVITY"]));

    expect(company.owners.map((o) => o.id)).toEqual([preSalesId]);
    expect(company.owners[0]).toMatchObject({ sales: 1 });

    const accountantView = await getCompany(pool, lead.company_name_normalized, undefined, { includeLeads: false });
    expect(accountantView.activity.map((a) => a.kind).sort()).toEqual(["PAYMENT", "SALE"]);
  });

  it("returns transfer history, and TRANSFER activity, only with includeTransfers", async () => {
    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: `${companyName} C`, phone: "3", serviceRequirements: "x", leadSource: "OTHER" });
    leadIds.push(lead.id);
    await transferLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: lead.id, newPreSalesOwnerId: otherPreSalesId, reason: "Moving accounts" });

    const plain = await getCompany(pool, lead.company_name_normalized);
    expect(plain.transfers).toEqual([]);
    expect(plain.activity.some((a) => a.activityType === "TRANSFER")).toBe(false);

    const admin = await getCompany(pool, lead.company_name_normalized, undefined, { includeTransfers: true });
    expect(admin.transfers).toHaveLength(1);
    expect(admin.transfers[0]).toMatchObject({ previous_pre_sales: "PS", new_pre_sales: "PS2", reason: "Moving accounts" });
    expect(admin.activity.some((a) => a.activityType === "TRANSFER")).toBe(true);
  });
});
