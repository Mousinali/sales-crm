import type { Pool } from "pg";
import { toPagedResult, type PageParams } from "@/lib/pagination";
import { CREDITED_ID, RANGE_SINCE_SQL, type RankingRange } from "@/lib/dashboard/topClients";

export const METRICS = ["sales", "payments"] as const;
export type Metric = (typeof METRICS)[number];
export const DIMENSIONS = ["client", "employee", "industry", "category"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

// Each dimension is a [group key, display label] pair over the sale `s`, its
// credited employee `u` and its lead `l`. Employee and category inner-join
// `u`, so custom-name sales (no employee to credit) drop out of those two.
// A sale with no lead, or a lead with no industry, is grouped as "Unknown".
export const DIMENSION_SQL: Record<Dimension, { key: string; label: string; join: string }> = {
  client: { key: "lower(trim(s.company_name))", label: "min(s.company_name)", join: "" },
  employee: { key: "u.id", label: "min(u.name)", join: `JOIN users u ON u.id = ${CREDITED_ID}` },
  industry: {
    key: "COALESCE(NULLIF(trim(l.industry), ''), 'Unknown')",
    label: "COALESCE(NULLIF(trim(min(l.industry)), ''), 'Unknown')",
    join: "LEFT JOIN leads l ON l.id = s.lead_id",
  },
  category: { key: "u.role", label: "min(u.role)", join: `JOIN users u ON u.id = ${CREDITED_ID}` },
};

// Both metrics look at the sales made in the period, with what has been paid
// against them so far (due = sales - paid). The sales view ranks groups by
// sales, the payments view by amount paid.
const ORDER_BY: Record<Metric, string> = { sales: "SUM(s.budget_amount)", payments: "COALESCE(SUM(pay.paid), 0)" };

// Per sale, what is still due and what was paid beyond the sale amount
// ("excess"), summed up — so one overpaid sale doesn't hide another's balance.
const DUE_SQL = "GREATEST(s.budget_amount - COALESCE(pay.paid, 0), 0)";
const EXCESS_SQL = "GREATEST(COALESCE(pay.paid, 0) - s.budget_amount, 0)";

export async function getPerformance(pool: Pool, metric: Metric, dimension: Dimension, range: RankingRange, params: PageParams) {
  const d = DIMENSION_SQL[dimension];
  // The window columns carry the totals over every group, not just this page.
  const { rows } = await pool.query<{
    label: string; key: string; sales: string; paid: string; due: string; excess: string; count: string;
    total_count: number; grand_sales: string; grand_paid: string; grand_due: string; grand_excess: string; grand_count: string;
  }>(
    `SELECT ${d.label} AS label, (${d.key})::text AS key, SUM(s.budget_amount) AS sales, COALESCE(SUM(pay.paid), 0) AS paid,
            SUM(${DUE_SQL}) AS due, SUM(${EXCESS_SQL}) AS excess, count(*) AS count,
            count(*) OVER() AS total_count, SUM(SUM(s.budget_amount)) OVER() AS grand_sales,
            SUM(COALESCE(SUM(pay.paid), 0)) OVER() AS grand_paid, SUM(SUM(${DUE_SQL})) OVER() AS grand_due,
            SUM(SUM(${EXCESS_SQL})) OVER() AS grand_excess, SUM(count(*)) OVER() AS grand_count
     FROM sales s
     LEFT JOIN (SELECT sale_id, SUM(amount) AS paid FROM sale_payments GROUP BY sale_id) pay ON pay.sale_id = s.id
     ${d.join}
     WHERE s.sale_date >= ${RANGE_SINCE_SQL[range]}
     GROUP BY ${d.key} ORDER BY ${ORDER_BY[metric]} DESC, ${d.key} LIMIT $1 OFFSET $2`,
    [params.pageSize, (params.page - 1) * params.pageSize],
  );
  const paged = toPagedResult(
    rows.map((r) => ({
      label: r.label, key: r.key, sales: Number(r.sales), paid: Number(r.paid), due: Number(r.due), excess: Number(r.excess),
      count: Number(r.count), total_count: Number(r.total_count),
    })),
    params,
  );
  const first = rows[0];
  return {
    ...paged,
    grandSales: Number(first?.grand_sales ?? 0),
    grandPaid: Number(first?.grand_paid ?? 0),
    grandDue: Number(first?.grand_due ?? 0),
    grandExcess: Number(first?.grand_excess ?? 0),
    grandCount: Number(first?.grand_count ?? 0),
  };
}

const EVENT_LIMIT = 30;

// Drill-down for one group (a client, employee, industry or category) from
// the table above: its sales for the period, paged, and a merged activity
// timeline (sales recorded, payments received, lead activity on those
// sales' leads), newest first.
export async function getGroupDetail(pool: Pool, dimension: Dimension, key: string, range: RankingRange, params: PageParams) {
  const d = DIMENSION_SQL[dimension];
  const scope = `FROM sales s ${d.join} WHERE s.sale_date >= ${RANGE_SINCE_SQL[range]} AND (${d.key})::text = $1`;

  const [sales, totals, events] = await Promise.all([
    pool.query<{ id: string; sale_number: string | null; company_name: string; sale_date: Date; budget_amount: string; paid: string; owner: string | null }>(
      `SELECT s.id, s.sale_number, s.company_name, s.sale_date, s.budget_amount,
              COALESCE((SELECT SUM(sp.amount) FROM sale_payments sp WHERE sp.sale_id = s.id), 0) AS paid,
              (SELECT o.name FROM users o WHERE o.id = ${CREDITED_ID}) AS owner
       ${scope} ORDER BY s.sale_date DESC, s.id DESC LIMIT $2 OFFSET $3`,
      [key, params.pageSize, (params.page - 1) * params.pageSize],
    ),
    pool.query<{ sales: string; paid: string; due: string; excess: string; count: string }>(
      `SELECT COALESCE(SUM(t.budget_amount), 0) AS sales, count(*) AS count, COALESCE(SUM(t.paid), 0) AS paid,
              COALESCE(SUM(GREATEST(t.budget_amount - t.paid, 0)), 0) AS due, COALESCE(SUM(GREATEST(t.paid - t.budget_amount, 0)), 0) AS excess
       FROM (SELECT s.budget_amount, COALESCE((SELECT SUM(sp.amount) FROM sale_payments sp WHERE sp.sale_id = s.id), 0) AS paid ${scope}) t`,
      [key],
    ),
    pool.query<{ id: string; kind: string; at: Date; title: string; description: string | null; actor: string | null }>(
      `WITH g AS (SELECT s.id, s.lead_id, s.sale_number, s.company_name, s.budget_amount, s.created_at, s.created_by ${scope})
       (SELECT 'sale-' || g.id AS id, 'SALE' AS kind, g.created_at AS at,
               'Sale ' || COALESCE(g.sale_number, '#' || g.id) || ' recorded for ' || g.company_name AS title,
               '₹' || g.budget_amount::text AS description, (SELECT name FROM users WHERE id = g.created_by) AS actor
        FROM g ORDER BY g.created_at DESC LIMIT ${EVENT_LIMIT})
       UNION ALL
       (SELECT 'pay-' || sp.id, 'PAYMENT', sp.created_at,
               '₹' || sp.amount::text || ' received for ' || COALESCE(g.sale_number, '#' || g.id),
               sp.payment_method, (SELECT name FROM users WHERE id = sp.recorded_by)
        FROM sale_payments sp JOIN g ON g.id = sp.sale_id ORDER BY sp.created_at DESC LIMIT ${EVENT_LIMIT})
       UNION ALL
       (SELECT 'act-' || la.id, 'LEAD', la.created_at, initcap(replace(lower(la.type), '_', ' ')) || ' on ' || g.company_name,
               la.notes, (SELECT name FROM users WHERE id = la.actor_user_id)
        FROM lead_activities la JOIN g ON g.lead_id = la.lead_id ORDER BY la.created_at DESC LIMIT ${EVENT_LIMIT})
       ORDER BY at DESC LIMIT ${EVENT_LIMIT}`,
      [key],
    ),
  ]);

  const total = Number(totals.rows[0].count);
  const sum = Number(totals.rows[0].sales);
  const paid = Number(totals.rows[0].paid);
  return {
    totals: { sales: sum, paid, due: Number(totals.rows[0].due), excess: Number(totals.rows[0].excess), count: total },
    sales: {
      items: sales.rows.map((r) => ({
        id: Number(r.id), saleNumber: r.sale_number, company: r.company_name, saleDate: r.sale_date,
        amount: Number(r.budget_amount), paid: Number(r.paid), owner: r.owner,
      })),
      page: params.page, pageSize: params.pageSize, total, totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    },
    events: events.rows.map((r) => ({ id: r.id, kind: r.kind, at: r.at, title: r.title, description: r.description, actor: r.actor })),
  };
}
