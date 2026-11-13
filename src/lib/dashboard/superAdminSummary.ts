import type { Pool } from "pg";

export const SUMMARY_PERIODS = ["TODAY", "WEEK", "MONTH"] as const;
export type SummaryPeriod = (typeof SUMMARY_PERIODS)[number];

// Same rolling-window convention as entriesTimeSeries.ts's period buckets
// (today / last 7 days / last 30 days, inclusive of today) — kept here as
// plain range starts rather than a bucketed series.
const PERIOD_SINCE_SQL: Record<SummaryPeriod, string> = {
  TODAY: "date_trunc('day', now())",
  WEEK: "date_trunc('day', now()) - interval '6 days'",
  MONTH: "date_trunc('day', now()) - interval '29 days'",
};

export async function getSuperAdminPeriodSummary(pool: Pool, period: SummaryPeriod) {
  const since = PERIOD_SINCE_SQL[period];
  const [sales, leads, companies, payments] = await Promise.all([
    pool.query<{ total: string }>(`SELECT COALESCE(SUM(budget_amount), 0) AS total FROM sales WHERE sale_date >= ${since}`),
    pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE created_at >= ${since} AND archived_at IS NULL`),
    pool.query<{ count: string }>(
      `SELECT count(DISTINCT company_name_normalized) AS count FROM leads WHERE created_at >= ${since}`,
    ),
    pool.query<{ total: string }>(`SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE payment_date >= ${since}`),
  ]);

  return {
    totalSales: Number(sales.rows[0].total),
    totalLeads: Number(leads.rows[0].count),
    totalCompanies: Number(companies.rows[0].count),
    totalPaymentsReceived: Number(payments.rows[0].total),
  };
}
