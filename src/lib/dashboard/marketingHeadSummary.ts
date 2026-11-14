import type { Pool } from "pg";
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

// The period-scoped counterpart to marketingHead.ts's all-time dashboard
// query — same 8 numbers the welcome row's stat tiles show, but filtered
// to the period picked in SuperAdminPeriodDropdown. Qualified/Converted/
// Awaiting review are scoped by when the lead was *created* (leads have
// no per-status-change timestamp to scope by instead), matching how
// superAdminSummary.ts already scopes its own lead counts.
export async function getMarketingHeadPeriodSummary(pool: Pool, period: SummaryPeriod) {
  const since = PERIOD_SINCE_SQL[period];
  const until = PERIOD_UNTIL_SQL[period];

  const [total, pendingReview, qualified, converted, visits, transfers] = await Promise.all([
    pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE created_at >= ${since} AND archived_at IS NULL`),
    pool.query<{ count: string }>(
      `SELECT count(*) FROM leads WHERE status = 'PENDING_REVIEW' AND created_at >= ${since} AND archived_at IS NULL`,
    ),
    pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE status = 'QUALIFIED' AND created_at >= ${since}`),
    pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE status = 'CONVERTED' AND created_at >= ${since}`),
    pool.query<{ upcoming: string; missed: string }>(
      `SELECT
         count(*) FILTER (WHERE status IN ('SCHEDULED', 'RESCHEDULED') AND visit_date >= current_date AND visit_date <= ${until}) AS upcoming,
         count(*) FILTER (WHERE status = 'MISSED' AND visit_date >= ${since}) AS missed
       FROM client_visits`,
    ),
    pool.query<{ count: string }>(`SELECT count(*) FROM lead_transfer_history WHERE transferred_at >= ${since}`),
  ]);

  const totalLeads = Number(total.rows[0].count);
  const convertedLeads = Number(converted.rows[0].count);

  return {
    totalLeads,
    pendingReviewLeads: Number(pendingReview.rows[0].count),
    qualifiedLeads: Number(qualified.rows[0].count),
    convertedLeads,
    upcomingVisits: Number(visits.rows[0].upcoming),
    missedVisits: Number(visits.rows[0].missed),
    transferHistoryCount: Number(transfers.rows[0].count),
    conversionRate: totalLeads === 0 ? 0 : convertedLeads / totalLeads,
  };
}
