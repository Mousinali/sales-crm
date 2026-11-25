import type { Pool } from "pg";
import { PERIOD_SINCE_SQL, type SummaryPeriod } from "./superAdminSummary";
import { ARCHIVED_COMPANY_SALE_IDS } from "./archivedCompany";

// A user's own sales (recorded or credited to them) and the payments received
// against those sales — the same ownership rule as the Sales/Payments lists
// (sales/list.ts). Sales are scoped by sale date, payments by payment date.
export async function getMySalesAndPayments(pool: Pool, userId: number, period: SummaryPeriod) {
  const since = PERIOD_SINCE_SQL[period];
  const [sales, payments] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(budget_amount), 0) AS total FROM sales
       WHERE (created_by = $1 OR sold_by_user_id = $1) AND sale_date >= ${since} AND id NOT IN (${ARCHIVED_COMPANY_SALE_IDS})`,
      [userId],
    ),
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(sp.amount), 0) AS total FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
       WHERE (s.created_by = $1 OR s.sold_by_user_id = $1) AND sp.payment_date >= ${since} AND sp.sale_id NOT IN (${ARCHIVED_COMPANY_SALE_IDS})`,
      [userId],
    ),
  ]);
  return { mySales: Number(sales.rows[0].total), myPayments: Number(payments.rows[0].total) };
}

// Payments received per client company against the user's own sales, biggest first.
export async function getMyPaymentsByClient(pool: Pool, userId: number, period: SummaryPeriod, limit = 8) {
  const since = PERIOD_SINCE_SQL[period];
  const { rows } = await pool.query<{ company_name: string; total: string }>(
    `SELECT s.company_name, SUM(sp.amount) AS total FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
     WHERE (s.created_by = $1 OR s.sold_by_user_id = $1) AND sp.payment_date >= ${since} AND sp.sale_id NOT IN (${ARCHIVED_COMPANY_SALE_IDS})
     GROUP BY s.company_name ORDER BY total DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({ label: r.company_name, value: Number(r.total) }));
}
