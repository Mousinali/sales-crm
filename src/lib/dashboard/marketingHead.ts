import type { Pool } from "pg";
import { listTasks } from "@/lib/tasks/crud";

export async function getMarketingHeadDashboard(pool: Pool) {
  const [total, pendingReview, byStatus, bySource, byPriority, qualified, converted, visits, transfers] =
    await Promise.all([
      pool.query<{ count: string }>("SELECT count(*) FROM leads WHERE archived_at IS NULL"),
      pool.query<{ count: string }>("SELECT count(*) FROM leads WHERE status = 'PENDING_REVIEW' AND archived_at IS NULL"),
      pool.query<{ status: string; count: string }>("SELECT status, count(*) FROM leads WHERE archived_at IS NULL GROUP BY status"),
      pool.query<{ lead_source: string; count: string }>("SELECT lead_source, count(*) FROM leads WHERE archived_at IS NULL GROUP BY lead_source"),
      pool.query<{ priority: string; count: string }>("SELECT priority, count(*) FROM leads WHERE archived_at IS NULL GROUP BY priority"),
      pool.query<{ count: string }>("SELECT count(*) FROM leads WHERE status = 'QUALIFIED'"),
      pool.query<{ count: string }>("SELECT count(*) FROM leads WHERE status = 'CONVERTED'"),
      pool.query<{ upcoming: string; missed: string }>(
        `SELECT
           count(*) FILTER (WHERE status = 'SCHEDULED' AND visit_date >= current_date) AS upcoming,
           count(*) FILTER (WHERE status = 'MISSED') AS missed
         FROM client_visits`,
      ),
      pool.query<{ count: string }>("SELECT count(*) FROM lead_transfer_history"),
    ]);

  // listTasks never filters by viewer.id for MARKETING_HEAD/SUPER_ADMIN —
  // the id here is unused, not a real actor.
  const overdueTasks = await listTasks(pool, { id: -1, role: "MARKETING_HEAD" }, { dueWithin: "OVERDUE" });

  const totalLeads = Number(total.rows[0].count);
  const convertedLeads = Number(converted.rows[0].count);

  return {
    totalLeads,
    pendingReviewLeads: Number(pendingReview.rows[0].count),
    leadsByStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, Number(r.count)])),
    leadsBySource: Object.fromEntries(bySource.rows.map((r) => [r.lead_source, Number(r.count)])),
    leadsByPriority: Object.fromEntries(byPriority.rows.map((r) => [r.priority, Number(r.count)])),
    qualifiedLeads: Number(qualified.rows[0].count),
    convertedLeads,
    upcomingVisits: Number(visits.rows[0].upcoming),
    missedVisits: Number(visits.rows[0].missed),
    overdueTasks,
    transferHistoryCount: Number(transfers.rows[0].count),
    conversionRate: totalLeads === 0 ? 0 : convertedLeads / totalLeads,
  };
}
