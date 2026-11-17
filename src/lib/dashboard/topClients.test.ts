import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createSale } from "@/lib/sales/create";
import { recordSalePayment } from "@/lib/sales/payments";
import { getGroupDetail, getPerformance } from "@/lib/analysis/performance";
import { getBestClients, getEmployeeRanking } from "./topClients";

const ALL = { page: 1, pageSize: 500 };
const stamp = Date.now();
let adminId: number;
let spId: number;
let otherSpId: number;
const saleIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  adminId = (await seedSuperAdmin(pool, { email: `top-admin-${stamp}@example.com`, name: "Admin", password: "1234" })).id;
  spId = (await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "SALESPERSON", name: "TopSP", email: `top-sp-${stamp}@example.com` })).id;
  otherSpId = (await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "SALESPERSON", name: "TopSP2", email: `top-sp2-${stamp}@example.com` })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sale_payments WHERE sale_id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [adminId]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[spId, otherSpId, adminId]]);
});

describe("best clients and employee ranking", () => {
  it("ranks clients by sales, scopes to a user, and credits only real employees", async () => {
    const big = await createSale(pool, { creatorId: spId, creatorRole: "SALESPERSON", companyName: `Big ${stamp}`, budgetAmount: 9000, budgetType: "ONE_TIME" });
    const small = await createSale(pool, { creatorId: otherSpId, creatorRole: "SALESPERSON", companyName: `Small ${stamp}`, budgetAmount: 100, budgetType: "ONE_TIME" });
    saleIds.push(big.id, small.id);

    const mine = await getBestClients(pool, "ALL_TIME", spId);
    expect(mine.map((c) => c.company)).toEqual([`Big ${stamp}`]);

    const all = await getBestClients(pool, "ALL_TIME", null, 200);
    expect(all.findIndex((c) => c.company === `Big ${stamp}`)).toBeLessThan(all.findIndex((c) => c.company === `Small ${stamp}`));
    expect(all.find((c) => c.company === `Big ${stamp}`)?.owners).toEqual([{ name: "TopSP", role: "SALESPERSON" }]);

    const ranking = await getEmployeeRanking(pool, "MONTH", 200);
    expect(ranking.find((e) => e.id === spId)).toMatchObject({ sales: 9000, count: 1 });
    expect(ranking.find((e) => e.id === otherSpId)?.sales).toBe(100);
  });

  it("groups performance by client, employee, industry and category", async () => {
    const byClient = await getPerformance(pool, "sales", "client", "ALL_TIME", ALL);
    expect(byClient.items.find((r) => r.label === `Big ${stamp}`)).toMatchObject({ sales: 9000, paid: 0, due: 9000, excess: 0, count: 1 });
    expect((await getPerformance(pool, "sales", "employee", "ALL_TIME", ALL)).items.find((r) => r.label === "TopSP")?.sales).toBe(9000);
    expect((await getPerformance(pool, "sales", "industry", "ALL_TIME", ALL)).items.find((r) => r.label === "Unknown")?.sales).toBeGreaterThanOrEqual(9100);
    expect((await getPerformance(pool, "payments", "category", "ALL_TIME", ALL)).items.every((r) => typeof r.paid === "number")).toBe(true);
    expect((await getPerformance(pool, "sales", "category", "ALL_TIME", ALL)).items.find((r) => r.label === "SALESPERSON")?.sales).toBeGreaterThanOrEqual(9100);
  });

  it("drills into one group with its sales and activity", async () => {
    const row = (await getPerformance(pool, "sales", "client", "ALL_TIME", ALL)).items.find((r) => r.label === `Big ${stamp}`)!;
    const detail = await getGroupDetail(pool, "client", row.key, "ALL_TIME", { page: 1, pageSize: 10 });
    expect(detail.totals).toEqual({ sales: 9000, paid: 0, due: 9000, excess: 0, count: 1 });
    expect(detail.sales.items).toHaveLength(1);
    expect(detail.events.some((e) => e.kind === "SALE")).toBe(true);
    const emp = await getGroupDetail(pool, "employee", String(spId), "ALL_TIME", { page: 1, pageSize: 10 });
    expect(emp.totals.sales).toBe(9000);
  });

  it("reports money paid beyond the sale amount as excess, not negative due", async () => {
    const sale = await createSale(pool, { creatorId: spId, creatorRole: "SALESPERSON", companyName: `Over ${stamp}`, budgetAmount: 1000, budgetType: "ONE_TIME" });
    saleIds.push(sale.id);
    await recordSalePayment(pool, { actorId: spId, actorRole: "SALESPERSON", saleId: sale.id, amount: 1500, paymentMethod: "CASH" });
    const row = (await getPerformance(pool, "payments", "client", "ALL_TIME", ALL)).items.find((r) => r.label === `Over ${stamp}`);
    expect(row).toMatchObject({ sales: 1000, paid: 1500, due: 0, excess: 500 });
    const detail = await getGroupDetail(pool, "client", `over ${stamp}`, "ALL_TIME", { page: 1, pageSize: 10 });
    expect(detail.totals).toMatchObject({ due: 0, excess: 500 });
  });
});
