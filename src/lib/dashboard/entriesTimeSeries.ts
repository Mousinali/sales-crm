import type { Pool } from "pg";
import { leadVisibleSql } from "@/lib/leads/visibility";

export const ENTRIES_PERIODS = ["TODAY", "WEEK", "MONTH"] as const;
export type EntriesPeriod = (typeof ENTRIES_PERIODS)[number];

// SALES_AMOUNT / PAYMENTS_AMOUNT plot rupees (the Accountant's chart); the rest
// plot a row count. Every metric reports both figures either way — the bar uses
// one, the tooltip shows both.
export const ENTRIES_METRICS = ["LEADS", "SALES", "PAYMENTS", "SALES_AMOUNT", "PAYMENTS_AMOUNT"] as const;
export type EntriesMetric = (typeof ENTRIES_METRICS)[number];

/** `value` is what the bar plots; `count` and `amount` are always populated. */
export type EntriesPoint = { label: string; value: number; count: number; amount: number };

const isPayments = (metric: EntriesMetric) => metric === "PAYMENTS" || metric === "PAYMENTS_AMOUNT";
const isMoneyMetric = (metric: EntriesMetric) => metric === "SALES_AMOUNT" || metric === "PAYMENTS_AMOUNT";

const PERIOD_CONFIG: Record<EntriesPeriod, { bucketTrunc: "hour" | "day"; generateSeries: string; labelFormat: string }> = {
  TODAY: {
    bucketTrunc: "hour",
    generateSeries: `generate_series(date_trunc('day', now()), date_trunc('day', now()) + interval '23 hours', interval '1 hour')`,
    labelFormat: "FMHH12 AM",
  },
  WEEK: {
    bucketTrunc: "day",
    generateSeries: `generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day')`,
    labelFormat: "Dy",
  },
  MONTH: {
    bucketTrunc: "day",
    generateSeries: `generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day')`,
    labelFormat: "FMDD Mon",
  },
};

// Without ownerId (Super Admin, Accountant) the chart covers every record. The
// join condition lives in the ON clause (not a trailing
// WHERE) so a bucket with zero matching rows still comes back as a real
// zero instead of being dropped by the join.
async function entriesSeries(pool: Pool, metric: EntriesMetric, period: EntriesPeriod, ownerId?: number): Promise<EntriesPoint[]> {
  const { bucketTrunc, generateSeries, labelFormat } = PERIOD_CONFIG[period];
  // ownerId narrows to one user's own records (their leads, or sales they recorded / were credited with).
  // sale_payments carries neither created_by nor sold_by_user_id — only recorded_by.
  const ownerCondition =
    ownerId === undefined
      ? ""
      : metric === "LEADS"
        ? ` AND ${leadVisibleSql("t", "$1")}`
        : isPayments(metric)
          ? ` AND t.recorded_by = $1`
          : ` AND (t.created_by = $1 OR t.sold_by_user_id = $1)`;
  const joinCondition =
    (metric === "LEADS"
      ? `date_trunc('${bucketTrunc}', t.created_at) = b.bucket AND t.archived_at IS NULL`
      : `date_trunc('${bucketTrunc}', t.created_at) = b.bucket`) + ownerCondition;

  const table = metric === "LEADS" ? "leads" : isPayments(metric) ? "sale_payments" : "sales";
  // Leads have no money column, so their amount is a constant zero.
  const amountAggregate =
    metric === "LEADS" ? "0" : isPayments(metric) ? "COALESCE(sum(t.amount), 0)" : "COALESCE(sum(t.budget_amount), 0)";

  const { rows } = await pool.query<{ label: string; count: string; amount: string }>(
    `WITH buckets AS (SELECT ${generateSeries} AS bucket)
     SELECT to_char(b.bucket, '${labelFormat}') AS label, count(t.id) AS count, ${amountAggregate} AS amount
     FROM buckets b
     LEFT JOIN ${table} t ON ${joinCondition}
     GROUP BY b.bucket
     ORDER BY b.bucket`,
    ownerId === undefined ? [] : [ownerId],
  );
  return rows.map((r) => {
    const count = Number(r.count);
    const amount = Number(r.amount);
    return { label: r.label, value: isMoneyMetric(metric) ? amount : count, count, amount };
  });
}

export async function getEntriesTimeSeries(pool: Pool, metric: EntriesMetric, period: EntriesPeriod, ownerId?: number): Promise<EntriesPoint[]> {
  return entriesSeries(pool, metric, period, ownerId);
}
