import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { recordAuditLog } from "@/lib/audit/log";
import { SaleActionNotAllowedError, SaleNotFoundError } from "./errors";

type Actor = { id: number; role: Role };
type Changes = { amount?: number; date?: string };

// Shared by the sale (budget_amount/sale_date) and payment (amount/payment_date)
// edits: update, then log old -> new so the sale page can show the history.
async function edit(
  pool: Pool,
  actor: Actor,
  saleId: number,
  target: { table: "sales" | "sale_payments"; id: number; amountCol: string; dateCol: string; ownerCol: string; action: string },
  changes: Changes,
): Promise<void> {
  const where = target.table === "sales" ? "id = $1" : "id = $1 AND sale_id = $4";
  const params: unknown[] = [target.id, changes.amount ?? null, changes.date ?? null];
  if (target.table === "sale_payments") params.push(saleId);
  // Only whoever added the sale / recorded the payment may change it.
  const { rows: owner } = await pool.query<{ owner: number }>(
    `SELECT ${target.ownerCol} AS owner FROM ${target.table} WHERE id = $1${target.table === "sale_payments" ? " AND sale_id = $2" : ""}`,
    target.table === "sale_payments" ? [target.id, saleId] : [target.id],
  );
  if (!owner[0]) throw new SaleNotFoundError(`No ${target.table} row ${target.id}`);
  if (owner[0].owner !== actor.id) throw new SaleActionNotAllowedError("Only the user who added this can edit it");
  const { rows } = await pool.query(
    `WITH old AS (SELECT ${target.amountCol} AS amount, ${target.dateCol}::text AS date FROM ${target.table} WHERE ${where} FOR UPDATE)
     UPDATE ${target.table} t SET ${target.amountCol} = COALESCE($2, t.${target.amountCol}), ${target.dateCol} = COALESCE($3::date, t.${target.dateCol})
     FROM old WHERE t.id = $1
     RETURNING old.amount AS old_amount, old.date AS old_date, t.${target.amountCol} AS new_amount, t.${target.dateCol}::text AS new_date`,
    params,
  );
  const r = rows[0];
  if (!r) throw new SaleNotFoundError(`No ${target.table} row ${target.id}`);
  await recordAuditLog(pool, {
    actorUserId: actor.id,
    action: target.action,
    targetTable: target.table,
    targetId: target.id,
    details: { saleId, amount: [r.old_amount, r.new_amount], date: [r.old_date, r.new_date] },
  });
}

export const updateSaleFields = (pool: Pool, actor: Actor, saleId: number, c: Changes) =>
  edit(pool, actor, saleId, { table: "sales", id: saleId, amountCol: "budget_amount", dateCol: "sale_date", ownerCol: "created_by", action: "sale.update" }, c);

export const updatePaymentFields = (pool: Pool, actor: Actor, saleId: number, paymentId: number, c: Changes) =>
  edit(pool, actor, saleId, { table: "sale_payments", id: paymentId, amountCol: "amount", dateCol: "payment_date", ownerCol: "recorded_by", action: "sale_payment.update" }, c);

export async function listSaleEditLogs(pool: Pool, saleId: number) {
  const { rows } = await pool.query<{ id: number; action: string; target_id: number; payment_number: string | null; details: { amount: [string, string]; date: [string, string] }; created_at: Date; actor_name: string | null }>(
    `SELECT a.id, a.action, a.target_id, a.details, a.created_at, u.name AS actor_name, sp.payment_number
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
     LEFT JOIN sale_payments sp ON a.action = 'sale_payment.update' AND sp.id = a.target_id
     WHERE a.action IN ('sale.update', 'sale_payment.update') AND (a.details->>'saleId')::bigint = $1
     ORDER BY a.created_at DESC`,
    [saleId],
  );
  return rows;
}
