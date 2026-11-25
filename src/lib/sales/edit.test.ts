import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSale } from "./create";
import { recordSalePayment } from "./payments";
import { updateSaleFields, updatePaymentFields, listSaleEditLogs } from "./edit";
import { SaleActionNotAllowedError, SaleNotFoundError } from "./errors";

let actor: { id: number; role: "SUPER_ADMIN" };
let saleId: number;
let otherSaleId: number;
let paymentId: number;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  actor = { id: (await seedSuperAdmin(pool, { email: `sale-edit-${Date.now()}@example.com`, name: "A", password: "1234" })).id, role: "SUPER_ADMIN" };
  // The NUL also covers db.ts's stripNul: Postgres rejects the whole insert if it gets through.
  const make = () => createSale(pool, { creatorId: actor.id, creatorRole: "SUPER_ADMIN", companyName: "Edit\0 Co", budgetAmount: 100, budgetType: "ONE_TIME" });
  saleId = (await make()).id;
  otherSaleId = (await make()).id;
  paymentId = (await recordSalePayment(pool, { actorId: actor.id, actorRole: "SUPER_ADMIN", saleId, amount: 10, paymentMethod: "CASH" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sale_payments WHERE sale_id = ANY($1)", [[saleId, otherSaleId]]);
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [[saleId, otherSaleId]]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [actor.id]);
  await pool.query("DELETE FROM users WHERE id = $1", [actor.id]);
});

describe("sale and payment edits", () => {
  it("strips NUL characters on the way in", async () => {
    const { rows } = await pool.query("SELECT company_name FROM sales WHERE id = $1", [saleId]);
    expect(rows[0].company_name).toBe("Edit Co");
  });

  it("updates a sale and a payment, logging each once as old -> new", async () => {
    await updateSaleFields(pool, actor, saleId, { amount: 200, date: "2026-11-01" });
    await updatePaymentFields(pool, actor, saleId, paymentId, { amount: 20 });
    const { rows } = await pool.query("SELECT s.budget_amount::int AS b, s.sale_date AS d, p.amount::int AS a FROM sales s JOIN sale_payments p ON p.sale_id = s.id WHERE s.id = $1", [saleId]);
    expect(rows[0]).toEqual({ b: 200, d: "2026-11-01", a: 20 });
    const logs = await listSaleEditLogs(pool, saleId);
    expect(logs.map((l) => l.action).sort()).toEqual(["sale.update", "sale_payment.update"]);
  });

  it("refuses someone else's sale, and a payment addressed through the wrong sale", async () => {
    await expect(updateSaleFields(pool, { id: actor.id + 1_000_000, role: "SALESPERSON" }, saleId, { amount: 1 })).rejects.toBeInstanceOf(SaleActionNotAllowedError);
    await expect(updatePaymentFields(pool, actor, otherSaleId, paymentId, { amount: 1 })).rejects.toBeInstanceOf(SaleNotFoundError);
    await expect(updateSaleFields(pool, actor, 999_999_999, { amount: 1 })).rejects.toBeInstanceOf(SaleNotFoundError);
  });
});
