import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createSale } from "@/lib/sales/create";
import { recordSalePayment } from "@/lib/sales/payments";
import { getMySalesAndPayments, getMyPaymentsByClient } from "./mySales";
import { getEntriesTimeSeries } from "./entriesTimeSeries";

const adminEmail = `my-sales-admin-${Date.now()}@example.com`;
let adminId: number;
let spId: number;
let otherSpId: number;
const saleIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  spId = (await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "SALESPERSON", name: "SP", email: `my-sales-sp-${Date.now()}@example.com` })).id;
  otherSpId = (await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "SALESPERSON", name: "SP2", email: `my-sales-sp2-${Date.now()}@example.com` })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sale_payments WHERE sale_id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [adminId]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[spId, otherSpId, adminId]]);
});

describe("a salesperson's own sales figures", () => {
  it("counts only their own sales, payments and per-client payments", async () => {
    const mine = await createSale(pool, { creatorId: spId, creatorRole: "SALESPERSON", companyName: "Mine Co", budgetAmount: 1000, budgetType: "ONE_TIME" });
    const theirs = await createSale(pool, { creatorId: otherSpId, creatorRole: "SALESPERSON", companyName: "Theirs Co", budgetAmount: 5000, budgetType: "ONE_TIME" });
    saleIds.push(mine.id, theirs.id);
    await recordSalePayment(pool, { actorId: spId, actorRole: "SALESPERSON", saleId: mine.id, amount: 300, paymentMethod: "CASH" });
    await recordSalePayment(pool, { actorId: otherSpId, actorRole: "SALESPERSON", saleId: theirs.id, amount: 900, paymentMethod: "CASH" });

    expect(await getMySalesAndPayments(pool, spId, "ALL_TIME")).toEqual({ mySales: 1000, myPayments: 300 });
    expect(await getMyPaymentsByClient(pool, spId, "ALL_TIME")).toEqual([{ label: "Mine Co", value: 300 }]);

    const todaySales = await getEntriesTimeSeries(pool, "SALES", "MONTH", spId);
    expect(todaySales.reduce((n, p) => n + p.value, 0)).toBe(1);

    // Every point carries both figures, whichever one the bar happens to plot.
    const sum = (points: { count: number; amount: number }[]) => ({
      count: points.reduce((n, p) => n + p.count, 0),
      amount: points.reduce((n, p) => n + p.amount, 0),
    });

    expect(sum(await getEntriesTimeSeries(pool, "SALES", "MONTH", spId))).toEqual({ count: 1, amount: 1000 });
    // Payments scope by recorded_by, so the other salesperson's 900 is excluded.
    expect(sum(await getEntriesTimeSeries(pool, "PAYMENTS", "MONTH", spId))).toEqual({ count: 1, amount: 300 });
    // Leads have no money column, so their amount is a constant zero.
    expect(sum(await getEntriesTimeSeries(pool, "LEADS", "MONTH", spId)).amount).toBe(0);

    // The money metrics plot rupees while still reporting the row count.
    const salesAmount = await getEntriesTimeSeries(pool, "SALES_AMOUNT", "MONTH", spId);
    expect(salesAmount.reduce((n, p) => n + p.value, 0)).toBe(1000);
    expect(sum(salesAmount).count).toBe(1);
  });
});
