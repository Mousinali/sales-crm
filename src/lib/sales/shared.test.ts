import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { shareLead } from "@/lib/leads/share";
import { listLeadActivities, recordLeadActivity } from "@/lib/leads/activities";
import { normalizeCompanyName } from "@/lib/leads/normalize";
import { listCompaniesPage } from "@/lib/companies/list";
import { getCompany } from "@/lib/companies/get";
import { CompanyNotFoundError } from "@/lib/companies/errors";
import { createSale } from "./create";
import { listSalesPage } from "./list";
import { listPaymentsPage, recordSalePayment, listSalePayments } from "./payments";
import { assertSaleVisible } from "./guard";
import { SaleNotAccessibleError } from "./errors";

const adminEmail = `shared-sales-admin-${Date.now()}@example.com`;
let adminId: number;
let a: number; // lead owner
let b: number; // shared with
let c: number; // stranger
const emails: string[] = [];
let leadId: number;
let saleId: number;
const COMPANY = `Shared Sales Co ${Date.now()}`;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mk = async (role: "PRE_SALES" | "SALESPERSON" | "MARKETING_HEAD", tag: string) => {
    const u = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role, name: tag, email: `shared-sales-${tag}-${Date.now()}@example.com` });
    emails.push(u.email);
    return u.id;
  };
  a = await mk("PRE_SALES", "a");
  b = await mk("MARKETING_HEAD", "b");
  c = await mk("SALESPERSON", "c");
  leadId = (await createLead(pool, { creatorId: a, creatorRole: "PRE_SALES", companyName: COMPANY, phone: "1", leadSource: "OTHER" })).id;
  await shareLead(pool, { id: a, role: "PRE_SALES" }, leadId, b);
});

afterAll(async () => {
  await pool.query("DELETE FROM sale_payments WHERE sale_id = $1", [saleId]);
  await pool.query("DELETE FROM sales WHERE id = $1", [saleId]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = $1", [leadId]);
  await pool.query("DELETE FROM lead_shares WHERE lead_id = $1", [leadId]);
  await pool.query("DELETE FROM notifications WHERE lead_id = $1", [leadId]);
  await pool.query("DELETE FROM leads WHERE id = $1", [leadId]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY(SELECT id FROM users WHERE email = ANY($1)) OR actor_user_id = $2", [[...emails, adminEmail], adminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...emails, adminEmail]]);
});

const all = { page: 1, pageSize: 100 };

describe("a shared lead shares its sales, payments, activity and company", () => {
  it("lets the shared user record the sale and a payment", async () => {
    const sale = await createSale(pool, { creatorId: b, creatorRole: "MARKETING_HEAD", leadId, budgetAmount: 5000, budgetType: "ONE_TIME" });
    saleId = sale.id;
    await recordSalePayment(pool, { actorId: b, actorRole: "MARKETING_HEAD", saleId, amount: 1000, paymentMethod: "UPI" });
    await recordLeadActivity(pool, { leadId, actorId: b, type: "NOTE", notes: "from B" });
  });

  it("shows that sale, its payments and the activity to the lead's owner too", async () => {
    const sales = await listSalesPage(pool, { id: a, role: "PRE_SALES" }, {}, all);
    expect(sales.items.some((s) => s.id === saleId)).toBe(true);
    expect((await listPaymentsPage(pool, { id: a, role: "PRE_SALES" }, {}, all)).items.some((p) => p.sale_id === saleId)).toBe(true);
    expect((await listSalePayments(pool, { id: a, role: "PRE_SALES" }, saleId)).length).toBe(1);
    expect((await listLeadActivities(pool, { id: a, role: "PRE_SALES" }, leadId)).some((x) => x.notes === "from B")).toBe(true);
  });

  it("hides the sale and payments from a stranger", async () => {
    expect((await listSalesPage(pool, { id: c, role: "SALESPERSON" }, {}, all)).items.some((s) => s.id === saleId)).toBe(false);
    await expect(assertSaleVisible(pool, { id: c, role: "SALESPERSON" }, saleId)).rejects.toThrow(SaleNotAccessibleError);
  });

  it("shows the company to both owner and shared user (with its sale), and not to a stranger", async () => {
    const key = normalizeCompanyName(COMPANY);
    for (const viewer of [a, b]) {
      const list = await listCompaniesPage(pool, { q: COMPANY }, all, viewer);
      expect(list.items.map((x) => x.company_name_normalized)).toContain(key);
      const detail = await getCompany(pool, key, viewer);
      expect(detail.leads).toHaveLength(1);
      expect(detail.sales.map((s) => s.id)).toContain(saleId);
    }
    expect((await listCompaniesPage(pool, { q: COMPANY }, all, c)).items).toHaveLength(0);
    await expect(getCompany(pool, key, c)).rejects.toThrow(CompanyNotFoundError);
  });
});
