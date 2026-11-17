import type { Pool } from "pg";
import { PERIOD_SINCE_SQL, type SummaryPeriod } from "./superAdminSummary";

// Company-wide money picture for the Accountant. Sales are scoped by sale
// date and payments by payment date; "due" is what's still unpaid on the
// sales made in the period (all payments ever received against them count).
export async function getAccountantSummary(pool: Pool, period: SummaryPeriod) {
  const since = PERIOD_SINCE_SQL[period];
  const [sales, received, due, companies, byMethod] = await Promise.all([
    pool.query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(budget_amount), 0) AS total, count(*) AS count FROM sales WHERE sale_date >= ${since}`,
    ),
    pool.query<{ total: string }>(`SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE payment_date >= ${since}`),
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(s.budget_amount - COALESCE(p.paid, 0), 0)), 0) AS total
       FROM sales s LEFT JOIN (SELECT sale_id, SUM(amount) AS paid FROM sale_payments GROUP BY sale_id) p ON p.sale_id = s.id
       WHERE s.sale_date >= ${since}`,
    ),
    pool.query<{ count: string }>(`SELECT count(DISTINCT company_name_normalized) AS count FROM leads WHERE archived_at IS NULL`),
    pool.query<{ payment_method: string; total: string }>(
      `SELECT payment_method, SUM(amount) AS total FROM sale_payments WHERE payment_date >= ${since} GROUP BY payment_method`,
    ),
  ]);

  return {
    totalSales: Number(sales.rows[0].total),
    salesCount: Number(sales.rows[0].count),
    paymentsReceived: Number(received.rows[0].total),
    paymentDue: Number(due.rows[0].total),
    totalCompanies: Number(companies.rows[0].count),
    receivedByMethod: Object.fromEntries(byMethod.rows.map((r) => [r.payment_method, Number(r.total)])),
  };
}
