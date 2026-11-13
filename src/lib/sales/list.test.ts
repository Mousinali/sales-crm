import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createSale } from "./create";
import { listSalesPage } from "./list";

const adminEmail = `sale-list-admin-${Date.now()}@example.com`;
let marketingHeadId: number;
let preSalesId: number;
const saleIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mh = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "MH", email: `sale-list-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `sale-list-ps-${Date.now()}@example.com` });
  marketingHeadId = mh.id;
  preSalesId = ps.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sale_payments WHERE sale_id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [saleIds]);
});

describe("listSalesPage filters", () => {
  it("filters by budget type, date range, and searches sale number / contact person", async () => {
    const monthly = await createSale(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES",
      companyName: "Filterable Sales Co", contactPerson: "Ananya Bose",
      budgetAmount: 5000, budgetType: "MONTHLY", saleDate: "2024-03-10",
    });
    const oneTime = await createSale(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES",
      companyName: "Another Sales Co", contactPerson: "Rahul Mehta",
      budgetAmount: 7000, budgetType: "ONE_TIME", saleDate: "2024-06-20",
    });
    saleIds.push(monthly.id, oneTime.id);

    const viewer = { id: marketingHeadId, role: "MARKETING_HEAD" as const };
    const pageParams = { page: 1, pageSize: 50 };
    const idsOf = (result: { items: { id: number }[] }) => result.items.map((s) => s.id);

    const byType = await listSalesPage(pool, viewer, { budgetType: "MONTHLY" }, pageParams);
    expect(byType.items.every((s) => s.budget_type === "MONTHLY")).toBe(true);
    expect(idsOf(byType)).toContain(monthly.id);
    expect(idsOf(byType)).not.toContain(oneTime.id);

    // Window deliberately excludes the June sale, so an over-broad range fails here.
    const byDate = await listSalesPage(pool, viewer, { dateFrom: new Date("2024-03-01"), dateTo: new Date("2024-03-31") }, pageParams);
    expect(idsOf(byDate)).toContain(monthly.id);
    expect(idsOf(byDate)).not.toContain(oneTime.id);

    // Sale number and contact person are searchable, not just the company name.
    expect(idsOf(await listSalesPage(pool, viewer, { q: monthly.sale_number }, pageParams))).toEqual([monthly.id]);
    expect(idsOf(await listSalesPage(pool, viewer, { q: "Rahul Mehta" }, pageParams))).toEqual([oneTime.id]);

    // Filters combine rather than override one another.
    const combined = await listSalesPage(pool, viewer, { budgetType: "ONE_TIME", dateFrom: new Date("2024-03-01"), dateTo: new Date("2024-03-31") }, pageParams);
    expect(idsOf(combined)).not.toContain(oneTime.id);
  });
});
