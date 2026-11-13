import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { reviewLead } from "@/lib/leads/review";
import { createService } from "@/lib/services/create";
import { createSale } from "./create";
import { listSaleServices } from "./services";
import { listSalePayments } from "./payments";
import { SaleActionNotAllowedError } from "./errors";

const adminEmail = `sale-create-admin-${Date.now()}@example.com`;
let superAdminId: number;
let marketingHeadId: number;
let preSalesId: number;
let salespersonId: number;
let otherPreSalesId: number;
let serviceId: number;
const leadIds: number[] = [];
const saleIds: number[] = [];
const serviceIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mh = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "MH", email: `sale-create-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `sale-create-ps-${Date.now()}@example.com` });
  const ps2 = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS2", email: `sale-create-ps2-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `sale-create-sp-${Date.now()}@example.com` });
  marketingHeadId = mh.id;
  preSalesId = ps.id;
  otherPreSalesId = ps2.id;
  salespersonId = sp.id;

  const svc = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Sale Create Test Service ${Date.now()}` });
  serviceId = svc.id;
  serviceIds.push(svc.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM sale_services WHERE service_id = ANY($1)", [serviceIds]);
  await pool.query("DELETE FROM services WHERE id = ANY($1)", [serviceIds]);
  await pool.query("DELETE FROM sale_payments WHERE sale_id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
});

describe("createSale", () => {
  it("rejects HR and Super Admin recording a sale", async () => {
    await expect(
      createSale(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", companyName: "X", budgetAmount: 100, budgetType: "ONE_TIME" }),
    ).rejects.toThrow(SaleActionNotAllowedError);
  });

  it("requires a company name or a lead when no lead is chosen", async () => {
    await expect(
      createSale(pool, { creatorId: marketingHeadId, creatorRole: "MARKETING_HEAD", budgetAmount: 100, budgetType: "ONE_TIME", soldByType: "SELF" }),
    ).rejects.toThrow(SaleActionNotAllowedError);
  });

  it("lets a Pre-sales user record a sale, defaulting sold-by to themself and the date to today", async () => {
    const sale = await createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "PS Manual Co", budgetAmount: 5000, budgetType: "MONTHLY" });
    saleIds.push(sale.id);
    expect(sale.sold_by_type).toBe("PRE_SALES");
    expect(sale.sold_by_user_id).toBe(preSalesId);
    expect(sale.sale_date).toBe(new Date().toISOString().slice(0, 10));
  });

  it("assigns each sale a unique, sequential TS-prefixed sale number", async () => {
    const a = await createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Seq Co A", budgetAmount: 1, budgetType: "ONE_TIME" });
    const b = await createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Seq Co B", budgetAmount: 1, budgetType: "ONE_TIME" });
    saleIds.push(a.id, b.id);
    expect(a.sale_number).toMatch(/^TS\d{6,}$/);
    expect(b.sale_number).not.toBe(a.sale_number);
  });

  it("lets a Salesperson credit the sale to a custom name instead of themself", async () => {
    const sale = await createSale(pool, {
      creatorId: salespersonId,
      creatorRole: "SALESPERSON",
      companyName: "SP Manual Co",
      budgetAmount: 1000,
      budgetType: "PART_PAYMENT",
      soldByType: "CUSTOM",
      soldByCustomName: "Someone Else",
    });
    saleIds.push(sale.id);
    expect(sale.sold_by_type).toBe("CUSTOM");
    expect(sale.sold_by_user_id).toBeNull();
    expect(sale.sold_by_custom_name).toBe("Someone Else");
  });

  it("lets a Marketing Head credit a sale to themself, a custom name, or a specific Pre-sales/Salesperson user", async () => {
    const self = await createSale(pool, { creatorId: marketingHeadId, creatorRole: "MARKETING_HEAD", companyName: "MH Self Co", budgetAmount: 1, budgetType: "ONE_TIME", soldByType: "SELF" });
    saleIds.push(self.id);
    expect(self.sold_by_user_id).toBe(marketingHeadId);

    const custom = await createSale(pool, { creatorId: marketingHeadId, creatorRole: "MARKETING_HEAD", companyName: "MH Custom Co", budgetAmount: 1, budgetType: "ONE_TIME", soldByType: "CUSTOM", soldByCustomName: "Field Agent" });
    saleIds.push(custom.id);
    expect(custom.sold_by_custom_name).toBe("Field Agent");
    expect(custom.sold_by_user_id).toBeNull();

    const viaPreSales = await createSale(pool, { creatorId: marketingHeadId, creatorRole: "MARKETING_HEAD", companyName: "MH PS Co", budgetAmount: 1, budgetType: "ONE_TIME", soldByType: "PRE_SALES", soldByUserId: otherPreSalesId });
    saleIds.push(viaPreSales.id);
    expect(viaPreSales.sold_by_user_id).toBe(otherPreSalesId);
  });

  it("rejects a Marketing Head crediting a user who isn't an active Pre-sales/Salesperson", async () => {
    await expect(
      createSale(pool, { creatorId: marketingHeadId, creatorRole: "MARKETING_HEAD", companyName: "Bad Credit Co", budgetAmount: 1, budgetType: "ONE_TIME", soldByType: "SALESPERSON", soldByUserId: preSalesId }),
    ).rejects.toThrow(SaleActionNotAllowedError);
  });

  it("links a sale to an existing lead, snapshots its company details, and closes it as won", async () => {
    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Lead-linked Co", phone: "555", serviceRequirements: "z", leadSource: "OTHER", email: "lead@example.com" });
    leadIds.push(lead.id);

    const sale = await createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", leadId: lead.id, budgetAmount: 2000, budgetType: "ONE_TIME" });
    saleIds.push(sale.id);
    expect(sale.lead_id).toBe(lead.id);
    expect(sale.company_name).toBe("Lead-linked Co");
    expect(sale.email).toBe("lead@example.com");

    const { rows } = await pool.query("SELECT status FROM leads WHERE id = $1", [lead.id]);
    expect(rows[0].status).toBe("CLOSED_WON");
  });

  it("refuses to record a sale against a Rejected lead", async () => {
    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Rejected Co", phone: "556", serviceRequirements: "z", leadSource: "OTHER" });
    leadIds.push(lead.id);
    await reviewLead(pool, { actorId: marketingHeadId, actorRole: "MARKETING_HEAD", leadId: lead.id, action: "REJECT", reason: "Not a fit" });

    await expect(
      createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", leadId: lead.id, budgetAmount: 500, budgetType: "ONE_TIME" }),
    ).rejects.toThrow(SaleActionNotAllowedError);
  });

  it("links the chosen services to the sale", async () => {
    const sale = await createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Service-linked Co", budgetAmount: 100, budgetType: "ONE_TIME", serviceIds: [serviceId] });
    saleIds.push(sale.id);
    const services = await listSaleServices(pool, sale.id);
    expect(services.map((s) => s.id)).toEqual([serviceId]);
  });

  it("records an initial/advance payment given at creation time", async () => {
    const sale = await createSale(pool, {
      creatorId: preSalesId,
      creatorRole: "PRE_SALES",
      companyName: "Advance Co",
      budgetAmount: 10000,
      budgetType: "ADVANCE",
      initialPaymentAmount: 2500,
      initialPaymentMethod: "UPI",
    });
    saleIds.push(sale.id);
    const payments = await listSalePayments(pool, { id: preSalesId, role: "PRE_SALES" }, sale.id);
    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(2500);
    expect(payments[0].payment_method).toBe("UPI");
  });
});
