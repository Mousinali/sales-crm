import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createSale } from "./create";
import { recordSalePayment, listSalePayments } from "./payments";
import { SaleNotAccessibleError } from "./errors";

const adminEmail = `sale-payments-admin-${Date.now()}@example.com`;
let marketingHeadId: number;
let preSalesId: number;
let otherPreSalesId: number;
let saleId: number;
const saleIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mh = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "MH", email: `sale-payments-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `sale-payments-ps-${Date.now()}@example.com` });
  const ps2 = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS2", email: `sale-payments-ps2-${Date.now()}@example.com` });
  marketingHeadId = mh.id;
  preSalesId = ps.id;
  otherPreSalesId = ps2.id;

  const sale = await createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Payments Co", budgetAmount: 10000, budgetType: "PART_PAYMENT" });
  saleId = sale.id;
  saleIds.push(sale.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM sale_payments WHERE sale_id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [saleIds]);
});

describe("recordSalePayment / listSalePayments", () => {
  it("records multiple payments and sums them as a running total", async () => {
    await recordSalePayment(pool, { actorId: preSalesId, actorRole: "PRE_SALES", saleId, amount: 3000, paymentMethod: "CASH" });
    await recordSalePayment(pool, { actorId: preSalesId, actorRole: "PRE_SALES", saleId, amount: 2000, paymentMethod: "UPI", notes: "Second installment" });

    const payments = await listSalePayments(pool, { id: preSalesId, role: "PRE_SALES" }, saleId);
    expect(payments).toHaveLength(2);
    const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    expect(total).toBe(5000);
    expect(payments[0].recorded_by_name).toBe("PS");
  });

  it("lets a Marketing Head view and record payments on any sale", async () => {
    const payment = await recordSalePayment(pool, { actorId: marketingHeadId, actorRole: "MARKETING_HEAD", saleId, amount: 1000, paymentMethod: "CHEQUE" });
    expect(payment.payment_method).toBe("CHEQUE");
    const payments = await listSalePayments(pool, { id: marketingHeadId, role: "MARKETING_HEAD" }, saleId);
    expect(payments.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses a Pre-sales user who isn't this sale's creator or sold-by", async () => {
    await expect(
      recordSalePayment(pool, { actorId: otherPreSalesId, actorRole: "PRE_SALES", saleId, amount: 500, paymentMethod: "CASH" }),
    ).rejects.toThrow(SaleNotAccessibleError);
    await expect(listSalePayments(pool, { id: otherPreSalesId, role: "PRE_SALES" }, saleId)).rejects.toThrow(SaleNotAccessibleError);
  });
});
