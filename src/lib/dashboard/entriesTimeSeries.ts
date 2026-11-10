import type { Pool } from "pg";

export const ENTRIES_PERIODS = ["TODAY", "WEEK", "MONTH"] as const;
export type EntriesPeriod = (typeof ENTRIES_PERIODS)[number];

export const ENTRIES_METRICS = ["LEADS", "SALES"] as const;
export type EntriesMetric = (typeof ENTRIES_METRICS)[number];

export type EntriesPoint = { label: string; value: number };

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

// Marketing Head (the only viewer of this chart today) already sees every
// lead/sale with no per-owner scoping elsewhere on their dashboard — the
// join condition keeps that, and lives in the ON clause (not a trailing
// WHERE) so a bucket with zero matching rows still comes back as a real
// zero instead of being dropped by the join.
async function entriesSeries(pool: Pool, metric: EntriesMetric, period: EntriesPeriod): Promise<EntriesPoint[]> {
  const { bucketTrunc, generateSeries, labelFormat } = PERIOD_CONFIG[period];
  const joinCondition =
    metric === "LEADS"
      ? `date_trunc('${bucketTrunc}', t.created_at) = b.bucket AND t.archived_at IS NULL`
      : `date_trunc('${bucketTrunc}', t.created_at) = b.bucket`;

  const { rows } = await pool.query<{ label: string; value: string }>(
    `WITH buckets AS (SELECT ${generateSeries} AS bucket)
     SELECT to_char(b.bucket, '${labelFormat}') AS label, count(t.id) AS value
     FROM buckets b
     LEFT JOIN ${metric === "LEADS" ? "leads" : "sales"} t ON ${joinCondition}
     GROUP BY b.bucket
     ORDER BY b.bucket`,
  );
  return rows.map((r) => ({ label: r.label, value: Number(r.value) }));
}

export async function getEntriesTimeSeries(pool: Pool, metric: EntriesMetric, period: EntriesPeriod): Promise<EntriesPoint[]> {
  return entriesSeries(pool, metric, period);
}
