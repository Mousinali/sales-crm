import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertSaleVisible } from "./guard";
import { financialYearCode } from "./saleNumber";
import { nextPaymentNumber } from "./paymentNumber";
import { toPagedResult, type PageParams, type PagedResult } from "@/lib/pagination";
import type { SalePaymentRow, SalePaymentMethod } from "./types";

// Shared by recordSalePayment (guard-checked, API-facing) and createSale's
// optional initial/advance payment (already authorized by the sale creation
// itself) so there's one insert, not two.
export async function insertSalePayment(
  pool: Pool,
  input: {
    saleId: number;
    amount: number;
    paymentMethod: SalePaymentMethod;
    paymentDate?: string;
    receiptNumber?: string;
    accountNumber?: string;
    notes?: string;
    recordedBy: number;
  },
): Promise<SalePaymentRow> {
  // The payment number's sequence (per financial year) is read-then-written,
  // so it's generated and inserted inside one locked transaction, same as
  // sale numbers — avoids two concurrent payments landing on the same number.
  const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`payment-number:${financialYearCode(paymentDate)}`]);
    const paymentNumber = await nextPaymentNumber(client, paymentDate);

    const { rows } = await client.query<SalePaymentRow>(
      `INSERT INTO sale_payments (payment_number, sale_id, amount, payment_method, payment_date, receipt_number, account_number, notes, recorded_by)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7, $8, $9)
       RETURNING *`,
      [
        paymentNumber,
        input.saleId,
        input.amount,
        input.paymentMethod,
        input.paymentDate ?? null,
        input.receiptNumber ?? null,
        input.accountNumber ?? null,
        input.notes ?? null,
        input.recordedBy,
      ],
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function recordSalePayment(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    saleId: number;
    amount: number;
    paymentMethod: SalePaymentMethod;
    paymentDate?: string;
    receiptNumber?: string;
    accountNumber?: string;
    notes?: string;
  },
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
    receiptNumber: input.receiptNumber,
    accountNumber: input.accountNumber,
    notes: input.notes,
    recordedBy: input.actorId,
  });
}

export async function listSalePayments(pool: Pool, viewer: { id: number; role: Role }, saleId: number): Promise<SalePaymentRow[]> {
  await assertSaleVisible(pool, viewer, saleId);
  const { rows } = await pool.query<SalePaymentRow>(
    `SELECT sp.*, u.name AS recorded_by_name, u.avatar_url AS recorded_by_avatar_url FROM sale_payments sp
     JOIN users u ON u.id = sp.recorded_by
     WHERE sp.sale_id = $1 ORDER BY sp.payment_date DESC, sp.created_at DESC`,
    [saleId],
  );
  return rows;
}

// Mirrors listSalesPage's visibility (list.ts's buildSalesWhere): Super
// Admin and Marketing Head see every payment; a Pre-sales or Salesperson
// only the ones against sales they created or were credited with; HR has
// no access at all.
export type PaymentFilters = {
  q?: string;
  method?: SalePaymentMethod;
  dateFrom?: Date;
  dateTo?: Date;
};

export async function listPaymentsPage(
  pool: Pool,
  viewer: { id: number; role: Role },
  filters: PaymentFilters,
  page: PageParams,
): Promise<PagedResult<SalePaymentRow>> {
  if (viewer.role === "HR") return { items: [], page: page.page, pageSize: page.pageSize, total: 0, totalPages: 1 };

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (viewer.role === "PRE_SALES" || viewer.role === "SALESPERSON") {
    params.push(viewer.id);
    conditions.push(`(sales.created_by = $${params.length} OR sales.sold_by_user_id = $${params.length})`);
  }
  if (filters.q) {
    // Company name alone missed the identifiers people actually read off a
    // receipt, so the payment and receipt numbers match the same box.
    params.push(`%${filters.q}%`);
    conditions.push(
      `(sales.company_name ILIKE $${params.length} OR sp.payment_number ILIKE $${params.length} OR sp.receipt_number ILIKE $${params.length})`,
    );
  }
  if (filters.method) {
    params.push(filters.method);
    conditions.push(`sp.payment_method = $${params.length}`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`sp.payment_date >= $${params.length}`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`sp.payment_date <= $${params.length}`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<SalePaymentRow & { total_count: number }>(
    `SELECT sp.*, u.name AS recorded_by_name, u.avatar_url AS recorded_by_avatar_url,
            sales.sale_number, sales.company_name, sales.budget_amount,
            paid.total AS paid_amount,
            count(*) OVER() AS total_count
     FROM sale_payments sp
     JOIN sales ON sales.id = sp.sale_id
     JOIN users u ON u.id = sp.recorded_by
     JOIN LATERAL (SELECT SUM(amount) AS total FROM sale_payments WHERE sale_payments.sale_id = sales.id) paid ON true
     ${whereClause}
     ORDER BY sp.payment_date DESC, sp.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return toPagedResult(rows, page);
}
