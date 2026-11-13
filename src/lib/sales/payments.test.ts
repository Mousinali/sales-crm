import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createSale } from "./create";
import { recordSalePayment, listSalePayments, listPaymentsPage } from "./payments";
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

  it("assigns each payment a unique, sequential PY-prefixed payment number", async () => {
    const a = await recordSalePayment(pool, { actorId: preSalesId, actorRole: "PRE_SALES", saleId, amount: 10, paymentMethod: "CASH" });
    const b = await recordSalePayment(pool, { actorId: preSalesId, actorRole: "PRE_SALES", saleId, amount: 10, paymentMethod: "CASH" });
    expect(a.payment_number).toMatch(/^PY\d{6,}$/);
    expect(b.payment_number).not.toBe(a.payment_number);
  });

  it("records a receipt number and an account number for bank-tied methods", async () => {
    const payment = await recordSalePayment(pool, {
      actorId: preSalesId,
      actorRole: "PRE_SALES",
      saleId,
      amount: 250,
      paymentMethod: "BANK_TRANSFER",
      receiptNumber: "RCPT-001",
      accountNumber: "1234567890",
    });
    expect(payment.receipt_number).toBe("RCPT-001");
    expect(payment.account_number).toBe("1234567890");
  });

  it("lists payments across sales, scoped the same way listSalesPage scopes sales", async () => {
    const otherSale = await createSale(pool, { creatorId: otherPreSalesId, creatorRole: "PRE_SALES", companyName: "Other Payments Co", budgetAmount: 500, budgetType: "ONE_TIME" });
    saleIds.push(otherSale.id);
    await recordSalePayment(pool, { actorId: otherPreSalesId, actorRole: "PRE_SALES", saleId: otherSale.id, amount: 100, paymentMethod: "CASH" });

    const mine = await listPaymentsPage(pool, { id: preSalesId, role: "PRE_SALES" }, {}, { page: 1, pageSize: 50 });
    expect(mine.items.every((p) => p.sale_id === saleId)).toBe(true);

    const all = await listPaymentsPage(pool, { id: marketingHeadId, role: "MARKETING_HEAD" }, {}, { page: 1, pageSize: 50 });
    expect(all.items.some((p) => p.sale_id === otherSale.id)).toBe(true);
  });

  it("filters the payments list by method, date range, and receipt/payment number", async () => {
    const filterSale = await createSale(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Filterable Co", budgetAmount: 9000, budgetType: "PART_PAYMENT" });
    saleIds.push(filterSale.id);

    const upi = await recordSalePayment(pool, {
      actorId: preSalesId, actorRole: "PRE_SALES", saleId: filterSale.id,
      amount: 100, paymentMethod: "UPI", paymentDate: "2024-03-10", receiptNumber: "RCPT-FILTER-UPI",
    });
    await recordSalePayment(pool, {
      actorId: preSalesId, actorRole: "PRE_SALES", saleId: filterSale.id,
      amount: 200, paymentMethod: "CHEQUE", paymentDate: "2024-06-20", receiptNumber: "RCPT-FILTER-CHQ",
    });

    const viewer = { id: marketingHeadId, role: "MARKETING_HEAD" as const };
    const pageParams = { page: 1, pageSize: 50 };
    const idsOf = (result: { items: { id: number }[] }) => result.items.map((p) => p.id);

    const byMethod = await listPaymentsPage(pool, viewer, { method: "UPI" }, pageParams);
    expect(byMethod.items.every((p) => p.payment_method === "UPI")).toBe(true);
    expect(idsOf(byMethod)).toContain(upi.id);

    // Window deliberately excludes the June cheque, so an over-broad range fails here.
    const byDate = await listPaymentsPage(pool, viewer, { dateFrom: new Date("2024-03-01"), dateTo: new Date("2024-03-31") }, pageParams);
    expect(idsOf(byDate)).toContain(upi.id);
    expect(byDate.items.every((p) => p.payment_date >= "2024-03-01" && p.payment_date <= "2024-03-31")).toBe(true);

    // Receipt and payment numbers are searchable, not just the company name.
    expect(idsOf(await listPaymentsPage(pool, viewer, { q: "RCPT-FILTER-UPI" }, pageParams))).toEqual([upi.id]);
    expect(idsOf(await listPaymentsPage(pool, viewer, { q: upi.payment_number }, pageParams))).toEqual([upi.id]);

    // Filters combine rather than override one another.
    const combined = await listPaymentsPage(pool, viewer, { method: "CHEQUE", dateFrom: new Date("2024-03-01"), dateTo: new Date("2024-03-31") }, pageParams);
    expect(idsOf(combined)).not.toContain(upi.id);
  });
});
