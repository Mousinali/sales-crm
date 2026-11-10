import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertSaleVisible } from "./guard";
import type { SalePaymentRow, SalePaymentMethod } from "./types";

// Shared by recordSalePayment (guard-checked, API-facing) and createSale's
// optional initial/advance payment (already authorized by the sale creation
// itself) so there's one insert, not two.
export async function insertSalePayment(
  pool: Pool,
  input: { saleId: number; amount: number; paymentMethod: SalePaymentMethod; paymentDate?: string; notes?: string; recordedBy: number },
): Promise<SalePaymentRow> {
  const { rows } = await pool.query<SalePaymentRow>(
    `INSERT INTO sale_payments (sale_id, amount, payment_method, payment_date, notes, recorded_by)
     VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6)
     RETURNING *`,
    [input.saleId, input.amount, input.paymentMethod, input.paymentDate ?? null, input.notes ?? null, input.recordedBy],
  );
  return rows[0];
}

export async function recordSalePayment(
  pool: Pool,
  input: { actorId: number; actorRole: Role; saleId: number; amount: number; paymentMethod: SalePaymentMethod; paymentDate?: string; notes?: string },
): Promise<SalePaymentRow> {
  // Anyone who can see the sale (its creator, whoever it's credited to, or
  // a Marketing Head) can log a payment against it — same gate as viewing,
  // mirroring recordLeadActivity's "visible = can record progress" rule.
  await assertSaleVisible(pool, { id: input.actorId, role: input.actorRole }, input.saleId);
  return insertSalePayment(pool, {
    saleId: input.saleId,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    paymentDate: input.paymentDate,
    notes: input.notes,
    recordedBy: input.actorId,
  });
}

export async function listSalePayments(pool: Pool, viewer: { id: number; role: Role }, saleId: number): Promise<SalePaymentRow[]> {
  await assertSaleVisible(pool, viewer, saleId);
  const { rows } = await pool.query<SalePaymentRow>(
    `SELECT sp.*, u.name AS recorded_by_name FROM sale_payments sp
     JOIN users u ON u.id = sp.recorded_by
     WHERE sp.sale_id = $1 ORDER BY sp.payment_date DESC, sp.created_at DESC`,
    [saleId],
  );
  return rows;
}
