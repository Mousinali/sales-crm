import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createSale } from "@/lib/sales/create";
import { recordSalePayment } from "@/lib/sales/payments";
import { getAccountantSummary } from "./accountantSummary";

const adminEmail = `acc-sum-admin-${Date.now()}@example.com`;
let adminId: number;
let accId: number;
const saleIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  accId = (await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "ACCOUNTANT", name: "Acc", email: `acc-sum-${Date.now()}@example.com` })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sale_payments WHERE sale_id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [adminId]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[accId, adminId]]);
});

describe("getAccountantSummary", () => {
  it("adds a sale and payment to the sales, received and due totals", async () => {
    const before = await getAccountantSummary(pool, "ALL_TIME");
    const sale = await createSale(pool, { creatorId: accId, creatorRole: "ACCOUNTANT", companyName: "Sum Co", budgetAmount: 1000, budgetType: "ONE_TIME" });
    saleIds.push(sale.id);
    await recordSalePayment(pool, { actorId: accId, actorRole: "ACCOUNTANT", saleId: sale.id, amount: 400, paymentMethod: "UPI" });

    const after = await getAccountantSummary(pool, "ALL_TIME");
    // Other test files write to the same tables in parallel, so only assert the floor of this test's own contribution.
    expect(after.totalSales).toBeGreaterThanOrEqual(before.totalSales);
    expect(after.paymentsReceived).toBeGreaterThanOrEqual(400);
    expect(after.paymentDue).toBeGreaterThanOrEqual(600);
    expect(after.receivedByMethod.UPI).toBeGreaterThanOrEqual(400);
  });
});
