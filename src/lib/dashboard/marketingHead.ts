import type { Pool } from "pg";
import { listTasks } from "@/lib/tasks/crud";
import { leadVisibleSql } from "@/lib/leads/visibility";

// Scoped to the leads the Marketing Head can see (created, owns, or shared
// with them) — only Super Admin sees the whole company.
export async function getMarketingHeadDashboard(pool: Pool, viewerId: number) {
  const vis = leadVisibleSql("leads", "$1");
  const visL = leadVisibleSql("l", "$1");
  const v = [viewerId];
  const [total, pendingReview, byPriority, qualified, converted, visits, transfers, byPreSalesOwner, bySalespersonOwner] =
    await Promise.all([
      pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE archived_at IS NULL AND ${vis}`, v),
      pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE status = 'PENDING_REVIEW' AND archived_at IS NULL AND ${vis}`, v),
      pool.query<{ priority: string; count: string }>(`SELECT priority, count(*) FROM leads WHERE archived_at IS NULL AND ${vis} GROUP BY priority`, v),
      pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE status = 'QUALIFIED' AND ${vis}`, v),
      pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE status = 'CONVERTED' AND ${vis}`, v),
      pool.query<{ upcoming: string; missed: string }>(
        `SELECT
           count(*) FILTER (WHERE cv.status IN ('SCHEDULED', 'RESCHEDULED') AND cv.visit_date >= current_date) AS upcoming,
           count(*) FILTER (WHERE cv.status = 'MISSED') AS missed
         FROM client_visits cv JOIN leads l ON l.id = cv.lead_id WHERE ${visL}`,
        v,
      ),
      pool.query<{ count: string }>(`SELECT count(*) FROM lead_transfer_history h JOIN leads l ON l.id = h.lead_id WHERE ${visL}`, v),
      pool.query<{ name: string; count: string }>(
        `SELECT u.name, count(*) FROM leads l JOIN users u ON u.id = l.pre_sales_owner_id
         WHERE l.archived_at IS NULL AND ${visL} GROUP BY u.name`,
        v,
      ),
      pool.query<{ name: string; count: string }>(
        `SELECT u.name, count(*) FROM leads l JOIN users u ON u.id = l.salesperson_owner_id
         WHERE l.archived_at IS NULL AND ${visL} GROUP BY u.name`,
        v,
      ),
    ]);

  // listTasks never filters by viewer.id for MARKETING_HEAD/SUPER_ADMIN —
  // the id here is unused, not a real actor.
  const overdueTasks = await listTasks(pool, { id: -1, role: "MARKETING_HEAD" }, { dueWithin: "OVERDUE" });

  const totalLeads = Number(total.rows[0].count);
  const convertedLeads = Number(converted.rows[0].count);

  return {
    totalLeads,
    pendingReviewLeads: Number(pendingReview.rows[0].count),
    leadsByPriority: Object.fromEntries(byPriority.rows.map((r) => [r.priority, Number(r.count)])),
    leadsByPreSalesOwner: Object.fromEntries(byPreSalesOwner.rows.map((r) => [r.name, Number(r.count)])),
    leadsBySalespersonOwner: Object.fromEntries(bySalespersonOwner.rows.map((r) => [r.name, Number(r.count)])),
    qualifiedLeads: Number(qualified.rows[0].count),
    convertedLeads,
    upcomingVisits: Number(visits.rows[0].upcoming),
    missedVisits: Number(visits.rows[0].missed),
    overdueTasks,
    transferHistoryCount: Number(transfers.rows[0].count),
    conversionRate: totalLeads === 0 ? 0 : convertedLeads / totalLeads,
  };
}
