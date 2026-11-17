import type { Pool } from "pg";
import { leadVisibleSql } from "@/lib/leads/visibility";
import { getMySalesAndPayments } from "@/lib/dashboard/mySales";
import { PERIOD_SINCE_SQL, type SummaryPeriod } from "@/lib/dashboard/superAdminSummary";

// "Upcoming" visits look forward from today rather than back from it, so
// they need a forward horizon instead of PERIOD_SINCE_SQL's backward one
// — TODAY means just today, WEEK/MONTH mean the next 7/30 days inclusive,
// ALL_TIME means no upper bound at all. Exported so salespersonSummary.ts's
// own "upcoming visits" tile uses the identical horizon.
export const PERIOD_UNTIL_SQL: Record<SummaryPeriod, string> = {
  TODAY: "current_date",
  WEEK: "current_date + interval '6 days'",
  MONTH: "current_date + interval '29 days'",
  ALL_TIME: "'infinity'::date",
};

// Period-scoped numbers for the Marketing Head welcome row's 4 stat tiles.
// Leads are scoped by when the lead was created, visits by visit date, both
// limited to the leads this Marketing Head can see (not the whole company).
export async function getMarketingHeadPeriodSummary(pool: Pool, userId: number, period: SummaryPeriod) {
  const since = PERIOD_SINCE_SQL[period];

  const [total, visits, money] = await Promise.all([
    pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE created_at >= ${since} AND archived_at IS NULL AND ${leadVisibleSql("leads", "$1")}`, [userId]),
    pool.query<{ count: string }>(
      `SELECT count(*) FROM client_visits cv JOIN leads l ON l.id = cv.lead_id WHERE cv.visit_date >= ${since} AND ${leadVisibleSql("l", "$1")}`,
      [userId],
    ),
    getMySalesAndPayments(pool, userId, period),
  ]);

  return {
    totalLeads: Number(total.rows[0].count),
    totalVisits: Number(visits.rows[0].count),
    ...money,
  };
}
