import type { Pool } from "pg";
import { listLeads } from "@/lib/leads/list";
import { listTasks } from "@/lib/tasks/crud";
import type { SummaryPeriod } from "@/lib/dashboard/superAdminSummary";
import { periodSinceDate, periodUntilDate } from "@/lib/dashboard/periodDates";

// The period-scoped counterpart to salesperson.ts's all-time dashboard
// query, for the welcome row's 6 stat tiles. "Due today" stays fixed to
// today regardless of period, same reasoning as preSalesSummary.ts's
// "Follow-ups due today" — only "assigned leads"/"won"/"lost" (scoped by
// when the lead was created) and "upcoming visits" (scoped by how far
// forward the period's horizon reaches) actually change.
export async function getSalespersonPeriodSummary(pool: Pool, userId: number, period: SummaryPeriod) {
  const since = periodSinceDate(period);
  const until = periodUntilDate(period);

  const [leads, upcomingVisits, dueToday, overdueTasks] = await Promise.all([
    listLeads(pool, { id: userId, role: "SALESPERSON" }, { dateFrom: since }),
    pool.query<{ count: string }>(
      `SELECT count(*) FROM client_visits
       WHERE salesperson_id = $1 AND status IN ('SCHEDULED', 'RESCHEDULED')
         AND visit_date >= current_date AND visit_date <= COALESCE($2::date, 'infinity'::date)`,
      [userId, until ?? null],
    ),
    listTasks(pool, { id: userId, role: "SALESPERSON" }, { dueWithin: "TODAY" }),
    listTasks(pool, { id: userId, role: "SALESPERSON" }, { dueWithin: "OVERDUE" }),
  ]);

  const leadsByStatus: Record<string, number> = {};
  for (const lead of leads) {
    leadsByStatus[lead.status] = (leadsByStatus[lead.status] ?? 0) + 1;
  }

  return {
    assignedLeads: leads.length,
    upcomingVisits: Number(upcomingVisits.rows[0].count),
    dueToday: dueToday.length,
    overdue: overdueTasks.length,
    wonCount: leadsByStatus["CLOSED_WON"] ?? 0,
    lostCount: leadsByStatus["CLOSED_LOST"] ?? 0,
  };
}
