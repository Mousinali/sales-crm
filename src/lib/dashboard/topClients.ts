import type { Pool } from "pg";
import { PERIOD_SINCE_SQL, type SummaryPeriod } from "./superAdminSummary";

// Calendar-based (this month/quarter/year), unlike the rolling summary
// periods — a leaderboard reads as "this month", not "last 30 days".
export const RANKING_RANGES = ["MONTH", "QUARTER", "YEAR", "ALL_TIME"] as const;
export type RankingRange = (typeof RANKING_RANGES)[number];

export const RANGE_SINCE_SQL: Record<RankingRange, string> = {
  MONTH: "date_trunc('month', current_date)",
  QUARTER: "date_trunc('quarter', current_date)",
  YEAR: "date_trunc('year', current_date)",
  ALL_TIME: "'-infinity'::timestamptz",
};

// Who a sale is credited to: the "sold by" user, else whoever recorded it —
// except custom-name sales, which have no employee to credit.
export const CREDITED_ID = "COALESCE(s.sold_by_user_id, CASE WHEN s.sold_by_type <> 'CUSTOM' THEN s.created_by END)";

// Clients ranked by sale amount. With userId, only that user's own sales
// (same ownership rule as getMySalesAndPayments); without, everyone's.
export async function getBestClients(pool: Pool, period: SummaryPeriod, userId: number | null, limit = 20) {
  const { rows } = await pool.query<{ company: string; sales: string; payments: string; owners: { name: string; role: string }[] }>(
    `SELECT min(s.company_name) AS company,
            SUM(s.budget_amount) AS sales,
            COALESCE(SUM((SELECT SUM(sp.amount) FROM sale_payments sp WHERE sp.sale_id = s.id)), 0) AS payments,
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object('name', u.name, 'role', u.role)) FILTER (WHERE u.id IS NOT NULL), '[]') AS owners
     FROM sales s LEFT JOIN users u ON u.id = ${CREDITED_ID}
     WHERE s.sale_date >= ${PERIOD_SINCE_SQL[period]}
       AND ($1::bigint IS NULL OR s.created_by = $1 OR s.sold_by_user_id = $1)
     GROUP BY lower(trim(s.company_name)) ORDER BY SUM(s.budget_amount) DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({ company: r.company, sales: Number(r.sales), payments: Number(r.payments), owners: r.owners }));
}

export async function getEmployeeRanking(pool: Pool, range: RankingRange, limit = 20) {
  const { rows } = await pool.query<{ id: string; name: string; role: string; sales: string; count: string }>(
    `SELECT u.id, u.name, u.role, SUM(s.budget_amount) AS sales, count(*) AS count
     FROM sales s JOIN users u ON u.id = ${CREDITED_ID}
     WHERE s.sale_date >= ${RANGE_SINCE_SQL[range]}
     GROUP BY u.id, u.name, u.role ORDER BY SUM(s.budget_amount) DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, role: r.role, sales: Number(r.sales), count: Number(r.count) }));
}
